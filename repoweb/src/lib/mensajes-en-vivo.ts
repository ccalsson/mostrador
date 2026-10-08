import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getBearerToken } from "@/lib/auth/client";

export type CanalVivo =
  | { tipo: "ver"; pedidoId: string }
  | { tipo: "bandeja" }
  | { tipo: "mios" };

type Sub = {
  canal: CanalVivo;
  onAviso: (pedidoId: string) => void;
};

let ws: WebSocket | null = null;
let abierto = false;
let fracasos = 0;
let idle: number | null = null;
let reintento: number | null = null;
const subs = new Set<Sub>();
const estados = new Set<(ok: boolean) => void>();

function avisarEstado() {
  for (const fn of estados) fn(abierto);
}

function clave(canal: CanalVivo): string {
  return canal.tipo === "ver" ? `ver:${canal.pedidoId}` : canal.tipo;
}

function contar(canal: CanalVivo): number {
  const k = clave(canal);
  let n = 0;
  for (const s of subs) if (clave(s.canal) === k) n += 1;
  return n;
}

function enviar(obj: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function suscribirEnSocket(canal: CanalVivo) {
  if (canal.tipo === "ver") enviar({ tipo: "ver", pedidoId: canal.pedidoId });
  else enviar({ tipo: canal.tipo });
}

function soltarEnSocket(canal: CanalVivo) {
  if (canal.tipo === "ver") enviar({ tipo: "soltar", canal: "ver", pedidoId: canal.pedidoId });
  else enviar({ tipo: "soltar", canal: canal.tipo });
}

function urlSocket(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/mensajes`;
}

function conectar() {
  if (typeof window === "undefined") return;
  if (subs.size === 0) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (fracasos >= 2) return;
  let socket: WebSocket;
  try {
    socket = new WebSocket(urlSocket());
  } catch {
    fracasos = 2;
    return;
  }
  ws = socket;
  const listoTimer = window.setTimeout(() => {
    if (ws === socket && !abierto) socket.close();
  }, 5000);
  socket.onopen = () => {
    if (ws !== socket) return;
    const token = getBearerToken();
    enviar(token ? { tipo: "hola", token } : { tipo: "hola" });
  };
  socket.onmessage = (ev) => {
    if (ws !== socket || typeof ev.data !== "string") return;
    let msg: { tipo?: string; pedidoId?: string };
    try {
      msg = JSON.parse(ev.data) as { tipo?: string; pedidoId?: string };
    } catch {
      return;
    }
    if (msg.tipo === "listo") {
      window.clearTimeout(listoTimer);
      abierto = true;
      fracasos = 0;
      avisarEstado();
      const vistos = new Set<string>();
      for (const s of subs) {
        const k = clave(s.canal);
        if (vistos.has(k)) continue;
        vistos.add(k);
        suscribirEnSocket(s.canal);
      }
      return;
    }
    if (msg.tipo === "error") {
      if (!abierto) {
        window.clearTimeout(listoTimer);
        fracasos = 2;
        socket.close();
      }
      return;
    }
    if (msg.tipo === "mensaje" && msg.pedidoId) {
      for (const s of subs) {
        if (s.canal.tipo === "ver" && s.canal.pedidoId !== msg.pedidoId) continue;
        s.onAviso(msg.pedidoId);
      }
    }
  };
  socket.onerror = () => {
    socket.close();
  };
  socket.onclose = () => {
    window.clearTimeout(listoTimer);
    if (ws !== socket) return;
    ws = null;
    const estaba = abierto;
    abierto = false;
    if (estaba) {
      avisarEstado();
      fracasos = 0;
    } else {
      fracasos += 1;
    }
    if (subs.size === 0 || fracasos >= 2) return;
    if (reintento) window.clearTimeout(reintento);
    reintento = window.setTimeout(() => {
      reintento = null;
      conectar();
    }, estaba ? 400 : 800);
  };
}

/** True cuando el socket de mensajes está abierto. Si no, hay que seguir sondeando. */
export function mensajesEnVivo(): boolean {
  return abierto;
}

export function seguirMensajes(canal: CanalVivo, onAviso: (pedidoId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const sub: Sub = { canal, onAviso };
  const antes = contar(canal);
  subs.add(sub);
  if (idle) {
    window.clearTimeout(idle);
    idle = null;
  }
  if (abierto && antes === 0) suscribirEnSocket(canal);
  else if (!abierto) conectar();
  return () => {
    subs.delete(sub);
    if (abierto && contar(canal) === 0) soltarEnSocket(canal);
    if (subs.size === 0) {
      idle = window.setTimeout(() => {
        idle = null;
        if (subs.size === 0) {
          fracasos = 0;
          ws?.close();
          ws = null;
          if (abierto) {
            abierto = false;
            avisarEstado();
          }
        }
      }, 4000);
    }
  };
}

function escucharEstado(fn: (ok: boolean) => void): () => void {
  estados.add(fn);
  return () => {
    estados.delete(fn);
  };
}

/** Se engancha al socket y avisa para refrescar la consulta. Devuelve si está en vivo. */
export function useMensajesVivo(canal: CanalVivo): boolean {
  const qc = useQueryClient();
  const [ok, setOk] = useState(false);
  const tipo = canal.tipo;
  const pedidoId = canal.tipo === "ver" ? canal.pedidoId : "";

  useEffect(() => {
    const actual: CanalVivo = tipo === "ver" ? { tipo: "ver", pedidoId } : tipo === "bandeja" ? { tipo: "bandeja" } : { tipo: "mios" };
    setOk(mensajesEnVivo());
    const off = escucharEstado(setOk);
    const stop = seguirMensajes(actual, (id) => {
      if (actual.tipo === "ver") void qc.invalidateQueries({ queryKey: ["mensajes", id] });
      else if (actual.tipo === "bandeja") void qc.invalidateQueries({ queryKey: ["conversaciones"] });
      else void qc.invalidateQueries({ queryKey: ["mis-sin-leer"] });
    });
    return () => {
      stop();
      off();
    };
  }, [tipo, pedidoId, qc]);

  return ok;
}
