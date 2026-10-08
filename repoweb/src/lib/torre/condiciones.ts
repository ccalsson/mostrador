export type LineaMercado = {
  family: string | null;
  tier: string | null;
  lineStatus: string;
  subscriptionStatus: string;
};

const SUSCRIPCION_VIGENTE = new Set(["active", "past_due"]);

/** Presencia o Pro solo si la línea y la suscripción siguen vigentes en Torre. */
export function tierContratado(lineas: LineaMercado[]): "presencia" | "pro" | null {
  const vigentes = lineas.filter(
    (linea) =>
      linea.family === "mercado" &&
      linea.lineStatus === "active" &&
      SUSCRIPCION_VIGENTE.has(linea.subscriptionStatus),
  );
  if (vigentes.some((linea) => linea.tier === "pro")) return "pro";
  if (vigentes.some((linea) => linea.tier === "presencia")) return "presencia";
  return null;
}

/** Publicado en el puesto y contratado en Torre. Una sola de las dos no alcanza. */
export function apareceEnMercado(publicado: boolean, tier: "presencia" | "pro" | null) {
  return publicado && tier != null;
}

/** El catálogo dice que la cuenta corriente viene con Pro, no con Presencia. */
export function permiteCuentaCorriente(tier: "presencia" | "pro" | null) {
  return tier === "pro";
}

export type ComisionResuelta = {
  source: "override" | "policy" | "none";
  percent: number | null;
  percentMin: number | null;
  percentMax: number | null;
};

/** Elige la fila vigente. No convierte el porcentaje en un importe. */
export function resolverComision(input: {
  overrideVigente: boolean;
  overridePercent: number | null;
  policyMin: number | null;
  policyMax: number | null;
}): ComisionResuelta {
  if (input.overrideVigente) {
    return {
      source: "override",
      percent: input.overridePercent,
      percentMin: null,
      percentMax: null,
    };
  }
  if (input.policyMin != null && input.policyMax != null) {
    return {
      source: "policy",
      percent: null,
      percentMin: input.policyMin,
      percentMax: input.policyMax,
    };
  }
  return { source: "none", percent: null, percentMin: null, percentMax: null };
}

/** Muestra la condición ya guardada. No la vuelve a calcular. */
export function textoCondicion(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { source?: string; percent?: number | null; percentMin?: number | null; percentMax?: number | null };
  if (row.source === "override" && typeof row.percent === "number") return `Comisión: ${row.percent}%`;
  if (row.source === "policy" && typeof row.percentMin === "number" && typeof row.percentMax === "number") {
    return `Comisión: entre ${row.percentMin}% y ${row.percentMax}%`;
  }
  return null;
}
