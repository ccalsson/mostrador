import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { audit, assertRole, loadPedido, mapProducto } from "@/lib/server/context";
import type { Pedido, PedidoEstado, Producto, Staff } from "@/lib/types";

export type PedidoLineaInput = { productoId: string; cantidad: number };

export type CrearPedidoInput = {
  clientUuid: string;
  clienteId?: string | null;
  clienteNombre: string;
  nota?: string;
  items: PedidoLineaInput[];
};

export type CatalogoSincronizado = {
  version: string | null;
  productos: Producto[];
};

type ProductoRow = {
  id: string;
  nombre: string;
  unidad: Producto["unidad"];
  unidad_label: string;
  precio: unknown;
  stock: unknown;
  stock_minimo: unknown;
  alias: unknown;
  activo: boolean;
  orden?: unknown;
};

/** Shared read model for the web client and the mobile API. */
export async function listProductosForStaff(staff: Staff): Promise<Producto[]> {
  const sql = await getSql();
  const rows = await sql<ProductoRow>`
    select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, orden
    from productos
    where tenant_id = ${staff.tenantId}
    order by orden nulls last, lower(nombre)
  `;
  return rows.map(mapProducto);
}

/**
 * Low-cost catalog synchronization. A client persists `version` and asks for
 * changes since that instant; `>=` deliberately permits an occasional repeated
 * row at the boundary, which is safe for local upserts and cannot miss a write.
 */
export async function syncCatalogoForStaff(
  staff: Staff,
  since?: string,
): Promise<CatalogoSincronizado> {
  const sql = await getSql();
  const latest = await sql<{ version: string | null }>`
    select max(updated_at)::text as version
    from productos
    where tenant_id = ${staff.tenantId}
  `;
  const version = latest[0]?.version ?? null;
  if (since && version && version <= since) return { version, productos: [] };
  const rows = since
    ? await sql<ProductoRow>`
        select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, orden
        from productos
        where tenant_id = ${staff.tenantId} and updated_at >= ${since}::timestamptz
        order by orden nulls last, lower(nombre)
      `
    : await sql<ProductoRow>`
        select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, orden
        from productos
        where tenant_id = ${staff.tenantId}
        order by orden nulls last, lower(nombre)
      `;
  return { version, productos: rows.map(mapProducto) };
}

/**
 * Creates a seller order with the existing database idempotency contract.
 * The unique `(tenant_id, client_uuid)` constraint is the final authority;
 * the lookup avoids needless writes on normal offline retries.
 */
export async function crearPedidoForStaff(staff: Staff, input: CrearPedidoInput): Promise<Pedido> {
  assertRole(staff, ["vendedor", "cajero"]);
  if (input.items.length === 0) throw new Error("El pedido no tiene productos.");
  const sql = await getSql();
  const rows = await sql<ProductoRow>`
    select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, orden
    from productos
    where tenant_id = ${staff.tenantId}
  `;
  const productos = new Map(rows.map((row) => [row.id, mapProducto(row)]));
  const pedidoId = newId("ped");
  const estado: PedidoEstado = "enviado";
  const vendedorId = staff.rol === "cajero" ? null : staff.id;

  const inserted = await sql<{ id: string }>`
    insert into pedidos (
      id, tenant_id, client_uuid, vendedor_id, cliente_id, cliente_nombre, estado, nota
    ) values (
      ${pedidoId}, ${staff.tenantId}, ${input.clientUuid}, ${vendedorId},
      ${input.clienteId ?? null}, ${input.clienteNombre || "Mostrador"}, ${estado}, ${input.nota ?? null}
    )
    on conflict (tenant_id, client_uuid) do nothing
    returning id
  `;
  if (!inserted[0]) {
    const existing = await sql<{ id: string }>`
      select id from pedidos
      where tenant_id = ${staff.tenantId} and client_uuid = ${input.clientUuid}
      limit 1
    `;
    const pedido = existing[0] && (await loadPedido(existing[0].id, staff.tenantId));
    if (pedido) return pedido;
    throw new Error("No se pudo resolver la idempotencia del pedido.");
  }
  for (const line of input.items) {
    const producto = productos.get(line.productoId);
    if (!producto || line.cantidad <= 0) continue;
    await sql`
      insert into pedido_items (
        id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
      ) values (
        ${newId("itm")}, ${pedidoId}, ${producto.id}, ${producto.nombre}, ${line.cantidad},
        ${producto.precio}, ${producto.unidad}, ${producto.unidadLabel}
      )
    `;
  }
  await audit(staff.tenantId, staff, "crear_pedido", "pedido", { id: pedidoId, estado });
  const pedido = await loadPedido(pedidoId, staff.tenantId);
  if (!pedido) throw new Error("No se pudo crear el pedido.");
  return pedido;
}
