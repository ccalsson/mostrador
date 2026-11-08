import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { requireTorre, torreGuard, listPaymentsCore, listExpensesCore } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import { numerosDeNegociosCore, type NumeroFila } from "@/lib/torre/numeros-fn";
import {
  calcularPLConsolidado,
  construirFlujoCaja,
  conciliarMovimientos,
  type PLConsolidado,
  type FlujoCajaEntry,
  type ConciliacionResult,
  type Payment,
  type Expense,
  type Cobro,
  type Order,
} from "@/lib/torre/financiero-core";

export type { PLConsolidado, FlujoCajaEntry, ConciliacionResult } from "@/lib/torre/financiero-core";

// ─── P&L Consolidado ───────────────────────────────────────────────

export async function plConsolidadoCore(
  email: string,
  data: { mes: number; anio: number },
): Promise<PLConsolidado> {
  await exigirAccion(email, "comercial");

  const filas: NumeroFila[] = await numerosDeNegociosCore(email, { mes: data.mes, anio: data.anio });

  const pagosRaw = await listPaymentsCore(email);
  const gastosRaw = await listExpensesCore(email);

  const mesStr = `${data.anio}-${String(data.mes).padStart(2, "0")}`;
  const pagos: Payment[] = pagosRaw
    .filter((p) => p.paymentDate.startsWith(mesStr))
    .map((p) => ({
      id: p.id,
      amount: p.amount,
      paymentDate: p.paymentDate,
      kind: p.kind,
      currency: p.currency,
    }));
  const gastos: Expense[] = gastosRaw
    .filter((g) => g.expenseDate.startsWith(mesStr))
    .map((g) => ({
      id: g.id,
      amount: g.amount,
      expenseDate: g.expenseDate,
      category: g.category,
      appName: g.appName || undefined,
    }));

  const pl = calcularPLConsolidado(filas, pagos, gastos);
  return { ...pl, periodo: mesStr };
}

export const plConsolidado = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { mes?: number; anio?: number } | undefined) => {
    const now = new Date();
    const mes = input?.mes ?? now.getMonth() + 1;
    const anio = input?.anio ?? now.getFullYear();
    if (mes < 1 || mes > 12) throw new Error("Mes invalido.");
    if (anio < 2020 || anio > 2100) throw new Error("Anio invalido.");
    return { mes, anio };
  })
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return plConsolidadoCore(email, data);
  });

// ─── Flujo de Caja ─────────────────────────────────────────────────

export async function flujoCajaCore(
  email: string,
  data: { dias: number },
): Promise<FlujoCajaEntry[]> {
  await exigirAccion(email, "comercial");

  const pagosRaw = await listPaymentsCore(email);
  const gastosRaw = await listExpensesCore(email);

  const pagos: Payment[] = pagosRaw.map((p) => ({
    id: p.id,
    amount: p.amount,
    paymentDate: p.paymentDate,
    kind: p.kind,
    currency: p.currency,
  }));
  const gastos: Expense[] = gastosRaw.map((g) => ({
    id: g.id,
    amount: g.amount,
    expenseDate: g.expenseDate,
    category: g.category,
  }));

  return construirFlujoCaja(pagos, gastos, data.dias);
}

export const flujoCaja = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { dias?: number } | undefined) => {
    const raw = input?.dias;
    const dias = raw === 7 || raw === 15 || raw === 30 ? raw : 7;
    return { dias };
  })
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return flujoCajaCore(email, data);
  });

// ─── Conciliacion ──────────────────────────────────────────────────

export async function conciliacionCore(
  email: string,
  data: { mes: number; anio: number },
): Promise<ConciliacionResult> {
  await exigirAccion(email, "comercial");

  const sql = await getSql();
  const inicio = `${data.anio}-${String(data.mes).padStart(2, "0")}-01`;

  const cobrosRaw = await sql.query<{
    id: string;
    tenant_id: string;
    monto: unknown;
    created_at: string;
  }>(
    `select c.id, c.tenant_id, c.monto, c.created_at::text as created_at
     from cobros c
     where c.created_at >= $1::date
       and c.created_at < $1::date + interval '1 month'
       and c.anulado = false
     order by c.created_at`,
    [inicio],
  );

  const pedidosRaw = await sql.query<{
    id: string;
    tenant_id: string;
    total: unknown;
    created_at: string;
    estado: string;
  }>(
    `select p.id, p.tenant_id, p.total, p.created_at::text as created_at, p.estado
     from pedidos p
     where p.created_at >= $1::date
       and p.created_at < $1::date + interval '1 month'
     order by p.created_at`,
    [inicio],
  );

  const cobros: Cobro[] = cobrosRaw.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    monto: num(r.monto),
    createdAt: r.created_at,
  }));

  const pedidos: Order[] = pedidosRaw.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    total: num(r.total),
    createdAt: r.created_at,
    estado: r.estado,
  }));

  return conciliarMovimientos(cobros, pedidos);
}

export const conciliacion = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { mes?: number; anio?: number } | undefined) => {
    const now = new Date();
    const mes = input?.mes ?? now.getMonth() + 1;
    const anio = input?.anio ?? now.getFullYear();
    if (mes < 1 || mes > 12) throw new Error("Mes invalido.");
    if (anio < 2020 || anio > 2100) throw new Error("Anio invalido.");
    return { mes, anio };
  })
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return conciliacionCore(email, data);
  });
