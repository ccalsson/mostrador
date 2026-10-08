import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { getSql } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/server/bootstrap";
import { loadStaffByUserId } from "@/lib/server/context";
import { suscribirCanal, type AvisoMensaje } from "@/lib/server/mensajes-vivo";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX = 8 * 1024;
const COOKIE = "__Host-grok-auth.session_token";

type Frame = { opcode: number; data: Buffer };

/**
 * WebSocket mínimo (RFC 6455) solo para /api/mensajes en el dev server.
 * No usa el paquete `ws`. Vite sigue dueño del upgrade de HMR.
 */
export function aceptarMensajes(req: IncomingMessage, socket: Socket, head: Buffer): void {
  const key = req.headers["sec-websocket-key"];
  const version = req.headers["sec-websocket-version"];
  if (typeof key !== "string" || !key || version !== "13") {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return;
  }
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);

  let buf: Buffer = Buffer.alloc(0);
  let cerrado = false;
  let listo = false;
  let userId: string | null = null;
  const cookieToken = tokenDeCookie(req.headers.cookie);
  const bajas = new Map<string, () => void>();
  const oyente = (aviso: AvisoMensaje) => {
    enviar(socket, { tipo: "mensaje", pedidoId: aviso.pedidoId });
  };

  const holaTimer = setTimeout(() => {
    if (!listo) terminar(1008, "hola");
  }, 8000);
  const ping = setInterval(() => {
    if (!cerrado) {
      try {
        socket.write(encodeFrame(0x9, Buffer.alloc(0)));
      } catch {
        terminar(1001, "ping");
      }
    }
  }, 20000);

  function terminar(code = 1000, reason = "") {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(holaTimer);
    clearInterval(ping);
    for (const off of bajas.values()) off();
    bajas.clear();
    if (!socket.destroyed) {
      try {
        const why = Buffer.from(reason).subarray(0, 80);
        const payload = Buffer.alloc(2 + why.length);
        payload.writeUInt16BE(code, 0);
        why.copy(payload, 2);
        socket.write(encodeFrame(0x8, payload));
      } catch {
        /* ya cerrado */
      }
      socket.end();
    }
  }

  function unir(canal: string) {
    if (bajas.has(canal) || cerrado) return;
    bajas.set(canal, suscribirCanal(canal, oyente));
  }

  function soltar(canal: string) {
    const off = bajas.get(canal);
    if (!off) return;
    off();
    bajas.delete(canal);
  }

  async function alEntrar(msg: Record<string, unknown>) {
    if (msg.tipo !== "hola") return;
    const crudo = typeof msg.token === "string" ? msg.token : "";
    userId = (await usuarioDeToken(crudo)) ?? (await usuarioDeToken(cookieToken ?? ""));
    if (!userId || cerrado) {
      enviar(socket, { tipo: "error", mensaje: "No autorizado" });
      terminar(1008, "auth");
      return;
    }
    try {
      await ensureBootstrapped();
    } catch {
      terminar(1011, "db");
      return;
    }
    if (cerrado) return;
    listo = true;
    clearTimeout(holaTimer);
    enviar(socket, { tipo: "listo" });
  }

  async function alComando(msg: Record<string, unknown>) {
    if (!userId) return;
    if (bajas.size > 12 && msg.tipo !== "soltar") {
      enviar(socket, { tipo: "error", mensaje: "Demasiadas conversaciones abiertas." });
      return;
    }
    try {
      if (msg.tipo === "ver") {
        const pedidoId = typeof msg.pedidoId === "string" ? msg.pedidoId : "";
        if (!pedidoValido(pedidoId)) {
          enviar(socket, { tipo: "error", mensaje: "Pedido inválido." });
          return;
        }
        const ok = await puedeVer(userId, pedidoId);
        if (cerrado) return;
        if (!ok) {
          enviar(socket, { tipo: "error", mensaje: "No podés ver esa conversación." });
          return;
        }
        unir(`pedido:${pedidoId}`);
        enviar(socket, { tipo: "ok", canal: "ver", pedidoId });
        return;
      }
      if (msg.tipo === "bandeja") {
        const tenantId = await tenantAdmin(userId);
        if (cerrado) return;
        if (!tenantId) {
          enviar(socket, { tipo: "error", mensaje: "No tenés la bandeja." });
          return;
        }
        unir(`tenant:${tenantId}`);
        enviar(socket, { tipo: "ok", canal: "bandeja" });
        return;
      }
      if (msg.tipo === "mios") {
        const clienteId = await clienteDe(userId);
        if (cerrado) return;
        if (!clienteId) {
          enviar(socket, { tipo: "error", mensaje: "No hay ficha de cliente." });
          return;
        }
        unir(`cliente:${clienteId}`);
        enviar(socket, { tipo: "ok", canal: "mios" });
        return;
      }
      if (msg.tipo === "soltar") {
        const canal = msg.canal;
        if (canal === "ver" && typeof msg.pedidoId === "string" && pedidoValido(msg.pedidoId)) {
          soltar(`pedido:${msg.pedidoId}`);
        } else if (canal === "bandeja") {
          for (const nombre of [...bajas.keys()]) {
            if (nombre.startsWith("tenant:")) soltar(nombre);
          }
        } else if (canal === "mios") {
          for (const nombre of [...bajas.keys()]) {
            if (nombre.startsWith("cliente:")) soltar(nombre);
          }
        }
      }
    } catch {
      if (!cerrado) enviar(socket, { tipo: "error", mensaje: "No se pudo suscribir." });
    }
  }

  let cola: Promise<void> = Promise.resolve();

  function encolar(msg: Record<string, unknown>) {
    cola = cola
      .then(async () => {
        if (cerrado) return;
        if (!listo) await alEntrar(msg);
        else await alComando(msg);
      })
      .catch(() => {
        if (!cerrado) terminar(1011, "error");
      });
  }

  function onData(chunk: Buffer) {
    if (cerrado) return;
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > MAX * 2) {
      terminar(1009, "grande");
      return;
    }
    let frames: Frame[];
    try {
      const out = tomarFrames(buf);
      frames = out.frames;
      buf = out.rest;
    } catch {
      terminar(1002, "frame");
      return;
    }
    for (const frame of frames) {
      if (cerrado) return;
      if (frame.opcode === 0x8) {
        terminar(1000, "bye");
        return;
      }
      if (frame.opcode === 0x9) {
        try {
          socket.write(encodeFrame(0xa, frame.data));
        } catch {
          terminar(1001, "pong");
        }
        continue;
      }
      if (frame.opcode === 0xa) continue;
      if (frame.opcode !== 0x1) {
        terminar(1003, "bin");
        return;
      }
      let msg: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(frame.data.toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          terminar(1003, "json");
          return;
        }
        msg = parsed as Record<string, unknown>;
      } catch {
        terminar(1003, "json");
        return;
      }
      encolar(msg);
    }
  }

  socket.on("data", onData);
  socket.on("error", () => terminar(1001, "error"));
  socket.on("close", () => terminar(1000, "close"));
  if (head.length > 0) onData(head);
  socket.resume();
}

function tokenDeCookie(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header.join(";") : (header ?? "");
  if (!raw) return null;
  for (const parte of raw.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const nombre = parte.slice(0, i).trim();
    if (nombre !== COOKIE && nombre !== "better-auth.session_token") continue;
    try {
      return decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      return parte.slice(i + 1).trim();
    }
  }
  return null;
}

async function usuarioDeToken(token: string): Promise<string | null> {
  const limpio = token.trim().replace(/^"|"$/g, "");
  if (!limpio || limpio.length > 512) return null;
  const directo = await buscarSesion(limpio);
  if (directo) return directo;
  const punto = limpio.indexOf(".");
  if (punto > 8) return buscarSesion(limpio.slice(0, punto));
  return null;
}

async function buscarSesion(token: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ userId: string }>`
    select "userId" from "session"
    where "token" = ${token} and "expiresAt" > now()
    limit 1
  `;
  return rows[0]?.userId ?? null;
}

function pedidoValido(id: string): boolean {
  return /^[A-Za-z0-9_-]{4,80}$/.test(id);
}

async function clienteDe(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from clientes where user_id = ${userId} and activo = true limit 1
  `;
  return rows[0]?.id ?? null;
}

async function tenantAdmin(userId: string): Promise<string | null> {
  if (await clienteDe(userId)) return null;
  const staff = await loadStaffByUserId(userId);
  if (!staff || staff.rol !== "admin") return null;
  return staff.tenantId;
}

async function puedeVer(userId: string, pedidoId: string): Promise<boolean> {
  const sql = await getSql();
  const pedido = await sql<{ cliente_id: string | null; tenant_id: string }>`
    select cliente_id, tenant_id from pedidos where id = ${pedidoId} limit 1
  `;
  const row = pedido[0];
  if (!row?.cliente_id) return false;
  const ficha = await clienteDe(userId);
  if (ficha) return ficha === row.cliente_id;
  const staff = await loadStaffByUserId(userId);
  return Boolean(staff && staff.rol === "admin" && staff.tenantId === row.tenant_id);
}

function enviar(socket: Socket, obj: unknown) {
  if (socket.destroyed) return;
  socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj))));
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | (opcode & 0x0f);
  return Buffer.concat([header, payload]);
}

function tomarFrames(input: Buffer): { frames: Frame[]; rest: Buffer } {
  const frames: Frame[] = [];
  let buf = input;
  while (buf.length >= 2) {
    const b0 = buf[0] ?? 0;
    const b1 = buf[1] ?? 0;
    if ((b0 & 0x70) !== 0) throw new Error("rsv");
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      const big = buf.readBigUInt64BE(2);
      if (big > BigInt(MAX)) throw new Error("grande");
      len = Number(big);
      offset = 10;
    }
    if (len > MAX) throw new Error("grande");
    if (!masked) throw new Error("mask");
    if (!fin) throw new Error("frag");
    if (buf.length < offset + 4 + len) break;
    const mask = buf.subarray(offset, offset + 4);
    const data = Buffer.alloc(len);
    for (let i = 0; i < len; i += 1) data[i] = (buf[offset + 4 + i] ?? 0) ^ (mask[i & 3] ?? 0);
    frames.push({ opcode, data });
    buf = buf.subarray(offset + 4 + len);
  }
  return { frames, rest: Buffer.from(buf) as Buffer };
}
