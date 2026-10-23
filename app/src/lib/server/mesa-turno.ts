import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { assertRole } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

/**
 * Indicadores de la mesa del turno para admin y cajero.
 *
 * Devuelve los 5 KPIs compactos que la web muestra en `mesa-turno.tsx`:
 * cobrado hoy, pedidos en curso, stock bajo, pedidos de la app y publicados
 * en Mercado.
 */
export async function mesaTurnoForStaff(staff: Staff) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();

  // Cobrado hoy: suma de cobros no anulados del día en curso.
  const cobradoRows = await sql<{ total: unknown }>`
    select coalesce(sum(monto), 0) as total
    from cobros
    where tenant_id = ${staff.tenantId}
      and anulado = false
      and created_at::date = current_date
  `;

  // Pedidos en curso: estados confirmado (enviado) y en_preparacion.
  const enCursoRows = await sql<{ n: unknown }>`
    select count(*)::int as n
    from pedidos
    where tenant_id = ${staff.tenantId}
      and estado in ('enviado', 'en_preparacion')
  `;

  // Stock bajo: productos activos con stock <= stock_minimo.
  const stockBajoRows = await sql<{ n: unknown }>`
    select count(*)::int as n
    from productos
    where tenant_id = ${staff.tenantId}
      and activo = true
      and stock <= stock_minimo
  `;

  // Pedidos de la app: pedidos de origen mercado_al_toque del día.
  const pedidosAppRows = await sql<{ n: unknown }>`
    select count(*)::int as n
    from pedidos
    where tenant_id = ${staff.tenantId}
      and origen = 'mercado_al_toque'
      and created_at::date = current_date
  `;

  // Publicados en Mercado: productos activos con publicado_online = true.
  const publicadosRows = await sql<{ n: unknown }>`
    select count(*)::int as n
    from productos
    where tenant_id = ${staff.tenantId}
      and activo = true
      and publicado_online = true
  `;

  return {
    cobrado: num(cobradoRows[0]?.total),
    enCurso: num(enCursoRows[0]?.n),
    stockBajo: num(stockBajoRows[0]?.n),
    pedidosApp: num(pedidosAppRows[0]?.n),
    publicados: num(publicadosRows[0]?.n),
  };
}
