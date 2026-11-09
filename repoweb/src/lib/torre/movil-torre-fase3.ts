import type { TorreFnMovil } from "@/lib/torre/movil-tipos";
import type { Accion, Condicion, CondicionTipo } from "@/lib/torre/reglas-auto-core";
import type { AccionTipo } from "@/lib/torre/reglas-auto-core";
import {
  actualizarReglaCore,
  crearReglaCore,
  eliminarReglaCore,
  evaluarReglasAhoraCore,
  listarLogReglasCore,
  listarReglasCore,
} from "@/lib/torre/reglas-auto-fn";
import { biResultadosCore } from "@/lib/torre/bi-fn";
import type { CondicionOferta, EventoTrigger, SegmentoPush } from "@/lib/torre/marketing-core";
import {
  cancelarCampaniaCore,
  crearCampaniaCore,
  crearOfertaCore,
  crearSecuenciaCore,
  enviarCampaniaCore,
  listarCampaniasCore,
  listarOfertasCore,
  listarSecuenciasCore,
  marketingResumenCore,
  toggleOfertaCore,
  toggleSecuenciaCore,
} from "@/lib/torre/marketing-fn";

// El móvil manda el id en el body: a veces como texto suelto (el validator web
// de esas funciones recibe el id directo) y a veces como { id }.
function idDe(data: any): string {
  return String(typeof data === "string" ? data : data?.id ?? "");
}

function num(value: unknown, porDefecto: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : porDefecto;
}

function texto(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// El body del teléfono viene sin validar y el core rechaza umbrales que no son
// number, así que se reconstruye la condición antes de pasarla.
function condicionDe(data: any): Condicion {
  const condicion = data?.condicion ?? data;
  const periodo = num(condicion?.periodoDias, 0);
  return {
    tipo: (texto(condicion?.tipo) || "stock_bajo") as CondicionTipo,
    umbral: num(condicion?.umbral, 0),
    periodoDias: periodo > 0 ? periodo : undefined,
  };
}

function accionDe(data: any): Accion {
  const accion = data?.accion ?? data;
  return {
    tipo: (texto(accion?.tipo) || "alerta") as AccionTipo,
    destino: texto(accion?.destino),
    mensaje: texto(accion?.mensaje),
  };
}

// Clave = nombre exacto del export web. La app Flutter llama /api/torre/v1/fn/<clave>.
export const torreFase3Movil: Record<string, TorreFnMovil> = {
  listarReglas: (email) => listarReglasCore(email),
  crearRegla: (email, data) =>
    crearReglaCore(email, {
      nombre: texto(data?.nombre),
      descripcion: texto(data?.descripcion),
      condicion: condicionDe(data),
      accion: accionDe(data),
      activo: data?.activo !== false,
    }),
  actualizarRegla: (email, data) =>
    actualizarReglaCore(email, idDe(data), {
      nombre: texto(data?.nombre),
      descripcion: texto(data?.descripcion),
      condicion: condicionDe(data),
      accion: accionDe(data),
      activo: data?.activo !== false,
    }),
  eliminarRegla: (email, data) => eliminarReglaCore(email, idDe(data)),
  evaluarReglasAhora: (email) => evaluarReglasAhoraCore(email),
  listarLogReglas: (email, data) => listarLogReglasCore(email, num(data?.limite, 50)),

  // Un forecast desbocado multiplicaría el bucle de proyección del core.
  biResultados: (email, data) =>
    biResultadosCore(email, {
      diasForecast: Math.min(120, Math.max(1, Math.trunc(num(data?.diasForecast, 30)))),
      mesesProyeccion: Math.min(12, Math.max(1, Math.trunc(num(data?.mesesProyeccion, 3)))),
    }),

  listarCampanias: (email) => listarCampaniasCore(email),
  crearCampania: (email, data) =>
    crearCampaniaCore(email, {
      nombre: texto(data?.nombre),
      segmento: (texto(data?.segmento) || "todos") as SegmentoPush,
      titulo: texto(data?.titulo),
      cuerpo: texto(data?.cuerpo),
      programadoAt: texto(data?.programadoAt) || null,
    }),
  enviarCampania: (email, data) => enviarCampaniaCore(email, idDe(data)),
  cancelarCampania: (email, data) => cancelarCampaniaCore(email, idDe(data)),

  listarSecuencias: (email) => listarSecuenciasCore(email),
  crearSecuencia: (email, data) =>
    crearSecuenciaCore(email, {
      nombre: texto(data?.nombre),
      eventoTrigger: (texto(data?.eventoTrigger) || "registro") as EventoTrigger,
      asunto: texto(data?.asunto),
      contenido: texto(data?.contenido),
    }),
  toggleSecuencia: (email, data) => toggleSecuenciaCore(email, idDe(data)),

  listarOfertas: (email) => listarOfertasCore(email),
  crearOferta: (email, data) =>
    crearOfertaCore(email, {
      nombre: texto(data?.nombre),
      condicion: (texto(data?.condicion) || "carrito_abandonado") as CondicionOferta,
      descuentoPct: num(data?.descuentoPct, 0),
      mensaje: texto(data?.mensaje),
    }),
  toggleOferta: (email, data) => toggleOfertaCore(email, idDe(data)),

  marketingResumen: (email) => marketingResumenCore(email),
};
