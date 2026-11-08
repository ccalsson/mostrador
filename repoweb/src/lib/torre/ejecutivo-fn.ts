import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import { leerKpisSuperAlToque } from "@/lib/torre/super-al-toque-fn";
import { usoMaterialesYaCore } from "@/lib/torre/materiales-ya-fn";
import { consolidarDashboard, type DashboardEjecutivo } from "@/lib/torre/ejecutivo-core";

export type { DashboardEjecutivo } from "@/lib/torre/ejecutivo-core";

type Periodo = 1 | 7 | 30;
type AlertaEjecutivo = { tipo: string; texto: string };

export async function dashboardEjecutivoCore(email: string, dias: Periodo): Promise<DashboardEjecutivo> {
  const role = await exigirAccion(email, "lectura");
  if (role !== "administracion") {
    throw new Error("Solo el rol de administracion puede ver el dashboard ejecutivo.");
  }

  const sql = await getSql();

  // ── Revenue Mostrador (cobros no anulados que no son de Mercado al Toque) ──
  const revMostrador = await sql.query<{ total: unknown }>(
    `select coalesce(sum(c.monto) filter (where c.anulado = false and coalesce(p.origen, '') <> 'mercado_al_toque'), 0) as total
     from cobros c
     left join pedidos p on p.id = c.pedido_id
     where c.created_at::date >= current_date - ($1::int - 1)`,
    [dias],
  );

  // ── Revenue Mercado al Toque (cobros no anulados de origen mercado_al_toque) ──
  const revMercado = await sql.query<{ total: unknown }>(
    `select coalesce(sum(c.monto) filter (where c.anulado = false and p.origen = 'mercado_al_toque'), 0) as total
     from cobros c
     left join pedidos p on p.id = c.pedido_id
     where c.created_at::date >= current_date - ($1::int - 1)`,
    [dias],
  );

  // ── Revenue Super al Toque (API externa) ──
  let revSuper = 0;
  try {
    const kpis = await leerKpisSuperAlToque(dias);
    revSuper = kpis.sales.gmvCents / 100;
  } catch {
    // La app externa puede estar apagada; no corta el dashboard.
  }

  // ── Revenue Materiales Ya (API externa) ──
  let revMateriales = 0;
  try {
    const uso = await usoMaterialesYaCore(email);
    if (uso.disponible) {
      revMateriales = uso.uso.ventas;
    }
  } catch {
    // Idem: si no responde, sigue sin cortar.
  }

  // ── Usuarios activos (sesion abierta o actividad reciente) ──
  const usuarios = await sql<{
    staff_online: number;
    clientes_activos: number;
    compradores_online: number;
    cargadores_online: number;
  }>`
    select
      (select count(distinct st.user_id)::int
       from staff st
       join "session" s on s."userId" = st.user_id and s."expiresAt" > now()
       where st.activo) as staff_online,
      (select count(*)::int from clientes where activo) as clientes_activos,
      (select count(distinct mc.user_id)::int
       from mercado_compradores mc
       where exists (
         select 1 from mercado_sesiones ms
         where ms.user_id = mc.user_id and ms.perfil = 'comprador' and ms.expires_at > now()
       ) or exists (
         select 1 from "session" s where s."userId" = mc.user_id and s."expiresAt" > now()
       )) as compradores_online,
      (select count(distinct cg.user_id)::int
       from mercado_cargadores cg
       where cg.estado = 'activo' and (
         exists (
           select 1 from mercado_sesiones ms
           where ms.user_id = cg.user_id and ms.perfil = 'cargador' and ms.expires_at > now()
         ) or exists (
           select 1 from "session" s where s."userId" = cg.user_id and s."expiresAt" > now()
         )
       )) as cargadores_online
  `;

  // ── Pedidos en curso ──
  const enCurso = await sql.query<{ estado: string; n: number }>(
    `select estado, count(*)::int as n
     from pedidos
     where estado in ('enviado', 'en_preparacion', 'listo')
       and created_at::date >= current_date - ($1::int - 1)
     group by estado`,
    [dias],
  );
  const mapEstado = new Map(enCurso.map((r) => [r.estado, num(r.n)]));

  // ── Top 10 productos mas vendidos (cross-app) ──
  const topProductos = await sql.query<{ nombre: string; cantidad: unknown; total: unknown }>(
    `select i.nombre_snapshot as nombre,
            sum(i.cantidad) as cantidad,
            sum(i.cantidad * i.precio_unitario) as total
     from pedido_items i
     join pedidos p on p.id = i.pedido_id
     where p.estado in ('cobrado', 'entregado')
       and p.created_at::date >= current_date - ($1::int - 1)
     group by i.nombre_snapshot
     order by sum(i.cantidad * i.precio_unitario) desc
     limit 10`,
    [dias],
  );

  // ── Alertas unificadas ──
  const alertas: AlertaEjecutivo[] = [];

  // Stock bajo: productos con stock < stock_minimo
  const stockBajo = await sql.query<{ nombre: string; tenant_nombre: string; stock: unknown; minimo: unknown }>(
    `select p.nombre, t.nombre as tenant_nombre, p.stock, p.stock_minimo as minimo
     from productos p
     join tenants t on t.id = p.tenant_id
     where p.activo = true and p.stock < p.stock_minimo
     order by (p.stock_minimo - p.stock) desc
     limit 10`,
  );
  for (const row of stockBajo) {
    alertas.push({
      tipo: "stock",
      texto: `Stock bajo: ${row.nombre} (${row.tenant_nombre}) — ${num(row.stock)} ${num(row.minimo)} minimo.`,
    });
  }

  // Pagos pendientes: pedidos con estado 'pendiente' hace mas de 24h
  const pagosPendientes = await sql.query<{ id: string; tenant_nombre: string; creado: string }>(
    `select p.id, t.nombre as tenant_nombre, p.created_at::text as creado
     from pedidos p
     join tenants t on t.id = p.tenant_id
     where p.estado = 'pendiente'
       and p.created_at < now() - interval '24 hours'
     order by p.created_at
     limit 10`,
  );
  for (const row of pagosPendientes) {
    alertas.push({
      tipo: "pago",
      texto: `Pago pendiente: pedido ${row.id.slice(0, 8)} (${row.tenant_nombre}) desde ${row.creado.slice(0, 10)}.`,
    });
  }

  const u = usuarios[0];
  return consolidarDashboard(dias, {
    revenueMostrador: num(revMostrador[0]?.total),
    revenueMercado: num(revMercado[0]?.total),
    revenueSuper: revSuper,
    revenueMateriales: revMateriales,
    staffOnline: num(u?.staff_online),
    clientesActivos: num(u?.clientes_activos),
    compradoresOnline: num(u?.compradores_online),
    cargadoresOnline: num(u?.cargadores_online),
    pedidosEnviados: mapEstado.get("enviado") ?? 0,
    pedidosEnPreparacion: mapEstado.get("en_preparacion") ?? 0,
    pedidosListos: mapEstado.get("listo") ?? 0,
    topProductos,
    alertas,
  });
}

export const dashboardEjecutivo = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { dias?: Periodo } | undefined) => {
    const raw = input?.dias;
    const dias: Periodo = raw === 1 || raw === 7 || raw === 30 ? raw : 1;
    return { dias };
  })
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return dashboardEjecutivoCore(email, data.dias);
  });
