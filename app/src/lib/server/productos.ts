import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit } from "@/lib/server/context";
import type { Moneda } from "@/lib/server/moneda";
import { applyStock } from "@/lib/server/stock";
import { puedeAparecer } from "@/lib/torre/presencia";
import type { Producto, Staff } from "@/lib/types";

/**
 * Valida el costo de un producto.
 * Retorna null si es válido (ausente o número positivo), o un mensaje de error.
 */
export function validarCosto(value: unknown): { ok: true; costo: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, costo: null };
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return { ok: false, error: "costo debe ser un número." };
  if (n < 0) return { ok: false, error: "costo debe ser un número positivo." };
  return { ok: true, costo: n };
}

export type SaveProductoInput = {
  id?: string;
  nombre: string;
  unidad: Producto["unidad"];
  unidadLabel: string;
  precio: number;
  costo?: number | null;
  moneda?: Moneda;
  stockMinimo: number;
  alias: string[];
  activo: boolean;
  publicadoOnline?: boolean;
  stockInicial?: number;
};

export async function saveProductoForStaff(staff: Staff, input: SaveProductoInput) {
  assertRole(staff, ["admin"]);
  if (input.publicadoOnline) {
    const presencia = await puedeAparecer(staff.tenantId, { mercadoAlToque: true });
    if (!presencia.tier) throw new Error("Sin Presencia o Pro no se publica en Mercado.");
  }
  const sql = await getSql();
  const id = input.id ?? newId("p");
  if (input.id) {
    const prev = await sql<{ precio: unknown; nombre: string }>`
      select precio, nombre from productos where id = ${input.id} and tenant_id = ${staff.tenantId}
    `;
    await sql.query(
      `update productos
       set nombre=$1, unidad=$2, unidad_label=$3, precio=$4, stock_minimo=$5, alias=$6::jsonb, activo=$7,
           publicado_online = coalesce($8, publicado_online), costo=$11, updated_at=now()
       where id=$9 and tenant_id=$10`,
      [
        input.nombre.trim(),
        input.unidad,
        input.unidadLabel.trim(),
        input.precio,
        input.stockMinimo,
        JSON.stringify(input.alias),
        input.activo,
        input.publicadoOnline ?? null,
        input.id,
        staff.tenantId,
        input.costo ?? null,
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
    const moneda = input.moneda ?? "USD";
    await sql.query(
      `insert into productos (id, tenant_id, nombre, unidad, unidad_label, precio, costo, moneda, stock, stock_minimo, alias, activo, publicado_online)
       values ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10::jsonb,$11,$12)`,
      [
        id,
        staff.tenantId,
        input.nombre.trim(),
        input.unidad,
        input.unidadLabel.trim(),
        input.precio,
        input.costo ?? null,
        moneda,
        input.stockMinimo,
        JSON.stringify(input.alias),
        input.activo,
        input.publicadoOnline ?? false,
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
