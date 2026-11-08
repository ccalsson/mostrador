/**
 * Logica pura del dashboard ejecutivo cross-app.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type PeriodoEjecutivo = 1 | 7 | 30;

export type AlertaEjecutivo = { tipo: string; texto: string };
export type TopProducto = { nombre: string; cantidad: number; total: number };
export type RevenuePorApp = { mostrador: number; mercado: number; superAlToque: number; materialesYa: number };

export type DashboardEjecutivo = {
  dias: PeriodoEjecutivo;
  revenue: RevenuePorApp;
  revenueTotal: number;
  usuariosActivos: {
    staff: number;
    clientes: number;
    compradores: number;
    cargadores: number;
    total: number;
  };
  pedidosEnCurso: {
    enviados: number;
    enPreparacion: number;
    listos: number;
    total: number;
  };
  topProductos: TopProducto[];
  alertas: AlertaEjecutivo[];
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  return 0;
}

/**
 * Combina metricas crudas de todas las apps en el objeto de dashboard final.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function consolidarDashboard(
  dias: PeriodoEjecutivo,
  raw: {
    revenueMostrador: number;
    revenueMercado: number;
    revenueSuper: number;
    revenueMateriales: number;
    staffOnline: number;
    clientesActivos: number;
    compradoresOnline: number;
    cargadoresOnline: number;
    pedidosEnviados: number;
    pedidosEnPreparacion: number;
    pedidosListos: number;
    topProductos: { nombre: string; cantidad: unknown; total: unknown }[];
    alertas: AlertaEjecutivo[];
  },
): DashboardEjecutivo {
  const revenue: RevenuePorApp = {
    mostrador: raw.revenueMostrador,
    mercado: raw.revenueMercado,
    superAlToque: raw.revenueSuper,
    materialesYa: raw.revenueMateriales,
  };
  const revenueTotal = revenue.mostrador + revenue.mercado + revenue.superAlToque + revenue.materialesYa;
  const usuariosActivos = {
    staff: raw.staffOnline,
    clientes: raw.clientesActivos,
    compradores: raw.compradoresOnline,
    cargadores: raw.cargadoresOnline,
    total: raw.staffOnline + raw.clientesActivos + raw.compradoresOnline + raw.cargadoresOnline,
  };
  const pedidosEnCurso = {
    enviados: raw.pedidosEnviados,
    enPreparacion: raw.pedidosEnPreparacion,
    listos: raw.pedidosListos,
    total: raw.pedidosEnviados + raw.pedidosEnPreparacion + raw.pedidosListos,
  };
  const topProductos: TopProducto[] = raw.topProductos
    .map((p) => ({ nombre: p.nombre, cantidad: toNumber(p.cantidad), total: toNumber(p.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  return { dias, revenue, revenueTotal, usuariosActivos, pedidosEnCurso, topProductos, alertas: raw.alertas };
}
