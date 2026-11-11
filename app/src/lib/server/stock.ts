import { getSql } from "@/lib/db";
import type { Sql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit } from "@/lib/server/context";
import type { MovimientoTipo, Staff } from "@/lib/types";

/**
 * Aplica un movimiento de stock. Con `clientUuid` la inserción es idempotente
 * sobre `unique (tenant_id, client_uuid)`: un retry de red devuelve `false` y
 * no vuelve a tocar `productos.stock`, que es lo que duplicaba el ajuste.
 */
export async function applyStock(opts: {
  tenantId: string;
  productoId: string;
  tipo: MovimientoTipo;
  cantidad: number;
  referencia: string;
  staff: Staff | null;
  clientUuid?: string;
}, transaction?: Sql): Promise<boolean> {
  const sql = transaction ?? await getSql();
  const inserted = await sql<{ id: string }>`
    insert into stock_movimientos (id, tenant_id, producto_id, tipo, cantidad, referencia, usuario_id, client_uuid)
    values (
      ${newId("mov")}, ${opts.tenantId}, ${opts.productoId}, ${opts.tipo},
      ${opts.cantidad}, ${opts.referencia}, ${opts.staff?.id ?? null}, ${opts.clientUuid ?? null}
    )
    on conflict (tenant_id, client_uuid) do nothing
    returning id
  `;
  if (!inserted[0]) return false;
  const updated = await sql<{ stock: unknown; stock_minimo: unknown; nombre: string; unidad_label: string }>`
    update productos
    set stock = stock + ${opts.cantidad}, updated_at = now()
    where id = ${opts.productoId} and tenant_id = ${opts.tenantId}
    returning stock, stock_minimo, nombre, unidad_label
  `;
  const row = updated[0];
  if (!row) return true;
  const stock = num(row.stock);
  const min = num(row.stock_minimo);
  if (stock <= min) {
    const recent = await sql<{ id: string }>`
      select id from alertas
      where tenant_id = ${opts.tenantId}
        and tipo = 'stock_bajo'
        and mensaje like ${`%${row.nombre}%`}
        and created_at > now() - interval '12 hours'
      limit 1
    `;
    if (!recent[0]) {
      await sql`
        insert into alertas (id, tenant_id, tipo, mensaje, leida)
        values (
          ${newId("alr")},
          ${opts.tenantId},
          ${"stock_bajo"},
          ${`${row.nombre}: stock bajo (${stock} ${row.unidad_label}, mínimo ${min}).`},
          ${false}
        )
      `;
    }
  }
  return true;
}

export async function hayReserva(tenantId: string, pedidoId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from stock_movimientos
    where tenant_id = ${tenantId} and referencia = ${pedidoId} and tipo = 'reserva'
    limit 1
  `;
  return Boolean(rows[0]);
}

export async function soltarReserva(tenantId: string, pedidoId: string, transaction?: Sql) {
  const sql = transaction ?? await getSql();
  const rows = await sql<{ producto_id: string; n: unknown }>`
    select producto_id, sum(cantidad) as n
    from stock_movimientos
    where tenant_id = ${tenantId} and referencia = ${pedidoId} and tipo = 'reserva'
    group by producto_id
  `;
  for (const row of rows) {
    const qty = -num(row.n);
    if (qty <= 0) continue;
    await applyStock({
      tenantId,
      productoId: row.producto_id,
      tipo: "liberacion",
      cantidad: qty,
      referencia: pedidoId,
      staff: null,
    }, transaction);
  }
  await sql`
    delete from stock_movimientos
    where tenant_id = ${tenantId} and referencia = ${pedidoId} and tipo = 'reserva'
  `;
}

export async function reservarLineas(
  tenantId: string,
  pedidoId: string,
  items: { productoId: string; cantidad: number }[],
  transaction?: Sql,
) {
  const sql = transaction ?? await getSql();
  const sortedItems = [...items].sort((a, b) => a.productoId.localeCompare(b.productoId));
  for (const line of sortedItems) {
    if (line.cantidad <= 0) continue;
    const rows = await sql<{ stock: unknown; nombre: string }>`
      select stock, nombre from productos
      where id = ${line.productoId} and tenant_id = ${tenantId}
      limit 1
      for update
    `;
    const row = rows[0];
    if (!row) throw new Error("Hay un producto que ya no está en el catálogo.");
    if (num(row.stock) < line.cantidad) {
      throw new Error(`No alcanza el stock de ${row.nombre}.`);
    }
  }
  for (const line of sortedItems) {
    if (line.cantidad <= 0) continue;
    await applyStock({
      tenantId,
      productoId: line.productoId,
      tipo: "reserva",
      cantidad: -line.cantidad,
      referencia: pedidoId,
      staff: null,
    }, transaction);
  }
}

export async function ajustarStockForStaff(
  staff: Staff,
  input: { productoId: string; cantidad: number; tipo: "ajuste" | "merma"; motivo: string; clientUuid?: string },
) {
  assertRole(staff, ["admin", "cajero"]);
  const signed = input.tipo === "merma" ? -Math.abs(input.cantidad) : input.cantidad;
  const aplicado = await applyStock({
    tenantId: staff.tenantId,
    productoId: input.productoId,
    tipo: input.tipo,
    cantidad: signed,
    referencia: input.motivo,
    staff,
    clientUuid: input.clientUuid,
  });
  if (aplicado) await audit(staff.tenantId, staff, input.tipo, "stock", input);
  return { ok: true as const, duplicado: !aplicado };
}
