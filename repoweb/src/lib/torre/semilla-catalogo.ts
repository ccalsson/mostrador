import type { Sql } from "../db.ts";
import { CATALOG } from "../catalog.ts";

/** Carga el catálogo de referencia en un puesto recién creado. Idempotente: el id sale del
 *  par (tenant, nombre), así que relanzar el alta no duplica ni pisa edits posteriores. */
export async function semearCatalogo(sql: Sql, tenantId: string): Promise<number> {
  const filas = CATALOG.map((item) => ({
    tenant_id: tenantId,
    nombre: item.nombre,
    unidad: item.unidad,
    unidad_label: item.unidadLabel,
    precio: item.precio,
    stock: item.stock,
    stock_minimo: item.stockMinimo,
    alias: item.alias,
  }));
  const rows = await sql.query<{ id: string }>(
    `insert into productos (
       id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo,
       alias, activo, publicado_online, moneda
     )
     select 'p_' || md5(g.tenant_id || ':' || g.nombre),
            g.tenant_id, g.nombre, g.unidad, g.unidad_label,
            g.precio, g.stock, g.stock_minimo, g.alias, true, false, 'ARS'
     from jsonb_to_recordset($1::jsonb) as g(
       tenant_id text, nombre text, unidad text, unidad_label text,
       precio numeric, stock numeric, stock_minimo numeric, alias jsonb
     )
     on conflict (id) do nothing
     returning id`,
    [JSON.stringify(filas)],
  );
  return rows.length;
}
