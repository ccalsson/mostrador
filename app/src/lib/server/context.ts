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

export class PermissionError extends Error {
  readonly status = 403;
  constructor() {
    super("No tenés permiso para esta acción.");
    this.name = "PermissionError";
  }
}

export function assertRole(staff: Staff, roles: Rol[]) {
  if (staff.rol === "admin") return;
  if (!roles.includes(staff.rol)) {
    throw new PermissionError();
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
  publicado_online?: unknown;
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
    publicadoOnline: Boolean(r.publicado_online),
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

type PedidoRow = {
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
  picked_up_at: string | null;
  cargador_nombre: string | null;
};

type ItemRow = {
  id: string;
  producto_id: string;
  nombre_snapshot: string;
  cantidad: unknown;
  precio_unitario: unknown;
  unidad: PedidoItem["unidad"];
  unidad_label: string;
};

const PEDIDO_SELECT = `
    select p.id, p.client_uuid, p.vendedor_id, s.nombre as vendedor_nombre,
           p.cliente_id, p.cliente_nombre, p.estado, p.nota, p.forma_pago, p.comprobante_nombre,
           p.created_at::text as created_at, p.updated_at::text as updated_at,
           p.picked_up_at::text as picked_up_at, mc.nombre as cargador_nombre
    from pedidos p
    left join staff s on s.id = p.vendedor_id
    left join mercado_recorrido_pedidos mrp on mrp.pedido_id = p.id
    left join mercado_recorridos mr on mr.id = mrp.recorrido_id
    left join mercado_cargadores mc on mc.id = mr.cargador_id
`;

function mapPedido(p: PedidoRow, items: PedidoItem[]): Pedido {
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
    pickedUpAt: p.picked_up_at,
    cargadorNombre: p.cargador_nombre,
    items,
    total: items.reduce((acc, it) => acc + it.subtotal, 0),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function mapItem(r: ItemRow): PedidoItem {
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
}

export async function loadPedido(pedidoId: string, tenantId: string): Promise<Pedido | null> {
  const sql = await getSql();
  const rows = await sql.query<PedidoRow>(
    `${PEDIDO_SELECT} where p.id = $1 and p.tenant_id = $2 limit 1`,
    [pedidoId, tenantId],
  );
  const p = rows[0];
  if (!p) return null;
  return mapPedido(p, await loadItems(p.id));
}

// Carga varios pedidos en 2 consultas (cabeceras + todas sus líneas) en vez de 2
// por pedido: los listados traen hasta 60 ids y cargarlos de a uno costaba 121
// round-trips a la base. Devuelve los pedidos en el orden de [pedidoIds].
export async function loadPedidos(pedidoIds: string[], tenantId: string): Promise<Pedido[]> {
  if (!pedidoIds.length) return [];
  const sql = await getSql();
  const cabeceras = await sql.query<PedidoRow>(
    `${PEDIDO_SELECT} where p.id = any($1::text[]) and p.tenant_id = $2`,
    [pedidoIds, tenantId],
  );
  const lineas = await sql.query<ItemRow & { pedido_id: string }>(
    `select pedido_id, id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
     from pedido_items
     where pedido_id = any($1::text[])
     order by nombre_snapshot`,
    [pedidoIds],
  );
  const itemsPorPedido = new Map<string, PedidoItem[]>();
  for (const linea of lineas) {
    const item = mapItem(linea);
    const items = itemsPorPedido.get(linea.pedido_id);
    if (items) items.push(item);
    else itemsPorPedido.set(linea.pedido_id, [item]);
  }
  const porId = new Map(cabeceras.map((p) => [p.id, mapPedido(p, itemsPorPedido.get(p.id) ?? [])]));
  const out: Pedido[] = [];
  for (const id of pedidoIds) {
    const pedido = porId.get(id);
    if (pedido) out.push(pedido);
  }
  return out;
}

export async function loadItems(pedidoId: string): Promise<PedidoItem[]> {
  const sql = await getSql();
  const rows = await sql<ItemRow>`
    select id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
    from pedido_items
    where pedido_id = ${pedidoId}
    order by nombre_snapshot
  `;
  return rows.map(mapItem);
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
