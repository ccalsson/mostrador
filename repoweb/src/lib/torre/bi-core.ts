/**
 * Logica pura de BI & Forecasting.
 * Sin dependencias de base de datos para facilitar tests unitarios.
 */

// ─── Tipos ─────────────────────────────────────────────────────────

export type PuntoTiempo = { fecha: string; valor: number };

export type TendenciaRevenue = {
  historico: PuntoTiempo[];
  forecast: PuntoTiempo[];
  pendiente: number;
  crecimientoPct: number;
  rCuadrado: number;
};

export type PrediccionDemanda = {
  producto: string;
  tenantNombre: string;
  promedioDiario: number;
  tendencia: "subiendo" | "bajando" | "estable";
  prediccion7Dias: number;
  confianza: number;
};

export type RiesgoChurn = {
  clienteId: string;
  clienteNombre: string;
  email: string;
  score: number;
  factores: string[];
  ultimaActividad: string;
};

export type ProyeccionFinancial = {
  mes: string;
  ingresosReales: number | null;
  ingresosProyectados: number;
  gastosReales: number | null;
  gastosProyectados: number;
  resultadoProyectado: number;
};

export type BIResult = {
  revenue: TendenciaRevenue;
  demanda: PrediccionDemanda[];
  churn: RiesgoChurn[];
  proyeccion: ProyeccionFinancial[];
  generadoAt: string;
};

// ─── Helpers ───────────────────────────────────────────────────────

function dia(iso: string): string {
  return iso.slice(0, 10);
}

function diasEntre(a: string, b: string): number {
  const msDia = 86_400_000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msDia);
}

function agregarDias(fecha: string, dias: number): string {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ─── Regresion lineal (minimos cuadrados) ──────────────────────────

/**
 * Calcula la tendencia lineal de una serie temporal.
 * Usa el metodo de minimos cuadrados sobre indices numericos de fecha.
 */
export function calcularTendencia(puntos: PuntoTiempo[]): { pendiente: number; intercepto: number; rCuadrado: number } {
  if (puntos.length === 0) {
    return { pendiente: 0, intercepto: 0, rCuadrado: 0 };
  }
  if (puntos.length === 1) {
    return { pendiente: 0, intercepto: puntos[0].valor, rCuadrado: 1 };
  }

  const fechaBase = puntos[0].fecha;
  const xs = puntos.map((p) => diasEntre(fechaBase, p.fecha));
  const ys = puntos.map((p) => p.valor);
  const n = xs.length;

  const sumaX = xs.reduce((a, b) => a + b, 0);
  const sumaY = ys.reduce((a, b) => a + b, 0);
  const sumaXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumaX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const sumaY2 = ys.reduce((acc, y) => acc + y * y, 0);

  const denom = n * sumaX2 - sumaX * sumaX;
  if (denom === 0) {
    return { pendiente: 0, intercepto: sumaY / n, rCuadrado: 0 };
  }

  const pendiente = (n * sumaXY - sumaX * sumaY) / denom;
  const intercepto = (sumaY - pendiente * sumaX) / n;

  // R-cuadrado (coeficiente de determinacion)
  const mediaY = sumaY / n;
  const ssTot = sumaY2 - n * mediaY * mediaY;
  const ssRes = ys.reduce((acc, y, i) => {
    const predicho = pendiente * xs[i] + intercepto;
    return acc + (y - predicho) * (y - predicho);
  }, 0);

  const rCuadrado = ssTot === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));

  return {
    pendiente: Math.round(pendiente * 100) / 100,
    intercepto: Math.round(intercepto * 100) / 100,
    rCuadrado: Math.round(rCuadrado * 10000) / 10000,
  };
}

// ─── Tendencia de Revenue con forecast ─────────────────────────────

/**
 * Calcula la tendencia de revenue y proyecta hacia adelante.
 */
export function calcularTendenciaRevenue(historico: PuntoTiempo[], diasForecast: number): TendenciaRevenue {
  if (historico.length === 0) {
    return {
      historico: [],
      forecast: [],
      pendiente: 0,
      crecimientoPct: 0,
      rCuadrado: 0,
    };
  }

  const { pendiente, intercepto } = calcularTendencia(historico);
  const { rCuadrado } = calcularTendencia(historico);

  const ultimaFecha = historico[historico.length - 1].fecha;
  const fechaBase = historico[0].fecha;
  const ultimoIdx = diasEntre(fechaBase, ultimaFecha);

  const forecast: PuntoTiempo[] = [];
  for (let i = 1; i <= diasForecast; i++) {
    const fecha = agregarDias(ultimaFecha, i);
    const idx = ultimoIdx + i;
    const valor = Math.max(0, Math.round((pendiente * idx + intercepto) * 100) / 100);
    forecast.push({ fecha, valor });
  }

  // Crecimiento mensual: pendiente * 30 dias como porcentaje del valor promedio
  const promedio = historico.reduce((acc, p) => acc + p.valor, 0) / historico.length;
  const crecimientoMensual = promedio > 0 ? (pendiente * 30) / promedio * 100 : 0;

  return {
    historico,
    forecast,
    pendiente,
    crecimientoPct: Math.round(crecimientoMensual * 100) / 100,
    rCuadrado,
  };
}

// ─── Prediccion de demanda ─────────────────────────────────────────

type MovimientoRaw = {
  producto: string;
  tenantNombre: string;
  cantidad: number;
  fecha: string;
};

/**
 * Predice la demanda agrupando movimientos por producto+tenant.
 * Detecta tendencia comparando la primera y segunda mitad del periodo.
 */
export function predecirDemanda(movimientos: MovimientoRaw[]): PrediccionDemanda[] {
  if (movimientos.length === 0) return [];

  // Agrupar por producto + tenant
  const grupos = new Map<string, { producto: string; tenantNombre: string; valores: Map<string, number> }>();

  for (const m of movimientos) {
    const key = `${m.producto}||${m.tenantNombre}`;
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = { producto: m.producto, tenantNombre: m.tenantNombre, valores: new Map() };
      grupos.set(key, grupo);
    }
    const d = dia(m.fecha);
    grupo.valores.set(d, (grupo.valores.get(d) ?? 0) + m.cantidad);
  }

  const resultados: PrediccionDemanda[] = [];

  for (const [, grupo] of grupos) {
    const diasOrdenados = [...grupo.valores.keys()].sort();
    const valoresDiarios = diasOrdenados.map((d) => grupo.valores.get(d) ?? 0);
    const totalDias = diasOrdenados.length;

    const promedioDiario = totalDias > 0
      ? Math.round((valoresDiarios.reduce((a, b) => a + b, 0) / totalDias) * 100) / 100
      : 0;

    // Detectar tendencia: comparar primera mitad vs segunda mitad
    const mitad = Math.floor(totalDias / 2);
    let tendencia: "subiendo" | "bajando" | "estable" = "estable";

    if (totalDias >= 4) {
      const primeraMitad = valoresDiarios.slice(0, mitad);
      const segundaMitad = valoresDiarios.slice(mitad);
      const promPrimera = primeraMitad.reduce((a, b) => a + b, 0) / primeraMitad.length;
      const promSegunda = segundaMitad.reduce((a, b) => a + b, 0) / segundaMitad.length;

      if (promPrimera > 0) {
        const cambio = (promSegunda - promPrimera) / promPrimera;
        if (cambio > 0.1) tendencia = "subiendo";
        else if (cambio < -0.1) tendencia = "bajando";
      } else if (promSegunda > 0) {
        tendencia = "subiendo";
      }
    }

    // Confianza: basada en cuantos dias con datos hay y la consistencia
    let confianza = 0;
    if (totalDias > 0) {
      const factorCobertura = Math.min(1, totalDias / 14); // 14+ dias = cobertura completa
      const media = promedioDiario;
      if (media > 0) {
        const varianza = valoresDiarios.reduce((acc, v) => acc + (v - media) * (v - media), 0) / totalDias;
        const cv = Math.sqrt(varianza) / media; // coeficiente de variacion
        const factorConsistencia = Math.max(0, 1 - cv);
        confianza = Math.round(((factorCobertura * 0.5 + factorConsistencia * 0.5)) * 100) / 100;
      } else {
        confianza = Math.round(factorCobertura * 50) / 100;
      }
    }

    // Prediccion 7 dias
    const prediccion7Dias = Math.round(promedioDiario * 7 * 100) / 100;

    resultados.push({
      producto: grupo.producto,
      tenantNombre: grupo.tenantNombre,
      promedioDiario,
      tendencia,
      prediccion7Dias,
      confianza: Math.min(1, Math.max(0, confianza)),
    });
  }

  resultados.sort((a, b) => b.prediccion7Dias - a.prediccion7Dias);
  return resultados;
}

// ─── Riesgo de Churn ───────────────────────────────────────────────

type ClienteRaw = {
  id: string;
  nombre: string;
  email: string;
  ultimaActividad: string;
  totalCompras: number;
  promedioMes: number;
  mesesActivo: number;
};

/**
 * Calcula el riesgo de churn de cada cliente.
 * Score 0-100 basado en: dias sin actividad (0-40), declive de frecuencia (0-30), caida de ticket (0-30).
 */
export function calcularRiesgoChurn(clientes: ClienteRaw[]): RiesgoChurn[] {
  if (clientes.length === 0) return [];

  const hoy = new Date().toISOString().slice(0, 10);

  return clientes.map((c) => {
    const factores: string[] = [];
    let score = 0;

    // Factor 1: Dias desde ultima actividad (0-40 puntos)
    const diasInactivo = Math.max(0, diasEntre(c.ultimaActividad, hoy));
    if (diasInactivo > 90) {
      score += 40;
      factores.push(`Sin actividad hace ${diasInactivo} dias`);
    } else if (diasInactivo > 60) {
      score += 30;
      factores.push(`Sin actividad hace ${diasInactivo} dias`);
    } else if (diasInactivo > 30) {
      score += 20;
      factores.push(`Ultima actividad hace ${diasInactivo} dias`);
    } else if (diasInactivo > 14) {
      score += 10;
    }

    // Factor 2: Frecuencia de compra vs expectativa (0-30 puntos)
    if (c.mesesActivo > 0) {
      const frecuenciaEsperada = c.totalCompras / c.mesesActivo;
      const frecuenciaReal = c.promedioMes;
      if (frecuenciaEsperada > 0) {
        const ratio = frecuenciaReal / frecuenciaEsperada;
        if (ratio < 0.3) {
          score += 30;
          factores.push("Frecuencia de compra muy baja");
        } else if (ratio < 0.5) {
          score += 20;
          factores.push("Frecuencia de compra en declive");
        } else if (ratio < 0.8) {
          score += 10;
          factores.push("Frecuencia de compra algo baja");
        }
      }
    }

    // Factor 3: Ticket promedio (0-30 puntos) - simplificado
    // Si el cliente tiene pocas compras y bajo promedio, sumar puntos
    if (c.totalCompras > 0 && c.mesesActivo > 0) {
      const ticketPromedio = c.totalCompras / Math.max(1, c.mesesActivo);
      if (ticketPromedio < c.promedioMes * 0.5 && c.promedioMes > 0) {
        score += 15;
        factores.push("Ticket promedio en baja");
      }
    }

    // Si es cliente nuevo con poca actividad, reducir score
    if (c.mesesActivo <= 1 && c.totalCompras <= 1) {
      score = Math.max(0, score - 10);
    }

    score = Math.min(100, Math.max(0, score));

    return {
      clienteId: c.id,
      clienteNombre: c.nombre,
      email: c.email,
      score,
      factores: factores.length > 0 ? factores : ["Actividad normal"],
      ultimaActividad: c.ultimaActividad,
    };
  }).sort((a, b) => b.score - a.score);
}

// ─── Proyecciones financieras ──────────────────────────────────────

const MESES_NOMBRE = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function mesKey(fecha: string): string {
  return fecha.slice(0, 7); // "YYYY-MM"
}

function mesLabel(key: string): string {
  const [anio, mes] = key.split("-");
  return `${MESES_NOMBRE[Number(mes) - 1]} ${anio}`;
}

function siguienteMes(key: string): string {
  let [anio, mes] = key.split("-").map(Number);
  mes += 1;
  if (mes > 12) {
    mes = 1;
    anio += 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/**
 * Proyecta ingresos y gastos usando tendencia lineal.
 * Devuelve los meses reales + los proyectados.
 */
export function proyectarFinanzas(
  historicoIngresos: PuntoTiempo[],
  historicoGastos: PuntoTiempo[],
  mesesProyectar: number,
): ProyeccionFinancial[] {
  // Agrupar por mes
  const ingresosPorMes = new Map<string, number>();
  for (const p of historicoIngresos) {
    const mk = mesKey(p.fecha);
    ingresosPorMes.set(mk, (ingresosPorMes.get(mk) ?? 0) + p.valor);
  }

  const gastosPorMes = new Map<string, number>();
  for (const p of historicoGastos) {
    const mk = mesKey(p.fecha);
    gastosPorMes.set(mk, (gastosPorMes.get(mk) ?? 0) + p.valor);
  }

  // Obtener todos los meses unicos ordenados
  const todosMeses = new Set([...ingresosPorMes.keys(), ...gastosPorMes.keys()]);
  const mesesOrdenados = [...todosMeses].sort();

  if (mesesOrdenados.length === 0) {
    const resultado: ProyeccionFinancial[] = [];
    const ahora = new Date();
    let mk = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
    for (let i = 0; i < mesesProyectar; i++) {
      resultado.push({
        mes: mesLabel(mk),
        ingresosReales: null,
        ingresosProyectados: 0,
        gastosReales: null,
        gastosProyectados: 0,
        resultadoProyectado: 0,
      });
      mk = siguienteMes(mk);
    }
    return resultado;
  }

  // Construir puntos de tiempo mensuales para regresion
  const mesBase = mesesOrdenados[0];
  const puntosIngresos: PuntoTiempo[] = mesesOrdenados.map((mk) => ({
    fecha: `${mk}-15`,
    valor: ingresosPorMes.get(mk) ?? 0,
  }));
  const puntosGastos: PuntoTiempo[] = mesesOrdenados.map((mk) => ({
    fecha: `${mk}-15`,
    valor: gastosPorMes.get(mk) ?? 0,
  }));

  const regIng = calcularTendencia(puntosIngresos);
  const regGas = calcularTendencia(puntosGastos);

  // Funcion para evaluar la regresion en un mes dado (por indice de mes desde base)
  function idxMes(mk: string): number {
    const [a1, m1] = mesBase.split("-").map(Number);
    const [a2, m2] = mk.split("-").map(Number);
    return (a2 - a1) * 12 + (m2 - m1);
  }

  function evaluarReg(reg: { pendiente: number; intercepto: number }, idx: number): number {
    return Math.max(0, Math.round((reg.pendiente * idx + reg.intercepto) * 100) / 100);
  }

  // Construir resultado: meses reales + proyectados
  const resultado: ProyeccionFinancial[] = [];

  // Meses reales
  for (const mk of mesesOrdenados) {
    const idx = idxMes(mk);
    resultado.push({
      mes: mesLabel(mk),
      ingresosReales: Math.round((ingresosPorMes.get(mk) ?? 0) * 100) / 100,
      ingresosProyectados: evaluarReg(regIng, idx),
      gastosReales: Math.round((gastosPorMes.get(mk) ?? 0) * 100) / 100,
      gastosProyectados: evaluarReg(regGas, idx),
      resultadoProyectado: Math.round(
        (evaluarReg(regIng, idx) - evaluarReg(regGas, idx)) * 100,
      ) / 100,
    });
  }

  // Meses proyectados
  let ultimoMes = mesesOrdenados[mesesOrdenados.length - 1];
  for (let i = 0; i < mesesProyectar; i++) {
    ultimoMes = siguienteMes(ultimoMes);
    const idx = idxMes(ultimoMes);
    const ing = evaluarReg(regIng, idx);
    const gas = evaluarReg(regGas, idx);
    resultado.push({
      mes: mesLabel(ultimoMes),
      ingresosReales: null,
      ingresosProyectados: ing,
      gastosReales: null,
      gastosProyectados: gas,
      resultadoProyectado: Math.round((ing - gas) * 100) / 100,
    });
  }

  return resultado;
}
