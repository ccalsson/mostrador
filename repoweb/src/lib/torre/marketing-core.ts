/**
 * Logica pura de marketing automation.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type SegmentoPush = "todos" | "compradores" | "inactivos_30d" | "inactivos_60d" | "frecuentes";
export type EstadoCampania = "borrador" | "programada" | "enviada" | "cancelada";
export type EventoTrigger = "registro" | "primera_compra" | "inactividad_7d" | "inactividad_30d" | "cumpleanos";
export type CondicionOferta = "carrito_abandonado" | "compra_repetida" | "ticket_alto" | "cliente_nuevo";

export type CampaniaPush = {
  id: string;
  nombre: string;
  segmento: SegmentoPush;
  titulo: string;
  cuerpo: string;
  estado: EstadoCampania;
  programadoAt: string | null;
  enviadoAt: string | null;
  enviadosCount: number;
  createdAt: string;
};

export type SecuenciaEmail = {
  id: string;
  nombre: string;
  eventoTrigger: EventoTrigger;
  asunto: string;
  contenido: string;
  activo: boolean;
  createdAt: string;
};

export type OfertaAuto = {
  id: string;
  nombre: string;
  condicion: CondicionOferta;
  descuentoPct: number;
  mensaje: string;
  activo: boolean;
  createdAt: string;
};

export type MarketingResumen = {
  campanias: { total: number; activas: number; enviadas: number; pendientes: number };
  secuencias: { total: number; activas: number };
  ofertas: { total: number; activas: number };
};

const SEGMENTO_LABELS: Record<SegmentoPush, string> = {
  todos: "Todos los usuarios",
  compradores: "Compradores",
  inactivos_30d: "Inactivos 30 dias",
  inactivos_60d: "Inactivos 60 dias",
  frecuentes: "Compradores frecuentes",
};

const EVENTO_LABELS: Record<EventoTrigger, string> = {
  registro: "Registro de cuenta",
  primera_compra: "Primera compra",
  inactividad_7d: "Inactividad 7 dias",
  inactividad_30d: "Inactividad 30 dias",
  cumpleanos: "Cumpleanos",
};

const CONDICION_LABELS: Record<CondicionOferta, string> = {
  carrito_abandonado: "Carrito abandonado",
  compra_repetida: "Compra repetida",
  ticket_alto: "Ticket alto",
  cliente_nuevo: "Cliente nuevo",
};

export function segmentoLabel(s: SegmentoPush): string {
  return SEGMENTO_LABELS[s] ?? s;
}

export function eventoLabel(e: EventoTrigger): string {
  return EVENTO_LABELS[e] ?? e;
}

export function condicionLabel(c: CondicionOferta): string {
  return CONDICION_LABELS[c] ?? c;
}

const SEGMENTOS_VALIDOS: SegmentoPush[] = ["todos", "compradores", "inactivos_30d", "inactivos_60d", "frecuentes"];
const EVENTOS_VALIDOS: EventoTrigger[] = ["registro", "primera_compra", "inactividad_7d", "inactividad_30d", "cumpleanos"];
const CONDICIONES_VALIDAS: CondicionOferta[] = ["carrito_abandonado", "compra_repetida", "ticket_alto", "cliente_nuevo"];

/**
 * Valida una campania push antes de guardarla.
 * Devuelve un mensaje de error o null si es valida.
 */
export function validarCampania(c: { nombre: string; segmento: string; titulo: string; cuerpo: string }): string | null {
  if (!c.nombre.trim()) return "El nombre de la campania es obligatorio.";
  if (!SEGMENTOS_VALIDOS.includes(c.segmento as SegmentoPush)) return "Segmento invalido.";
  if (!c.titulo.trim()) return "El titulo del push es obligatorio.";
  if (!c.cuerpo.trim()) return "El cuerpo del push es obligatorio.";
  return null;
}

/**
 * Valida una secuencia de email antes de guardarla.
 * Devuelve un mensaje de error o null si es valida.
 */
export function validarSecuencia(s: { nombre: string; eventoTrigger: string; asunto: string; contenido: string }): string | null {
  if (!s.nombre.trim()) return "El nombre de la secuencia es obligatorio.";
  if (!EVENTOS_VALIDOS.includes(s.eventoTrigger as EventoTrigger)) return "Evento trigger invalido.";
  if (!s.asunto.trim()) return "El asunto del email es obligatorio.";
  if (!s.contenido.trim()) return "El contenido del email es obligatorio.";
  return null;
}

/**
 * Valida una oferta automatica antes de guardarla.
 * Devuelve un mensaje de error o null si es valida.
 */
export function validarOferta(o: { nombre: string; condicion: string; descuentoPct: number; mensaje: string }): string | null {
  if (!o.nombre.trim()) return "El nombre de la oferta es obligatorio.";
  if (!CONDICIONES_VALIDAS.includes(o.condicion as CondicionOferta)) return "Condicion invalida.";
  if (typeof o.descuentoPct !== "number" || o.descuentoPct < 0 || o.descuentoPct > 100) {
    return "El descuento debe ser un numero entre 0 y 100.";
  }
  if (!o.mensaje.trim()) return "El mensaje de la oferta es obligatorio.";
  return null;
}

/**
 * Calcula el resumen de marketing a partir de las listas de entidades.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function calcularResumen(
  campanias: CampaniaPush[],
  secuencias: SecuenciaEmail[],
  ofertas: OfertaAuto[],
): MarketingResumen {
  return {
    campanias: {
      total: campanias.length,
      activas: campanias.filter((c) => c.estado === "programada").length,
      enviadas: campanias.filter((c) => c.estado === "enviada").length,
      pendientes: campanias.filter((c) => c.estado === "borrador").length,
    },
    secuencias: {
      total: secuencias.length,
      activas: secuencias.filter((s) => s.activo).length,
    },
    ofertas: {
      total: ofertas.length,
      activas: ofertas.filter((o) => o.activo).length,
    },
  };
}
