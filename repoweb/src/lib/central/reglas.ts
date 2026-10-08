/** Rutas que Mercado puede pedir. La suscripción del puesto no está. */
export const RUTAS_MERCADO = [
  "legal-documents",
  "contracts",
  "contracts/pending",
  "contracts/current",
  "contracts/history",
] as const;

export function rutaPermitida(modo: "mostrador" | "mercado", ruta: string) {
  if (modo === "mostrador") return true;
  if (ruta === "subscription" || ruta === "addons") return false;
  return (RUTAS_MERCADO as readonly string[]).includes(ruta) || /^contracts\/[^/]+\/accept$/.test(ruta);
}

/** La aceptación no se encola. Sin red no hay POST. */
export function bloqueoSinRed(method: string, online: boolean) {
  if (method === "POST" && !online) return "Sin conexión no se puede aceptar. El servidor tiene que volver a calcular el hash.";
  return null;
}

export function etiquetaCargo(charge: string, frequency: string) {
  if (charge === "setup") return "Implementación";
  if (frequency === "once") return "Cargo puntual";
  if (frequency === "yearly") return "Abono anual";
  return "Abono";
}

export function etiquetaEstado(status: string) {
  const mapa: Record<string, string> = {
    pending: "Pendiente",
    active: "Activa",
    past_due: "Vencida",
    paused: "Pausada",
    suspended: "Suspendida",
    cancelled: "Cancelada",
  };
  return mapa[status] ?? status;
}

export function etiquetaAjuste(kind: string) {
  const mapa: Record<string, string> = {
    bonus: "Bonificación",
    discount: "Descuento",
    freeze: "Precio congelado",
    commission_override: "Comisión",
  };
  return mapa[kind] ?? kind;
}

/** Muestra el número que mandó el servidor. No convierte ni descuenta. */
export function textoImporte(currency: string, value: number) {
  const texto = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${currency} ${texto}`;
}
