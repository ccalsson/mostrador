import { getSql } from "@/lib/db";
import { TENANT_ID, TENANT_NOMBRE, TENANT_PIE } from "@/lib/catalog";
import { num } from "@/lib/money";
import type { Pedido, PedidoItem, Producto, Rol, Staff, Tenant } from "@/lib/types";

export async function getTenant(): Promise<Tenant> {
  const sql = await getSql();
  const rows = await sql<{ id: string; nombre: string; config: unknown }>`
    select id, nombre, config from tenants where id = ${TENANT_ID}
  `;
  const row = rows[0];
  const config =
    typeof row?.config === "string"
      ? (JSON.parse(row.config) as { pieTicket?: string })
      : ((row?.config as { pieTicket?: string } | null) ?? {});
  return {
    id: row?.id ?? TENANT_ID,
    nombre: row?.nombre ?? TENANT_NOMBRE,
    pieTicket: config.pieTicket ?? TENANT_PIE,
  };
}

export async function loadStaffByUserId(userId: string): Promise<Staff | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    tenant_id: string;
    user_id: string;
    nombre: string;
    email: string;
    rol: Rol;
    activo: boolean;
  }>`
    select id, tenant_id, user_id, nombre, email, rol, activo
    from staff
    where user_id = ${userId}
    limit 1
  `;
  const r = rows[0];
  if (!r || !r.activo) return null;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    nombre: r.nombre,
    email: r.email,
    rol: r.rol,
    activo: r.activo,
  };
}

export function assertRole(staff: Staff, roles: Rol[]) {
  if (staff.rol === "admin") return;
  if (!roles.includes(staff.rol)) {
    throw new Error("No tenés permiso para esta acción.");
  }
}

export function mapProducto(r: {
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
}): Producto {
  const alias = parseAlias(r.alias);
  const stock = num(r.stock);
  const stockMinimo = num(r.stock_minimo);
  return {
    id: r.id,
    nombre: r.nombre,
    unidad: r.unidad,
    unidadLabel: r.unidad_label,
    precio: num(r.precio),
    stock,
    stockMinimo,
    alias,
    activo: r.activo,
    stockBajo: stock <= stockMinimo,
    orden: r.orden == null ? null : num(r.orden),
  };
}

function parseAlias(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function loadPedido(pedidoId: string, tenantId: string): Promise<Pedido | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    client_uuid: string;
    vendedor_id: string | null;
    vendedor_nombre: string | null;
    cliente_id: string | null;
    cliente_nombre: string;
    estado: Pedido["estado"];
    nota: string | null;
    forma_pago: Pedido["formaPago"];
    comprobante_nombre: string | null;
    created_at: string;
    updated_at: string;
  }>`
    select p.id, p.client_uuid, p.vendedor_id, s.nombre as vendedor_nombre,
           p.cliente_id, p.cliente_nombre, p.estado, p.nota, p.forma_pago, p.comprobante_nombre,
           p.created_at::text as created_at, p.updated_at::text as updated_at
    from pedidos p
    left join staff s on s.id = p.vendedor_id
    where p.id = ${pedidoId} and p.tenant_id = ${tenantId}
    limit 1
  `;
  const p = rows[0];
  if (!p) return null;
  const items = await loadItems(p.id);
  const total = items.reduce((acc, it) => acc + it.subtotal, 0);
  return {
    id: p.id,
    clientUuid: p.client_uuid,
    vendedorId: p.vendedor_id,
    vendedorNombre: p.vendedor_nombre,
    clienteId: p.cliente_id,
    clienteNombre: p.cliente_nombre,
    estado: p.estado,
    nota: p.nota,
    formaPago: p.forma_pago ?? null,
    comprobanteNombre: p.comprobante_nombre,
    items,
    total,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export async function loadItems(pedidoId: string): Promise<PedidoItem[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    producto_id: string;
    nombre_snapshot: string;
    cantidad: unknown;
    precio_unitario: unknown;
    unidad: PedidoItem["unidad"];
    unidad_label: string;
  }>`
    select id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
    from pedido_items
    where pedido_id = ${pedidoId}
    order by nombre_snapshot
  `;
  return rows.map((r) => {
    const cantidad = num(r.cantidad);
    const precioUnitario = num(r.precio_unitario);
    return {
      id: r.id,
      productoId: r.producto_id,
      nombre: r.nombre_snapshot,
      cantidad,
      precioUnitario,
      unidad: r.unidad,
      unidadLabel: r.unidad_label,
      subtotal: Math.round(cantidad * precioUnitario * 100) / 100,
    };
  });
}

export async function audit(
  tenantId: string,
  staff: Staff | null,
  accion: string,
  entidad: string,
  detalle: Record<string, unknown>,
) {
  const sql = await getSql();
  const { newId } = await import("@/lib/ids");
  await sql.query(
    `insert into auditoria (id, tenant_id, usuario_id, usuario_nombre, accion, entidad, detalle)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      newId("aud"),
      tenantId,
      staff?.id ?? null,
      staff?.nombre ?? null,
      accion,
      entidad,
      JSON.stringify(detalle),
    ],
  );
}
