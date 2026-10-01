import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit } from "@/lib/server/context";
import { applyStock } from "@/lib/server/stock";
import type { Producto, Staff } from "@/lib/types";

export type SaveProductoInput = {
  id?: string;
  nombre: string;
  unidad: Producto["unidad"];
  unidadLabel: string;
  precio: number;
  stockMinimo: number;
  alias: string[];
  activo: boolean;
  stockInicial?: number;
};

export async function saveProductoForStaff(staff: Staff, input: SaveProductoInput) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const id = input.id ?? newId("p");
  if (input.id) {
    const prev = await sql<{ precio: unknown; nombre: string }>`
      select precio, nombre from productos where id = ${input.id} and tenant_id = ${staff.tenantId}
    `;
    await sql.query(
      `update productos
       set nombre=$1, unidad=$2, unidad_label=$3, precio=$4, stock_minimo=$5, alias=$6::jsonb, activo=$7, updated_at=now()
       where id=$8 and tenant_id=$9`,
      [
        input.nombre.trim(),
        input.unidad,
        input.unidadLabel.trim(),
        input.precio,
        input.stockMinimo,
        JSON.stringify(input.alias),
        input.activo,
        input.id,
        staff.tenantId,
      ],
    );
    if (prev[0] && num(prev[0].precio) !== input.precio) {
      await audit(staff.tenantId, staff, "cambio_precio", "producto", {
        producto: input.nombre,
        de: num(prev[0].precio),
        a: input.precio,
      });
    }
  } else {
    await sql.query(
      `insert into productos (id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo)
       values ($1,$2,$3,$4,$5,$6,0,$7,$8::jsonb,$9)`,
      [
        id,
        staff.tenantId,
        input.nombre.trim(),
        input.unidad,
        input.unidadLabel.trim(),
        input.precio,
        input.stockMinimo,
        JSON.stringify(input.alias),
        input.activo,
      ],
    );
    await audit(staff.tenantId, staff, "alta_producto", "producto", { id, nombre: input.nombre });
    const inicial = Number(input.stockInicial);
    if (Number.isFinite(inicial) && inicial > 0) {
      await applyStock({
        tenantId: staff.tenantId,
        productoId: id,
        tipo: "ajuste",
        cantidad: inicial,
        referencia: "alta en tablero",
        staff,
      });
    }
  }
  return { id };
}

export async function quitarProductoForStaff(staff: Staff, id: string) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{ nombre: string }>`
    update productos set activo = false, updated_at = now()
    where id = ${id} and tenant_id = ${staff.tenantId} and activo = true
    returning nombre
  `;
  if (rows[0]) await audit(staff.tenantId, staff, "baja_producto", "producto", { id, nombre: rows[0].nombre });
  return { ok: true as const };
}

export async function ordenarProductosForStaff(staff: Staff, ids: string[]) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  for (let i = 0; i < ids.length; i += 1) {
    await sql`
      update productos set orden = ${i}, updated_at = now()
      where id = ${ids[i]} and tenant_id = ${staff.tenantId}
    `;
  }
  return { ok: true as const };
}
