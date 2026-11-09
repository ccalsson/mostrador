import type { TorreFnMovil } from "@/lib/torre/movil-tipos";
import { dashboardEjecutivoCore } from "@/lib/torre/ejecutivo-fn";
import { cliente360Core, detalleCliente360Core } from "@/lib/torre/cliente-360-fn";
import { conciliacionCore, flujoCajaCore, plConsolidadoCore } from "@/lib/torre/financiero-fn";
import { catalogoUnificadoCore, listarTenantsCatalogoCore } from "@/lib/torre/catalogo-fn";
import {
  inventarioAlertasCore,
  inventarioMovimientosCore,
  inventarioResumenCore,
  inventarioStockCore,
} from "@/lib/torre/inventario-fn";
import { usuariosCentralizadosCore } from "@/lib/torre/usuarios-fn";

function periodo(value: unknown) {
  const n = Number(value);
  return n === 7 ? 7 : n === 30 ? 30 : 1;
}

function diasMovil(value: unknown) {
  const n = Number(value);
  return n === 1 || n === 30 ? n : 7;
}

// El móvil manda "" o null para "sin filtro"; los cores interpretan "" como texto
// a buscar y null como un valor tri-state real, así que aquí se descartan ambos.
// Un booleano falso sí se conserva: "No publicados" / "Inactivos" son filtros válidos.
function filtros(data: any): any {
  const out: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries<any>(data?.filtros ?? data ?? {})) {
    if (valor === "" || valor === null || valor === undefined) continue;
    out[clave] = valor;
  }
  return out;
}

// Clave = nombre exacto del export web. La app Flutter llama /api/torre/v1/fn/<clave>.
// El body JSON es el `data` que produce el validator de la función web.
export const torreNuevosMovil: Record<string, TorreFnMovil> = {
  dashboardEjecutivo: (email, data) => dashboardEjecutivoCore(email, periodo(data?.dias)),
  cliente360: (email, data) => cliente360Core(email, data?.filtros ?? data ?? {}),
  detalleCliente360: (email, data) => detalleCliente360Core(email, typeof data === "string" ? data : data?.id),
  plConsolidado: (email, data) => plConsolidadoCore(email, data),
  flujoCaja: (email, data) => flujoCajaCore(email, data),
  conciliacion: (email, data) => conciliacionCore(email, data),
  catalogoUnificado: (email, data) => catalogoUnificadoCore(email, filtros(data)),
  listarTenantsCatalogo: (email) => listarTenantsCatalogoCore(email),
  inventarioStock: (email, data) => inventarioStockCore(email, filtros(data)),
  inventarioMovimientos: (email, data) => inventarioMovimientosCore(email, { dias: diasMovil(data?.dias ?? data?.filtros?.dias) }),
  inventarioAlertas: (email) => inventarioAlertasCore(email),
  inventarioResumen: (email) => inventarioResumenCore(email),
  usuariosCentralizados: (email, data) => usuariosCentralizadosCore(email, filtros(data)),
};
