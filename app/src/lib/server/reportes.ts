import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { assertRole } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

function nombreVisible(nombre: string) {
  return nombre.trim().split(/\s+/)[0] || "Comprador";
}

export async function resumenVentasProductosForStaff(staff: Staff) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const pedir = (dias: number) =>
    sql.query<{ producto_id: string; nombre: string; cantidad: unknown; total: unknown }>(
      `select i.producto_id,
              max(i.nombre_snapshot) as nombre,
              sum(i.cantidad) as cantidad,
              sum(i.cantidad * i.precio_unitario) as total
       from pedido_items i
       join pedidos p on p.id = i.pedido_id
       where p.tenant_id = $1
         and p.estado in ('cobrado', 'entregado')
         and p.created_at::date >= current_date - ($2::int - 1)
       group by i.producto_id
       order by sum(i.cantidad) desc, sum(i.cantidad * i.precio_unitario) desc
       limit 8`,
      [staff.tenantId, dias],
    );
  const [semana, mes] = await Promise.all([pedir(7), pedir(30)]);
  const mapear = (rows: { producto_id: string; nombre: string; cantidad: unknown; total: unknown }[]) =>
    rows.map((row) => ({
      productoId: row.producto_id,
      nombre: row.nombre,
      cantidad: num(row.cantidad),
      total: num(row.total),
    }));
  return { semana: mapear(semana), mes: mapear(mes) };
}

export async function historialProductoForStaff(staff: Staff, productoId: string) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql.query<{ dia: string; cantidad: unknown; total: unknown }>(
    `select to_char(d::date, 'YYYY-MM-DD') as dia,
            coalesce((
              select sum(i.cantidad)
              from pedido_items i
              join pedidos p on p.id = i.pedido_id
              where p.tenant_id = $1
                and i.producto_id = $2
                and p.estado in ('cobrado', 'entregado')
                and p.created_at::date = d::date
            ), 0) as cantidad,
            coalesce((
              select sum(i.cantidad * i.precio_unitario)
              from pedido_items i
              join pedidos p on p.id = i.pedido_id
              where p.tenant_id = $1
                and i.producto_id = $2
                and p.estado in ('cobrado', 'entregado')
                and p.created_at::date = d::date
            ), 0) as total
     from generate_series(current_date - 6, current_date, interval '1 day') as d
     order by d::date`,
    [staff.tenantId, productoId],
  );
  return {
    dias: rows.map((row) => ({
      dia: String(row.dia).slice(0, 10),
      cantidad: num(row.cantidad),
      total: num(row.total),
    })),
  };
}

export async function rankingCargadoresForStaff(staff: Staff) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{
    nombre: string;
    puntos: number;
    score: unknown;
    recorridos_completados: number;
    nivel: string | null;
  }>`
    select c.nombre, c.puntos, c.score,
      count(distinct r.id) filter (where r.estado = 'entregado')::int as recorridos_completados,
      (select n.nombre from mercado_niveles n where n.puntos_minimos <= c.puntos
       order by n.puntos_minimos desc limit 1) as nivel
    from mercado_cargadores c
    left join mercado_recorridos r on r.cargador_id = c.id
    where c.estado_cuenta = 'activo'
    group by c.id
    order by c.score desc, recorridos_completados desc
    limit 20
  `;
  return {
    ranking: rows.map((row, index) => ({
      puesto: index + 1,
      nombre: nombreVisible(row.nombre),
      nivel: row.nivel ?? "Inicial",
      puntos: row.puntos,
      score: num(row.score),
      recorridosCompletados: row.recorridos_completados,
    })),
  };
}
