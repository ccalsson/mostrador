/**
 * Logica pura del motor de reglas de negocio.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type CondicionTipo = "stock_bajo" | "pago_vencido" | "caja_negativa" | "revenue_drop";
export type AccionTipo = "alerta" | "notificacion" | "flag";

export type Condicion = {
  tipo: CondicionTipo;
  umbral: number;
  periodoDias?: number;
};

export type Accion = {
  tipo: AccionTipo;
  destino: string;
  mensaje: string;
};

export type Regla = {
  id: string;
  nombre: string;
  descripcion: string;
  condicion: Condicion;
  accion: Accion;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResultadoEvaluacion = {
  reglaId: string;
  reglaNombre: string;
  disparada: boolean;
  detalle: string;
  datos: string; // JSON-serialized Record<string, unknown>
  evaluadoAt: string;
};

export type StockSnapshot = {
  tenantId: string;
  tenantNombre: string;
  productoNombre: string;
  stock: number;
  stockMinimo: number;
}[];

export type PagosSnapshot = {
  id: string;
  tenantId: string;
  amount: number;
  paymentDate: string;
  status: string;
}[];

export type CobrosSnapshot = {
  tenantId: string;
  monto: number;
  createdAt: string;
}[];

export type EgresosSnapshot = {
  tenantId: string;
  monto: number;
  createdAt: string;
}[];

type DataSnapshots = {
  stock: StockSnapshot;
  pagos: PagosSnapshot;
  cobros: CobrosSnapshot;
  egresos: EgresosSnapshot;
};

const CONDICION_LABELS: Record<CondicionTipo, string> = {
  stock_bajo: "Stock bajo",
  pago_vencido: "Pago vencido",
  caja_negativa: "Caja negativa",
  revenue_drop: "Caida de ingresos",
};

const ACCION_LABELS: Record<AccionTipo, string> = {
  alerta: "Alerta",
  notificacion: "Notificacion",
  flag: "Flag",
};

export function condicionLabel(tipo: CondicionTipo): string {
  return CONDICION_LABELS[tipo] ?? tipo;
}

export function accionLabel(tipo: AccionTipo): string {
  return ACCION_LABELS[tipo] ?? tipo;
}

/**
 * Evalua una condicion individual contra los snapshots de datos.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function evaluarCondicion(
  condicion: Condicion,
  data: DataSnapshots,
): { disparada: boolean; detalle: string; datos: Record<string, unknown> } {
  switch (condicion.tipo) {
    case "stock_bajo":
      return evaluarStockBajo(condicion, data.stock);
    case "pago_vencido":
      return evaluarPagoVencido(condicion, data.pagos);
    case "caja_negativa":
      return evaluarCajaNegativa(condicion, data.cobros, data.egresos);
    case "revenue_drop":
      return evaluarRevenueDrop(condicion, data.cobros);
    default:
      return { disparada: false, detalle: `Tipo de condicion desconocido: ${condicion.tipo}`, datos: {} };
  }
}

function evaluarStockBajo(
  condicion: Condicion,
  stock: StockSnapshot,
): { disparada: boolean; detalle: string; datos: Record<string, unknown> } {
  const umbral = condicion.umbral / 100;
  const afectados = stock.filter((s) => s.stock <= s.stockMinimo * umbral);

  if (afectados.length === 0) {
    return {
      disparada: false,
      detalle: `Ningun producto tiene stock <= ${condicion.umbral}% del minimo`,
      datos: { umbral: condicion.umbral, total: stock.length },
    };
  }

  const productos = afectados.map((a) => `${a.tenantNombre} / ${a.productoNombre} (${a.stock}/${a.stockMinimo})`);
  return {
    disparada: true,
    detalle: `${afectados.length} producto(s) con stock bajo: ${productos.slice(0, 5).join("; ")}`,
    datos: { umbral: condicion.umbral, afectados: afectados.length, productos: productos.slice(0, 10) },
  };
}

function evaluarPagoVencido(
  condicion: Condicion,
  pagos: PagosSnapshot,
): { disparada: boolean; detalle: string; datos: Record<string, unknown> } {
  const periodoDias = condicion.periodoDias ?? 7;
  const corte = new Date();
  corte.setDate(corte.getDate() - periodoDias);
  const corteIso = corte.toISOString();

  const vencidos = pagos.filter(
    (p) => p.status === "pending" && p.paymentDate < corteIso,
  );

  if (vencidos.length === 0) {
    return {
      disparada: false,
      detalle: `No hay pagos pendientes con mas de ${periodoDias} dias`,
      datos: { periodoDias, total: pagos.length },
    };
  }

  const total = vencidos.reduce((acc, p) => acc + p.amount, 0);
  return {
    disparada: true,
    detalle: `${vencidos.length} pago(s) vencido(s) hace mas de ${periodoDias} dias por un total de ${total.toFixed(2)}`,
    datos: { periodoDias, vencidos: vencidos.length, total },
  };
}

function evaluarCajaNegativa(
  condicion: Condicion,
  cobros: CobrosSnapshot,
  egresos: EgresosSnapshot,
): { disparada: boolean; detalle: string; datos: Record<string, unknown> } {
  const periodoDias = condicion.periodoDias ?? 30;
  const corte = new Date();
  corte.setDate(corte.getDate() - periodoDias);
  const corteIso = corte.toISOString();

  // Agrupar cobros por tenant
  const cobrosPorTenant = new Map<string, number>();
  for (const c of cobros) {
    if (c.createdAt >= corteIso) {
      cobrosPorTenant.set(c.tenantId, (cobrosPorTenant.get(c.tenantId) ?? 0) + c.monto);
    }
  }

  // Agrupar egresos por tenant
  const egresosPorTenant = new Map<string, number>();
  for (const e of egresos) {
    if (e.createdAt >= corteIso) {
      egresosPorTenant.set(e.tenantId, (egresosPorTenant.get(e.tenantId) ?? 0) + e.monto);
    }
  }

  // Encontrar tenants con caja negativa
  const todosLosTenants = new Set([...cobrosPorTenant.keys(), ...egresosPorTenant.keys()]);
  const negativos: { tenantId: string; cobros: number; egresos: number; saldo: number }[] = [];

  for (const tenantId of todosLosTenants) {
    const cob = cobrosPorTenant.get(tenantId) ?? 0;
    const egr = egresosPorTenant.get(tenantId) ?? 0;
    const saldo = cob - egr;
    if (saldo < 0) {
      negativos.push({ tenantId, cobros: cob, egresos: egr, saldo });
    }
  }

  if (negativos.length === 0) {
    return {
      disparada: false,
      detalle: `Ningun tenant tiene caja negativa en los ultimos ${periodoDias} dias`,
      datos: { periodoDias, tenants: todosLosTenants.size },
    };
  }

  return {
    disparada: true,
    detalle: `${negativos.length} tenant(s) con caja negativa: ${negativos.map((n) => `${n.tenantId} (${n.saldo.toFixed(2)})`).join("; ")}`,
    datos: { periodoDias, negativos: negativos.length, tenants: negativos.map((n) => n.tenantId) },
  };
}

function evaluarRevenueDrop(
  condicion: Condicion,
  cobros: CobrosSnapshot,
): { disparada: boolean; detalle: string; datos: Record<string, unknown> } {
  const periodoDias = condicion.periodoDias ?? 30;
  const ahora = new Date();
  const inicioPeriodoActual = new Date(ahora);
  inicioPeriodoActual.setDate(inicioPeriodoActual.getDate() - periodoDias);
  const inicioPeriodoAnterior = new Date(inicioPeriodoActual);
  inicioPeriodoAnterior.setDate(inicioPeriodoAnterior.getDate() - periodoDias);

  const cobroActual = cobros
    .filter((c) => c.createdAt >= inicioPeriodoActual.toISOString())
    .reduce((acc, c) => acc + c.monto, 0);

  const cobroAnterior = cobros
    .filter((c) => c.createdAt >= inicioPeriodoAnterior.toISOString() && c.createdAt < inicioPeriodoActual.toISOString())
    .reduce((acc, c) => acc + c.monto, 0);

  if (cobroAnterior === 0) {
    return {
      disparada: false,
      detalle: "No hay datos del periodo anterior para comparar",
      datos: { periodoDias, cobroActual, cobroAnterior },
    };
  }

  const drop = ((cobroAnterior - cobroActual) / cobroAnterior) * 100;

  if (drop <= condicion.umbral) {
    return {
      disparada: false,
      detalle: `Caida de ${drop.toFixed(1)}% (umbral: ${condicion.umbral}%)`,
      datos: { periodoDias, cobroActual, cobroAnterior, drop: Math.round(drop * 100) / 100 },
    };
  }

  return {
    disparada: true,
    detalle: `Caida de ingresos del ${drop.toFixed(1)}% vs periodo anterior (umbral: ${condicion.umbral}%)`,
    datos: { periodoDias, cobroActual, cobroAnterior, drop: Math.round(drop * 100) / 100 },
  };
}

/**
 * Evalua todas las reglas activas contra los snapshots de datos.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function evaluarReglas(
  reglas: Regla[],
  data: DataSnapshots,
): ResultadoEvaluacion[] {
  const ahora = new Date().toISOString();
  return reglas
    .filter((r) => r.activo)
    .map((r) => {
      const resultado = evaluarCondicion(r.condicion, data);
      return {
        reglaId: r.id,
        reglaNombre: r.nombre,
        disparada: resultado.disparada,
        detalle: resultado.detalle,
        datos: JSON.stringify(resultado.datos),
        evaluadoAt: ahora,
      };
    });
}

/**
 * Valida la definicion de una regla.
 * Devuelve un mensaje de error o null si es valida.
 */
export function validarRegla(regla: {
  nombre: string;
  condicion: Condicion;
  accion: Accion;
}): string | null {
  if (!regla.nombre.trim()) return "El nombre es obligatorio.";

  const tiposCondicion: CondicionTipo[] = ["stock_bajo", "pago_vencido", "caja_negativa", "revenue_drop"];
  if (!tiposCondicion.includes(regla.condicion.tipo)) return "Tipo de condicion invalido.";

  if (typeof regla.condicion.umbral !== "number" || regla.condicion.umbral < 0) {
    return "El umbral debe ser un numero positivo.";
  }

  const tiposAccion: AccionTipo[] = ["alerta", "notificacion", "flag"];
  if (!tiposAccion.includes(regla.accion.tipo)) return "Tipo de accion invalido.";

  if (!regla.accion.destino.trim()) return "El destino de la accion es obligatorio.";
  if (!regla.accion.mensaje.trim()) return "El mensaje de la accion es obligatorio.";

  return null;
}
