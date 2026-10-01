import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { assertRole } from "@/lib/server/context";
import type { Alerta, FormaPago, Staff } from "@/lib/types";

export async function dashboardResumenForStaff(staff: Staff, diasInput?: number) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const dias = diasInput === 1 || diasInput === 30 ? diasInput : 7;
  const span = await sql.query<{ total: unknown; n: unknown; prev_total: unknown; prev_n: unknown }>(
    `select
       coalesce(sum(monto) filter (where created_at::date >= current_date - ($2::int - 1)), 0) as total,
       count(*) filter (where created_at::date >= current_date - ($2::int - 1))::int as n,
       coalesce(sum(monto) filter (
         where created_at::date < current_date - ($2::int - 1)
           and created_at::date >= current_date - ($2::int * 2 - 1)
       ), 0) as prev_total,
       count(*) filter (
         where created_at::date < current_date - ($2::int - 1)
           and created_at::date >= current_date - ($2::int * 2 - 1)
       )::int as prev_n
     from cobros
     where tenant_id = $1
       and anulado = false
       and created_at::date >= current_date - ($2::int * 2 - 1)`,
    [staff.tenantId, dias],
  );
  const colaCount = await sql<{ n: unknown }>`
    select count(*)::int as n from pedidos
    where tenant_id = ${staff.tenantId} and estado in ('enviado','en_preparacion','listo')
  `;
  const series =
    dias === 1
      ? await sql.query<{ dia: string; total: unknown; n: unknown }>(
          `select to_char(h, 'YYYY-MM-DD HH24') as dia,
                  coalesce((select sum(monto) from cobros c
                    where c.tenant_id = $1
                      and c.anulado = false
                      and to_char(c.created_at, 'YYYY-MM-DD HH24') = to_char(h, 'YYYY-MM-DD HH24')), 0) as total,
                  coalesce((select count(*) from cobros c
                    where c.tenant_id = $1
                      and c.anulado = false
                      and to_char(c.created_at, 'YYYY-MM-DD HH24') = to_char(h, 'YYYY-MM-DD HH24')), 0)::int as n
           from generate_series(
             current_date + time '06:00',
             current_date + time '20:00',
             interval '1 hour'
           ) as h`,
          [staff.tenantId],
        )
      : await sql.query<{ dia: string; total: unknown; n: unknown }>(
          `select to_char(d::date, 'YYYY-MM-DD') as dia,
                  coalesce((select sum(monto) from cobros c where c.tenant_id = $1 and c.anulado = false and c.created_at::date = d::date), 0) as total,
                  coalesce((select count(*) from cobros c where c.tenant_id = $1 and c.anulado = false and c.created_at::date = d::date), 0)::int as n
           from generate_series(current_date - ($2::int - 1), current_date, interval '1 day') as d`,
          [staff.tenantId, dias],
        );
  const top = await sql.query<{ nombre: string; cantidad: unknown; total: unknown }>(
    `select i.nombre_snapshot as nombre,
            sum(i.cantidad) as cantidad,
            sum(i.cantidad * i.precio_unitario) as total
     from pedido_items i
     join pedidos p on p.id = i.pedido_id
     where p.tenant_id = $1 and p.estado in ('cobrado', 'entregado')
       and p.created_at::date >= current_date - ($2::int - 1)
     group by i.nombre_snapshot
     order by sum(i.cantidad * i.precio_unitario) desc
     limit 8`,
    [staff.tenantId, dias],
  );
  const formas = await sql.query<{ forma_pago: string; total: unknown; n: unknown }>(
    `select forma_pago, coalesce(sum(monto),0) as total, count(*)::int as n
     from cobros
     where tenant_id = $1 and anulado = false and created_at::date >= current_date - ($2::int - 1)
     group by forma_pago
     order by sum(monto) desc`,
    [staff.tenantId, dias],
  );
  const movimientos = await sql.query<{
    id: string;
    monto: unknown;
    forma_pago: string;
    created_at: string;
    cliente: string;
    numero: number | null;
    productos: string;
  }>(
    `select c.id, c.monto, c.forma_pago, c.created_at::text as created_at,
            coalesce(p.cliente_nombre, 'Mostrador') as cliente, t.numero,
            coalesce((
              select string_agg(distinct i.nombre_snapshot, ', ')
              from pedido_items i
              where i.pedido_id = c.pedido_id
            ), '') as productos
     from cobros c
     left join pedidos p on p.id = c.pedido_id
     left join tickets t on t.cobro_id = c.id
     where c.tenant_id = $1 and c.anulado = false and c.created_at::date >= current_date - ($2::int - 1)
     order by c.created_at desc
     limit 40`,
    [staff.tenantId, dias],
  );
  const cola = await sql<{
    id: string;
    cliente: string;
    estado: string;
    created_at: string;
    total: unknown;
    vendedor: string | null;
  }>`
    select p.id, p.cliente_nombre as cliente, p.estado, p.created_at::text as created_at,
           coalesce((select sum(i.cantidad * i.precio_unitario) from pedido_items i where i.pedido_id = p.id), 0) as total,
           s.nombre as vendedor
    from pedidos p
    left join staff s on s.id = p.vendedor_id
    where p.tenant_id = ${staff.tenantId} and p.estado in ('enviado','en_preparacion','listo')
    order by p.created_at asc
    limit 8
  `;
  const ventas = num(span[0]?.total);
  const tickets = num(span[0]?.n);
  return {
    dias,
    ventas,
    ventasPrev: num(span[0]?.prev_total),
    tickets,
    ticketsPrev: num(span[0]?.prev_n),
    ticketPromedio: tickets ? Math.round(ventas / tickets) : 0,
    enCola: num(colaCount[0]?.n),
    series: series.map((s) => ({ dia: s.dia, total: num(s.total), n: num(s.n) })),
    top: top.map((t) => ({ nombre: t.nombre, cantidad: num(t.cantidad), total: num(t.total) })),
    formas: formas.map((f) => ({
      formaPago: f.forma_pago as FormaPago,
      total: num(f.total),
      n: num(f.n),
    })),
    movimientos: movimientos.map((m) => ({
      id: m.id,
      monto: num(m.monto),
      formaPago: m.forma_pago as FormaPago,
      createdAt: m.created_at,
      cliente: m.cliente,
      numero: m.numero == null ? null : num(m.numero),
      productos: m.productos,
    })),
    cola: cola.map((p) => ({
      id: p.id,
      cliente: p.cliente,
      estado: p.estado,
      createdAt: p.created_at,
      total: num(p.total),
      vendedor: p.vendedor,
    })),
  };
}

export async function listAlertasForStaff(staff: Staff): Promise<Alerta[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    tipo: string;
    mensaje: string;
    leida: boolean;
    created_at: string;
  }>`
    select id, tipo, mensaje, leida, created_at::text as created_at
    from alertas
    where tenant_id = ${staff.tenantId}
    order by leida asc, created_at desc
    limit 30
  `;
  return rows.map(
    (r): Alerta => ({
      id: r.id,
      tipo: r.tipo,
      mensaje: r.mensaje,
      leida: r.leida,
      createdAt: r.created_at,
    }),
  );
}

export async function marcarAlertaLeidaForStaff(staff: Staff, id: string) {
  const sql = await getSql();
  await sql`update alertas set leida = true where id = ${id} and tenant_id = ${staff.tenantId}`;
  return { ok: true as const };
}

export async function listAuditoriaForStaff(staff: Staff) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    usuario_nombre: string | null;
    accion: string;
    entidad: string;
    detalle: unknown;
    created_at: string;
  }>`
    select id, usuario_nombre, accion, entidad, detalle, created_at::text as created_at
    from auditoria
    where tenant_id = ${staff.tenantId}
    order by created_at desc
    limit 80
  `;
  return rows.map((r) => ({
    id: r.id,
    usuarioNombre: r.usuario_nombre,
    accion: r.accion,
    entidad: r.entidad,
    detalle:
      typeof r.detalle === "string" ? r.detalle : JSON.stringify(r.detalle ?? {}),
    createdAt: r.created_at,
  }));
}
