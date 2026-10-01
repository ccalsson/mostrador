import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit, mapProducto } from "@/lib/server/context";
import { matchProduct } from "@/lib/server/match";
import { applyStock } from "@/lib/server/stock";
import type { Producto, Staff } from "@/lib/types";

export type CrearRemitoInput = {
  proveedor?: string;
  proveedorId?: string;
  fuente: "csv" | "foto" | "manual" | "pdf";
  archivoNombre?: string;
  lineas: { descripcion: string; cantidad: number; precio?: number }[];
};

export async function crearRemitoForStaff(staff: Staff, input: CrearRemitoInput) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const id = newId("rem");
  let proveedor = input.proveedor?.trim() || null;
  let proveedorId: string | null = null;
  if (input.proveedorId) {
    const prov = await sql<{ nombre: string }>`
      select nombre from proveedores
      where id = ${input.proveedorId} and tenant_id = ${staff.tenantId} and activo = true
      limit 1
    `;
    if (!prov[0]) throw new Error("Elegí un proveedor activo.");
    proveedor = prov[0].nombre;
    proveedorId = input.proveedorId;
  }
  await sql`
    insert into remitos (id, tenant_id, proveedor, proveedor_id, fuente, estado, archivo_nombre)
    values (${id}, ${staff.tenantId}, ${proveedor}, ${proveedorId}, ${input.fuente}, ${"procesado"}, ${input.archivoNombre ?? null})
  `;
  const productosRows = await sql<{
    id: string;
    nombre: string;
    unidad: Producto["unidad"];
    unidad_label: string;
    precio: unknown;
    stock: unknown;
    stock_minimo: unknown;
    alias: unknown;
    activo: boolean;
  }>`select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo from productos where tenant_id = ${staff.tenantId} and activo = true`;
  const productos = productosRows.map(mapProducto);
  for (const line of input.lineas) {
    const match = matchProduct(line.descripcion, productos);
    await sql`
      insert into remito_items (
        id, remito_id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
      ) values (
        ${newId("rit")}, ${id}, ${line.descripcion}, ${match.producto?.id ?? null},
        ${line.cantidad}, ${line.precio ?? null}, ${match.score}, ${false}
      )
    `;
  }
  return { id };
}

export async function getRemitoForStaff(staff: Staff, id: string) {
  const sql = await getSql();
  const rem = await sql<{
    id: string;
    proveedor: string | null;
    proveedor_id: string | null;
    fuente: string;
    estado: string;
    archivo_nombre: string | null;
    created_at: string;
  }>`
    select id, proveedor, proveedor_id, fuente, estado, archivo_nombre, created_at::text as created_at
    from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
  `;
  if (!rem[0]) return null;
  const items = await sql<{
    id: string;
    descripcion_original: string;
    producto_id: string | null;
    cantidad: unknown;
    precio: unknown;
    confianza_match: unknown;
    confirmado: boolean;
  }>`
    select id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
    from remito_items where remito_id = ${id} order by descripcion_original
  `;
  return {
    ...rem[0],
    items: items.map((it) => ({
      id: it.id,
      descripcionOriginal: it.descripcion_original,
      productoId: it.producto_id,
      cantidad: num(it.cantidad),
      precio: it.precio == null ? null : num(it.precio),
      confianza: num(it.confianza_match),
      confirmado: it.confirmado,
    })),
  };
}

export async function listRemitosForStaff(staff: Staff) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  return sql<{
    id: string;
    proveedor: string | null;
    fuente: string;
    estado: string;
    created_at: string;
  }>`
    select id, proveedor, fuente, estado, created_at::text as created_at
    from remitos where tenant_id = ${staff.tenantId}
    order by created_at desc
    limit 30
  `;
}

export async function actualizarRemitoItemForStaff(
  staff: Staff,
  input: { id: string; productoId: string | null; cantidad: number; confirmado: boolean },
) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  await sql`
    update remito_items
    set producto_id = ${input.productoId}, cantidad = ${input.cantidad}, confirmado = ${input.confirmado}
    where id = ${input.id}
  `;
  return { ok: true as const };
}

export async function confirmarRemitoForStaff(staff: Staff, id: string) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const rem = await sql<{ estado: string }>`
    select estado from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
  `;
  if (!rem[0]) throw new Error("Remito no encontrado.");
  if (rem[0].estado === "confirmado") return { ok: true as const };
  const items = await sql<{ producto_id: string | null; cantidad: unknown; confirmado: boolean }>`
    select producto_id, cantidad, confirmado from remito_items where remito_id = ${id}
  `;
  const confirmed = items.filter((i) => i.confirmado && i.producto_id);
  if (confirmed.length === 0) throw new Error("Confirmá al menos una línea para ingresar stock.");
  for (const item of confirmed) {
    if (!item.producto_id) continue;
    await applyStock({
      tenantId: staff.tenantId,
      productoId: item.producto_id,
      tipo: "entrada_remito",
      cantidad: num(item.cantidad),
      referencia: id,
      staff,
    });
  }
  await sql`
    update remitos set estado = 'confirmado', confirmado_at = now(), confirmado_por = ${staff.id}
    where id = ${id}
  `;
  await audit(staff.tenantId, staff, "confirmar_remito", "remito", {
    id,
    lineas: confirmed.length,
  });
  return { ok: true as const, lineas: confirmed.length };
}
