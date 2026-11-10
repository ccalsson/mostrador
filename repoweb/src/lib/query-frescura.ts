import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

export const INTERVALO_TABLERO = 15_000;
export const INTERVALO_TORRE = 60_000;

// Los tableros que quedan abiertos todo el día con tráfico entrando.
const RAPIDAS = ["dashboard-ejecutivo", "torre-operacion", "compras-pendientes", "torre-dash", "torre-comercial"];

// Cierre de mes, históricos completos, API externas y formularios: se refrescan con el botón.
const QUIETAS = ["torre-yo", "torre-sire", "torre-bi-forecast", "torre-acceso", "torre-fx", "torre-medio", "torre-cliente-stats", "torre-puesto-detalle", "clientes-360", "cliente-360", "pl-consolidado", "conciliacion"];

// El chrome de la consola no mide la frescura de la pantalla.
const CHROME = ["torre-panel", "torre-pedidos-addon"];
const FUERA_DEL_PREFIJO = ["flujo-caja"];

function claveDe(consulta: { queryKey: readonly unknown[] }) {
  return String(consulta.queryKey[0] ?? "");
}

export function intervaloTorre(consulta: { queryKey: readonly unknown[]; state: { status: string } }): number | false {
  if (consulta.state.status === "error") return false;
  const clave = claveDe(consulta);
  if (QUIETAS.includes(clave)) return false;
  if (RAPIDAS.includes(clave)) return INTERVALO_TABLERO;
  return clave.startsWith("torre-") || FUERA_DEL_PREFIJO.includes(clave) ? INTERVALO_TORRE : false;
}

export function refrescarPagina(qc: QueryClient) {
  return qc.invalidateQueries({ type: "active" });
}

export function haceCuanto(desde: number, ahora: number) {
  const segundos = Math.max(0, Math.round((ahora - desde) / 1000));
  if (segundos < 5) return "hace segundos";
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  return minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h`;
}

export function useFrescura() {
  const qc = useQueryClient();
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    let montado = true;
    const marcar = () => {
      queueMicrotask(() => {
        if (montado) setAhora(Date.now());
      });
    };
    const dejarDeEscuchar = qc.getQueryCache().subscribe(marcar);
    const reloj = setInterval(marcar, 1000);
    return () => {
      montado = false;
      dejarDeEscuchar();
      clearInterval(reloj);
    };
  }, [qc]);
  const activas = qc.getQueryCache().getAll().filter((c) => c.getObserversCount() > 0 && !CHROME.includes(claveDe(c)));
  const desde = activas.reduce((hasta, c) => Math.max(hasta, c.state.dataUpdatedAt), 0);
  return {
    etiqueta: desde && ahora ? `Actualizado ${haceCuanto(desde, ahora)}` : "Sin datos todavía",
    cargando: qc.isFetching() > 0,
  };
}
