import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { assertRole, audit } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

export type Proveedor = {
  id: string;
  nombre: string;
  cuit: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  observaciones: string | null;
  activo: boolean;
};

type ProveedorInput = {
  nombre: string;
  cuit?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  observaciones?: string;
};

export async function listProveedoresForStaff(staff: Staff): Promise<Proveedor[]> {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  return sql<Proveedor>`
    select id, nombre, cuit, telefono, email, direccion, observaciones, activo
    from proveedores
    where tenant_id = ${staff.tenantId}
    order by activo desc, lower(nombre)
  `;
}

export async function createProveedorForStaff(staff: Staff, input: ProveedorInput) {
  assertRole(staff, ["admin"]);
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El proveedor necesita un nombre.");
  const sql = await getSql();
  const id = newId("prv");
  await sql`
    insert into proveedores (id, tenant_id, nombre, cuit, telefono, email, direccion, observaciones, activo)
    values (
      ${id}, ${staff.tenantId}, ${nombre}, ${input.cuit?.trim() || null}, ${input.telefono?.trim() || null},
      ${input.email?.trim() || null}, ${input.direccion?.trim() || null}, ${input.observaciones?.trim() || null}, ${true}
    )
  `;
  await audit(staff.tenantId, staff, "alta_proveedor", "proveedor", { id, nombre });
  return { id };
}

export async function updateProveedorForStaff(staff: Staff, id: string, input: ProveedorInput & { activo: boolean }) {
  assertRole(staff, ["admin"]);
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El proveedor necesita un nombre.");
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update proveedores
    set nombre = ${nombre},
        cuit = ${input.cuit?.trim() || null},
        telefono = ${input.telefono?.trim() || null},
        email = ${input.email?.trim() || null},
        direccion = ${input.direccion?.trim() || null},
        observaciones = ${input.observaciones?.trim() || null},
        activo = ${input.activo}
    where id = ${id} and tenant_id = ${staff.tenantId}
    returning id
  `;
  if (!rows[0]) throw new Error("Proveedor no encontrado.");
  await audit(staff.tenantId, staff, "editar_proveedor", "proveedor", { id });
  return { ok: true as const };
}

export async function productosDelProveedorForStaff(staff: Staff, proveedorId: string) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{ nombre: string }>`
    select distinct p.nombre
    from remito_items ri
    join remitos r on r.id = ri.remito_id
    join productos p on p.id = ri.producto_id
    where r.tenant_id = ${staff.tenantId} and r.proveedor_id = ${proveedorId}
    order by p.nombre
    limit 40
  `;
  return { productos: rows.map((r) => r.nombre) };
}

export async function asignarProveedorRemitoForStaff(staff: Staff, remitoId: string, proveedorId: string) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const prov = await sql<{ nombre: string }>`
    select nombre from proveedores
    where id = ${proveedorId} and tenant_id = ${staff.tenantId} and activo = true
    limit 1
  `;
  if (!prov[0]) throw new Error("Elegí un proveedor activo.");
  const rem = await sql<{ id: string }>`
    update remitos
    set proveedor_id = ${proveedorId}, proveedor = ${prov[0].nombre}
    where id = ${remitoId} and tenant_id = ${staff.tenantId}
    returning id
  `;
  if (!rem[0]) throw new Error("Remito no encontrado.");
  return { ok: true as const };
}
