import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import type { PedidoLineaInput } from "@/lib/server/catalog-pedidos";
import { assertRole, audit, loadPedido, mapProducto } from "@/lib/server/context";
import { hayReserva, reservarLineas, soltarReserva } from "@/lib/server/stock";
import type { Pedido, PedidoEstado, Producto, Staff } from "@/lib/types";

export async function listPedidosForStaff(
  staff: Staff,
  input: { mine?: boolean; estados?: PedidoEstado[] } = {},
): Promise<Pedido[]> {
  const sql = await getSql();
  const estados = input.estados;
  let rows: { id: string }[] = [];
  if (input.mine) {
    rows = await sql<{ id: string }>`
      select id from pedidos
      where tenant_id = ${staff.tenantId} and vendedor_id = ${staff.id}
      order by created_at desc
      limit 40
    `;
  } else if (estados && estados.length) {
    rows = await sql.query<{ id: string }>(
      `select id from pedidos
       where tenant_id = $1 and estado = any($2::text[])
       order by created_at desc
       limit 60`,
      [staff.tenantId, estados],
    );
  } else {
    rows = await sql<{ id: string }>`
      select id from pedidos
      where tenant_id = ${staff.tenantId}
      order by created_at desc
      limit 40
    `;
  }
  const out: Pedido[] = [];
  for (const r of rows) {
    const p = await loadPedido(r.id, staff.tenantId);
    if (p) out.push(p);
  }
  return out;
}

export async function getPedidoForStaff(staff: Staff, id: string): Promise<Pedido | null> {
  return loadPedido(id, staff.tenantId);
}

export async function updatePedidoEstadoForStaff(
  staff: Staff,
  input: { id: string; estado: PedidoEstado },
): Promise<Pedido | null> {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  await sql`
    update pedidos set estado = ${input.estado}, updated_at = now()
    where id = ${input.id} and tenant_id = ${staff.tenantId}
  `;
  await audit(staff.tenantId, staff, "cambio_estado", "pedido", input);
  return loadPedido(input.id, staff.tenantId);
}

export async function marcarEntregadoForStaff(staff: Staff, id: string) {
  assertRole(staff, ["admin", "cajero", "vendedor"]);
  const pedido = await loadPedido(id, staff.tenantId);
  if (!pedido) throw new Error("Pedido no encontrado.");
  if (pedido.estado !== "cobrado") throw new Error("Solo se entrega un pedido ya cobrado.");
  const sql = await getSql();
  await sql`
    update pedidos set estado = 'entregado', updated_at = now()
    where id = ${id} and tenant_id = ${staff.tenantId}
  `;
  await audit(staff.tenantId, staff, "entregar", "pedido", { id });
  return { ok: true as const };
}

export async function updatePedidoItemsForStaff(
  staff: Staff,
  input: { id: string; items: PedidoLineaInput[] },
): Promise<Pedido | null> {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const pedido = await loadPedido(input.id, staff.tenantId);
  if (!pedido) throw new Error("Pedido no encontrado.");
  if (pedido.estado === "cobrado" || pedido.estado === "anulado") {
    throw new Error("Este pedido ya no se puede editar.");
  }
  const reservado = await hayReserva(staff.tenantId, input.id);
  if (reservado) await soltarReserva(staff.tenantId, input.id);
  await sql`delete from pedido_items where pedido_id = ${input.id}`;
  const productos = await sql<{
    id: string;
    nombre: string;
    unidad: Producto["unidad"];
    unidad_label: string;
    precio: unknown;
    stock: unknown;
    stock_minimo: unknown;
    alias: unknown;
    activo: boolean;
  }>`select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo from productos where tenant_id = ${staff.tenantId}`;
  const byId = new Map(productos.map((p) => [p.id, mapProducto(p)]));
  for (const line of input.items) {
    const prod = byId.get(line.productoId);
    if (!prod || line.cantidad <= 0) continue;
    await sql`
      insert into pedido_items (
        id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
      ) values (
        ${newId("itm")}, ${input.id}, ${prod.id}, ${prod.nombre}, ${line.cantidad},
        ${prod.precio}, ${prod.unidad}, ${prod.unidadLabel}
      )
    `;
  }
  await sql`update pedidos set updated_at = now() where id = ${input.id}`;
  if (reservado) {
    await reservarLineas(
      staff.tenantId,
      input.id,
      input.items.filter((line) => line.cantidad > 0),
    );
  }
  await audit(staff.tenantId, staff, "modificar_pedido", "pedido", { id: input.id });
  return loadPedido(input.id, staff.tenantId);
}
