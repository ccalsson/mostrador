import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit } from "@/lib/server/context";
import type { MovimientoTipo, Staff } from "@/lib/types";

export async function applyStock(opts: {
  tenantId: string;
  productoId: string;
  tipo: MovimientoTipo;
  cantidad: number;
  referencia: string;
  staff: Staff | null;
}) {
  const sql = await getSql();
  await sql`
    insert into stock_movimientos (id, tenant_id, producto_id, tipo, cantidad, referencia, usuario_id)
    values (
      ${newId("mov")}, ${opts.tenantId}, ${opts.productoId}, ${opts.tipo},
      ${opts.cantidad}, ${opts.referencia}, ${opts.staff?.id ?? null}
    )
  `;
  const updated = await sql<{ stock: unknown; stock_minimo: unknown; nombre: string; unidad_label: string }>`
    update productos
    set stock = stock + ${opts.cantidad}, updated_at = now()
    where id = ${opts.productoId} and tenant_id = ${opts.tenantId}
    returning stock, stock_minimo, nombre, unidad_label
  `;
  const row = updated[0];
  if (!row) return;
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

export async function soltarReserva(tenantId: string, pedidoId: string) {
  const sql = await getSql();
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
    });
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
) {
  const sql = await getSql();
  for (const line of items) {
    if (line.cantidad <= 0) continue;
    const rows = await sql<{ stock: unknown; nombre: string }>`
      select stock, nombre from productos
      where id = ${line.productoId} and tenant_id = ${tenantId}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Hay un producto que ya no está en el catálogo.");
    if (num(row.stock) < line.cantidad) {
      throw new Error(`No alcanza el stock de ${row.nombre}.`);
    }
  }
  for (const line of items) {
    if (line.cantidad <= 0) continue;
    await applyStock({
      tenantId,
      productoId: line.productoId,
      tipo: "reserva",
      cantidad: -line.cantidad,
      referencia: pedidoId,
      staff: null,
    });
  }
}

export async function ajustarStockForStaff(
  staff: Staff,
  input: { productoId: string; cantidad: number; tipo: "ajuste" | "merma"; motivo: string },
) {
  assertRole(staff, ["admin", "cajero"]);
  const signed = input.tipo === "merma" ? -Math.abs(input.cantidad) : input.cantidad;
  await applyStock({
    tenantId: staff.tenantId,
    productoId: input.productoId,
    tipo: input.tipo,
    cantidad: signed,
    referencia: input.motivo,
    staff,
  });
  await audit(staff.tenantId, staff, input.tipo, "stock", input);
  return { ok: true as const };
}

