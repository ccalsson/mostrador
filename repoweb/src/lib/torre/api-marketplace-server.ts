import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { newId } from "@/lib/ids";
import { auditar } from "@/lib/torre/audit";
import { exigirAccion } from "@/lib/torre/roles";
import {
  validarApiKey,
  validarWebhook,
  type ApiKey,
  type ApiKeyCreada,
  type Webhook,
  type WebhookLogEntry,
} from "./api-marketplace-core";
import { generarApiKey } from "./api-marketplace-keys";

export async function listarApiKeysCore(_email: string): Promise<ApiKey[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    client_id: string;
    client_nombre: string;
    nombre: string;
    key_prefix: string;
    scopes: string[];
    rate_limit_rpm: unknown;
    activo: boolean;
    ultimo_uso_at: string | null;
    expires_at: string | null;
    created_at: string;
  }>`
    select ak.id, ak.client_id, c.name as client_nombre, ak.nombre, ak.key_prefix,
           ak.scopes, ak.rate_limit_rpm, ak.activo,
           ak.ultimo_uso_at::text as ultimo_uso_at,
           ak.expires_at::text as expires_at,
           ak.created_at::text as created_at
    from torre.api_keys ak
    join torre.saas_clients c on c.id = ak.client_id
    order by ak.created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientNombre: r.client_nombre,
    nombre: r.nombre,
    keyPrefix: r.key_prefix,
    scopes: r.scopes,
    rateLimitRpm: num(r.rate_limit_rpm),
    activo: r.activo,
    ultimoUso: r.ultimo_uso_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

export type CrearApiKeyInput = {
  clientId: string;
  nombre: string;
  scopes: string[];
  rateLimitRpm: number;
  expiresAt: string | null;
};

export async function crearApiKeyCore(email: string, data: CrearApiKeyInput): Promise<ApiKeyCreada> {
  await exigirAccion(email, "comercial");
  const error = validarApiKey({ nombre: data.nombre, scopes: data.scopes, rateLimitRpm: data.rateLimitRpm });
  if (error) throw new Error(error);

  const sql = await getSql();
  const id = newId("apk");
  const { keyPlano, keyHash, keyPrefix } = generarApiKey();

  await sql`
    insert into torre.api_keys (id, client_id, nombre, key_hash, key_prefix, scopes, rate_limit_rpm, expires_at)
    values (${id}, ${data.clientId}, ${data.nombre.trim()}, ${keyHash}, ${keyPrefix},
            ${data.scopes}, ${data.rateLimitRpm}, ${data.expiresAt ? data.expiresAt + "::date" : null})
  `;

  await auditar(email, "crear_api_key", "api_key", id, { nombre: data.nombre.trim(), clientId: data.clientId });

  const rows = await sql<{
    id: string;
    client_id: string;
    client_nombre: string;
    nombre: string;
    key_prefix: string;
    scopes: string[];
    rate_limit_rpm: unknown;
    activo: boolean;
    ultimo_uso_at: string | null;
    expires_at: string | null;
    created_at: string;
  }>`
    select ak.id, ak.client_id, c.name as client_nombre, ak.nombre, ak.key_prefix,
           ak.scopes, ak.rate_limit_rpm, ak.activo,
           ak.ultimo_uso_at::text as ultimo_uso_at,
           ak.expires_at::text as expires_at,
           ak.created_at::text as created_at
    from torre.api_keys ak
    join torre.saas_clients c on c.id = ak.client_id
    where ak.id = ${id}
  `;

  const r = rows[0];
  return {
    id: r.id,
    clientId: r.client_id,
    clientNombre: r.client_nombre,
    nombre: r.nombre,
    keyPrefix: r.key_prefix,
    scopes: r.scopes,
    rateLimitRpm: num(r.rate_limit_rpm),
    activo: r.activo,
    ultimoUso: r.ultimo_uso_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    keyPlano,
  };
}

export async function revocarApiKeyCore(email: string, id: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string }>`select id from torre.api_keys where id = ${id}`;
  if (!prev[0]) throw new Error("No existe esa API key.");

  await sql`update torre.api_keys set activo = false where id = ${id}`;
  await auditar(email, "revocar_api_key", "api_key", id, {});
}

export async function listarWebhooksCore(_email: string): Promise<Webhook[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    client_id: string;
    client_nombre: string;
    url: string;
    eventos: string[];
    activo: boolean;
    created_at: string;
  }>`
    select w.id, w.client_id, c.name as client_nombre, w.url, w.eventos, w.activo, w.created_at::text as created_at
    from torre.webhooks w
    join torre.saas_clients c on c.id = w.client_id
    order by w.created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientNombre: r.client_nombre,
    url: r.url,
    eventos: r.eventos,
    activo: r.activo,
    createdAt: r.created_at,
  }));
}

export type CrearWebhookInput = {
  clientId: string;
  url: string;
  eventos: string[];
};

export async function crearWebhookCore(email: string, data: CrearWebhookInput): Promise<Webhook> {
  await exigirAccion(email, "comercial");
  const error = validarWebhook({ url: data.url, eventos: data.eventos });
  if (error) throw new Error(error);

  const sql = await getSql();
  const id = newId("whk");
  const secreto = randomBytes(32).toString("hex");

  await sql`
    insert into torre.webhooks (id, client_id, url, eventos, secreto)
    values (${id}, ${data.clientId}, ${data.url.trim()}, ${data.eventos}, ${secreto})
  `;

  await auditar(email, "crear_webhook", "webhook", id, { url: data.url.trim(), clientId: data.clientId });

  const rows = await sql<{
    id: string;
    client_id: string;
    client_nombre: string;
    url: string;
    eventos: string[];
    activo: boolean;
    created_at: string;
  }>`
    select w.id, w.client_id, c.name as client_nombre, w.url, w.eventos, w.activo, w.created_at::text as created_at
    from torre.webhooks w
    join torre.saas_clients c on c.id = w.client_id
    where w.id = ${id}
  `;

  const r = rows[0];
  return {
    id: r.id,
    clientId: r.client_id,
    clientNombre: r.client_nombre,
    url: r.url,
    eventos: r.eventos,
    activo: r.activo,
    createdAt: r.created_at,
  };
}

export async function eliminarWebhookCore(email: string, id: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string }>`select id from torre.webhooks where id = ${id}`;
  if (!prev[0]) throw new Error("No existe ese webhook.");

  await sql`delete from torre.webhooks_log where webhook_id = ${id}`;
  await sql`delete from torre.webhooks where id = ${id}`;
  await auditar(email, "eliminar_webhook", "webhook", id, {});
}

export async function listarWebhookLogCore(_email: string, webhookId: string, limite: number = 50): Promise<WebhookLogEntry[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    webhook_id: string;
    evento: string;
    status_code: number | null;
    respuesta_ms: number | null;
    exito: boolean;
    error: string | null;
    created_at: string;
  }>`
    select id, webhook_id, evento, status_code, respuesta_ms, exito, error, created_at::text as created_at
    from torre.webhooks_log
    where webhook_id = ${webhookId}
    order by created_at desc
    limit ${limite}
  `;

  return rows.map((r) => ({
    id: r.id,
    webhookId: r.webhook_id,
    evento: r.evento,
    statusCode: num(r.status_code),
    respuestaMs: num(r.respuesta_ms),
    exito: r.exito,
    error: r.error,
    createdAt: r.created_at,
  }));
}
