/**
 * Logica pura del control financiero consolidado.
 * Sin dependencias de base de datos para facilitar tests unitarios.
 */

import type { NumeroFila } from "./numeros-fn.ts";

// ── Tipos de entrada ──

export type Payment = {
  id: string;
  amount: number;
  paymentDate: string;
  kind: string;
  currency: string;
  appName?: string;
};

export type Expense = {
  id: string;
  amount: number;
  expenseDate: string;
  category: string;
  appName?: string;
};

export type Order = {
  id: string;
  tenantId: string;
  total: number;
  createdAt: string;
  estado: string;
};

export type Cobro = {
  id: string;
  tenantId: string;
  monto: number;
  createdAt: string;
};

// ── Tipos de salida ──

export type PLApp = { app: string; ingresos: number; gastos: number; resultado: number };
export type PLConsolidado = {
  apps: PLApp[];
  totalIngresos: number;
  totalGastos: number;
  totalResultado: number;
  periodo: string;
};
export type FlujoCajaEntry = { fecha: string; ingresos: number; egresos: number; saldo: number };
export type ConciliacionResult = {
  conciliados: number;
  pagosSinPedido: { id: string; monto: number; fecha: string }[];
  pedidosSinPago: { id: string; total: number; fecha: string }[];
};

// ── Helpers ──

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  return 0;
}

function dia(iso: string): string {
  return iso.slice(0, 10);
}

function nombreApp(negocio: string): string {
  const n = negocio.toLowerCase();
  if (n.includes("super")) return "Super al Toque";
  if (n.includes("material")) return "Materiales Ya";
  if (n.includes("mercado")) return "Mercado";
  return "Mostrador";
}

// ── Funciones core ──

export function calcularPLConsolidado(
  filas: NumeroFila[],
  pagos: Payment[],
  gastos: Expense[],
): PLConsolidado {
  const mapa = new Map<string, { ingresos: number; gastos: number }>();

  for (const fila of filas) {
    const app = nombreApp(fila.negocio);
    const actual = mapa.get(app) ?? { ingresos: 0, gastos: 0 };
    actual.ingresos += fila.ventas;
    actual.gastos += fila.egresos;
    mapa.set(app, actual);
  }

  for (const pago of pagos) {
    const app = pago.appName ?? "Plataforma SaaS";
    const actual = mapa.get(app) ?? { ingresos: 0, gastos: 0 };
    actual.ingresos += pago.amount;
    mapa.set(app, actual);
  }

  for (const gasto of gastos) {
    const app = gasto.appName ?? "General";
    const actual = mapa.get(app) ?? { ingresos: 0, gastos: 0 };
    actual.gastos += gasto.amount;
    mapa.set(app, actual);
  }

  const apps: PLApp[] = [];
  let totalIngresos = 0;
  let totalGastos = 0;

  for (const [app, { ingresos, gastos }] of mapa) {
    const resultado = Math.round((ingresos - gastos) * 100) / 100;
    apps.push({
      app,
      ingresos: Math.round(ingresos * 100) / 100,
      gastos: Math.round(gastos * 100) / 100,
      resultado,
    });
    totalIngresos += ingresos;
    totalGastos += gastos;
  }

  apps.sort((a, b) => b.ingresos - a.ingresos);

  const now = new Date();
  const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    apps,
    totalIngresos: Math.round(totalIngresos * 100) / 100,
    totalGastos: Math.round(totalGastos * 100) / 100,
    totalResultado: Math.round((totalIngresos - totalGastos) * 100) / 100,
    periodo,
  };
}

export function construirFlujoCaja(pagos: Payment[], gastos: Expense[], dias: number): FlujoCajaEntry[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const mapa = new Map<string, { ingresos: number; egresos: number }>();

  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    mapa.set(d.toISOString().slice(0, 10), { ingresos: 0, egresos: 0 });
  }

  for (const pago of pagos) {
    const fecha = dia(pago.paymentDate);
    const entry = mapa.get(fecha);
    if (entry) entry.ingresos += toNumber(pago.amount);
  }

  for (const gasto of gastos) {
    const fecha = dia(gasto.expenseDate);
    const entry = mapa.get(fecha);
    if (entry) entry.egresos += toNumber(gasto.amount);
  }

  const result: FlujoCajaEntry[] = [];
  let saldo = 0;
  for (const [fecha, { ingresos, egresos }] of mapa) {
    saldo = Math.round((saldo + ingresos - egresos) * 100) / 100;
    result.push({
      fecha,
      ingresos: Math.round(ingresos * 100) / 100,
      egresos: Math.round(egresos * 100) / 100,
      saldo,
    });
  }

  return result;
}

export function conciliarMovimientos(cobros: Cobro[], pedidos: Order[]): ConciliacionResult {
  const pedidosSinAsignar = pedidos
    .filter((p) => p.estado !== "anulado")
    .map((p) => ({ ...p }));
  const conciliados: string[] = [];
  const pagosSinPedido: { id: string; monto: number; fecha: string }[] = [];

  for (const cobro of cobros) {
    const cobroTime = new Date(cobro.createdAt).getTime();
    const idx = pedidosSinAsignar.findIndex((p) => {
      if (p.tenantId !== cobro.tenantId) return false;
      if (Math.abs(p.total - cobro.monto) > 0.01) return false;
      const pedidoTime = new Date(p.createdAt).getTime();
      return Math.abs(cobroTime - pedidoTime) <= 48 * 60 * 60 * 1000;
    });

    if (idx >= 0) {
      conciliados.push(cobro.id);
      pedidosSinAsignar.splice(idx, 1);
    } else {
      pagosSinPedido.push({ id: cobro.id, monto: cobro.monto, fecha: dia(cobro.createdAt) });
    }
  }

  const pedidosSinPago = pedidosSinAsignar.map((p) => ({
    id: p.id,
    total: p.total,
    fecha: dia(p.createdAt),
  }));

  return { conciliados: conciliados.length, pagosSinPedido, pedidosSinPago };
}
