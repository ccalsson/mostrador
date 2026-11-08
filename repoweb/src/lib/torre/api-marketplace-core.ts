/**
 * Logica pura de API Marketplace.
 * Sin dependencias externas para facilitar tests unitarios.
 */
import { createHash, randomBytes } from "node:crypto";

export type ApiKey = {
  id: string;
  clientId: string;
  clientNombre: string;
  nombre: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitRpm: number;
  activo: boolean;
  ultimoUso: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type ApiKeyCreada = ApiKey & { keyPlano: string };

export type Webhook = {
  id: string;
  clientId: string;
  clientNombre: string;
  url: string;
  eventos: string[];
  activo: boolean;
  createdAt: string;
};

export type WebhookLogEntry = {
  id: string;
  webhookId: string;
  evento: string;
  statusCode: number | null;
  respuestaMs: number | null;
  exito: boolean;
  error: string | null;
  createdAt: string;
};

export type EventoWebhook =
  | "pedido.creado"
  | "pedido.cobrado"
  | "producto.stock_bajo"
  | "cliente.creado"
  | "pago.recibido";

export const SCOPES = ["read", "write", "webhooks"] as const;
export const EVENTOS: EventoWebhook[] = [
  "pedido.creado",
  "pedido.cobrado",
  "producto.stock_bajo",
  "cliente.creado",
  "pago.recibido",
];

/**
 * Valida los datos de una API key antes de crearla.
 * Devuelve un mensaje de error o null si es valido.
 */
export function validarApiKey(data: {
  nombre: string;
  scopes: string[];
  rateLimitRpm: number;
}): string | null {
  if (!data.nombre.trim()) return "El nombre de la clave es obligatorio.";
  if (!Array.isArray(data.scopes) || data.scopes.length === 0)
    return "Debe seleccionar al menos un scope.";
  for (const s of data.scopes) {
    if (!(SCOPES as readonly string[]).includes(s))
      return `Scope invalido: ${s}`;
  }
  if (!Number.isInteger(data.rateLimitRpm) || data.rateLimitRpm < 1)
    return "El rate limit debe ser un entero positivo.";
  return null;
}

/**
 * Valida los datos de un webhook antes de crearlo.
 * Devuelve un mensaje de error o null si es valido.
 */
export function validarWebhook(data: {
  url: string;
  eventos: string[];
}): string | null {
  if (!data.url.trim()) return "La URL del webhook es obligatoria.";
  try {
    const u = new URL(data.url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:")
      return "La URL debe ser HTTP o HTTPS.";
  } catch {
    return "La URL del webhook no es valida.";
  }
  if (!Array.isArray(data.eventos) || data.eventos.length === 0)
    return "Debe seleccionar al menos un evento.";
  for (const e of data.eventos) {
    if (!(EVENTOS as readonly string[]).includes(e as EventoWebhook))
      return `Evento invalido: ${e}`;
  }
  return null;
}

/**
 * Genera un prefijo de 8 caracteres para mostrar la key.
 * Formato: "mk_live_" + 4 bytes hex (8 chars).
 */
export function generarKeyPrefix(): string {
  return "mk_live_" + randomBytes(4).toString("hex");
}

/**
 * Genera una API key completa con su hash SHA-256 y prefijo.
 */
export function generarApiKey(): {
  keyPlano: string;
  keyHash: string;
  keyPrefix: string;
} {
  const keyPlano = "mk_" + randomBytes(32).toString("base64url");
  const keyHash = createHash("sha256").update(keyPlano).digest("hex");
  const keyPrefix = keyPlano.slice(0, 12) + "...";
  return { keyPlano, keyHash, keyPrefix };
}
