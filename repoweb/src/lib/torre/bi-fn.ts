import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import {
  calcularTendenciaRevenue,
  predecirDemanda,
  calcularRiesgoChurn,
  proyectarFinanzas,
  type PuntoTiempo,
  type BIResult,
} from "./bi-core";

export type { BIResult, PuntoTiempo } from "./bi-core";
export type {
  TendenciaRevenue,
  PrediccionDemanda,
  RiesgoChurn,
  ProyeccionFinancial,
} from "./bi-core";

function dia(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  return text.slice(0, 10);
}

// ─── Core: construir snapshots y calcular ──────────────────────────

export async function biResultadosCore(
  email: string,
  opts: { diasForecast: number; mesesProyeccion: number },
): Promise<BIResult> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  // 1) Revenue: cobros agrupados por dia, ultimos 90 dias
  const cobrosRows = await sql<{ fecha: string; total: unknown }>`
    select created_at::date::text as fecha, sum(monto) as total
    from cobros
    where anulado = false
      and created_at >= current_date - 89
    group by created_at::date
    order by fecha
  `;

  const historicoRevenue: PuntoTiempo[] = cobrosRows.map((r) => ({
    fecha: dia(r.fecha),
    valor: num(r.total),
  }));

  const revenue = calcularTendenciaRevenue(historicoRevenue, opts.diasForecast);

  // 2) Demanda: stock_movimientos de tipo='venta', ultimos 30 dias
  const movRows = await sql<{
    producto_nombre: string;
    tenant_nombre: string;
    cantidad: unknown;
    fecha: string;
  }>`
    select p.nombre as producto_nombre, t.nombre as tenant_nombre,
           m.cantidad, m.created_at::date::text as fecha
    from stock_movimientos m
    join productos p on p.id = m.producto_id
    join tenants t on t.id = m.tenant_id
    where m.tipo = 'venta'
      and m.created_at >= current_date - 29
    order by m.created_at
  `;

  const demanda = predecirDemanda(movRows.map((r) => ({
    producto: r.producto_nombre,
    tenantNombre: r.tenant_nombre,
    cantidad: num(r.cantidad),
    fecha: dia(r.fecha),
  })));

  // 3) Churn: clientes SaaS con su actividad
  const clientesRows = await sql<{
    id: string;
    nombre: string;
    email: string;
    ultima_actividad: string;
    total_compras: unknown;
    meses_activo: unknown;
  }>`
    select c.id, c.name as nombre, c.email,
           coalesce(
             (select max(p.payment_date)::text from torre.saas_payments p
              join torre.saas_subscriptions s on s.id = p.subscription_id
              where s.client_id = c.id and p.status = 'paid'),
             c.created_at::text
           ) as ultima_actividad,
           coalesce(
             (select count(*) from torre.saas_payments p
              join torre.saas_subscriptions s on s.id = p.subscription_id
              where s.client_id = c.id and p.status = 'paid'),
             0
           )::text as total_compras,
           greatest(1,
             extract(month from age(now(), c.created_at))::int
           )::text as meses_activo
    from torre.saas_clients c
    where c.status = 'active'
    order by c.name
  `;

  const churn = calcularRiesgoChurn(clientesRows.map((r) => {
    const totalCompras = num(r.total_compras);
    const mesesActivo = num(r.meses_activo);
    return {
      id: r.id,
      nombre: r.nombre,
      email: r.email,
      ultimaActividad: dia(r.ultima_actividad),
      totalCompras,
      promedioMes: mesesActivo > 0 ? totalCompras / mesesActivo : 0,
      mesesActivo,
    };
  }));

  // 4) Proyecciones financieras: ingresos (cobros + pagos) y gastos (egresos + expenses) por mes
  const ingresosRows = await sql<{ fecha: string; total: unknown }>`
    select fecha, sum(total) as total from (
      select created_at::date::text as fecha, monto as total
      from cobros
      where anulado = false and created_at >= current_date - 180
      union all
      select payment_date::text as fecha, amount as total
      from torre.saas_payments
      where status = 'paid' and payment_date >= (current_date - 180)::text
    ) sub
    group by fecha
    order by fecha
  `;

  const gastosRows = await sql<{ fecha: string; total: unknown }>`
    select fecha, sum(total) as total from (
      select created_at::date::text as fecha, monto as total
      from caja_egresos
      where created_at >= current_date - 180
      union all
      select expense_date::text as fecha, amount as total
      from torre.saas_expenses
      where expense_date >= (current_date - 180)::text
    ) sub
    group by fecha
    order by fecha
  `;

  const historicoIngresos: PuntoTiempo[] = ingresosRows.map((r) => ({
    fecha: dia(r.fecha),
    valor: num(r.total),
  }));

  const historicoGastos: PuntoTiempo[] = gastosRows.map((r) => ({
    fecha: dia(r.fecha),
    valor: num(r.total),
  }));

  const proyeccion = proyectarFinanzas(historicoIngresos, historicoGastos, opts.mesesProyeccion);

  return {
    revenue,
    demanda,
    churn,
    proyeccion,
    generadoAt: new Date().toISOString(),
  };
}

// ─── Server function wrapper ───────────────────────────────────────

export const biResultados = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { diasForecast?: number; mesesProyeccion?: number } | undefined) => ({
    diasForecast: input?.diasForecast ?? 30,
    mesesProyeccion: input?.mesesProyeccion ?? 3,
  }))
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return biResultadosCore(email, {
      diasForecast: data.diasForecast,
      mesesProyeccion: data.mesesProyeccion,
    });
  });
