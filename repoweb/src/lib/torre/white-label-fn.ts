import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { auditar } from "@/lib/torre/audit";
import { exigirAccion } from "@/lib/torre/roles";
import {
  validarWhiteLabel,
  type WhiteLabelConfig,
  type WhiteLabelInput,
} from "./white-label-core";

export type { WhiteLabelConfig, WhiteLabelInput } from "./white-label-core";
export { validarWhiteLabel, esHexValid, contrasteTexto, TEMPLATES, FUENTES } from "./white-label-core";

// --- Listar configs white-label ---

export async function listarWhiteLabelCore(_email: string): Promise<WhiteLabelConfig[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    client_nombre: string;
    marca_nombre: string;
    logo_url: string;
    color_primario: string;
    color_secundario: string;
    color_fondo: string;
    color_texto: string;
    fuente: string;
    template: string;
    dominio_propio: string | null;
    dominio_activo: boolean;
    created_at: string;
    updated_at: string;
  }>`
    select wl.id, wl.tenant_id, t.name as tenant_nombre, c.name as client_nombre,
           wl.marca_nombre, wl.logo_url, wl.color_primario, wl.color_secundario,
           wl.color_fondo, wl.color_texto, wl.fuente, wl.template,
           wl.dominio_propio, wl.dominio_activo,
           wl.created_at::text as created_at, wl.updated_at::text as updated_at
    from torre.white_label_config wl
    join torre.saas_tenants t on t.id = wl.tenant_id
    join torre.saas_clients c on c.id = t.client_id
    order by lower(c.name), lower(t.name)
  `;

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    clientNombre: r.client_nombre,
    marcaNombre: r.marca_nombre,
    logoUrl: r.logo_url,
    colorPrimario: r.color_primario,
    colorSecundario: r.color_secundario,
    colorFondo: r.color_fondo,
    colorTexto: r.color_texto,
    fuente: r.fuente,
    template: r.template,
    dominioPropio: r.dominio_propio,
    dominioActivo: r.dominio_activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// --- Obtener config white-label por tenant ---

export async function obtenerWhiteLabelCore(email: string, tenantId: string): Promise<WhiteLabelConfig | null> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    client_nombre: string;
    marca_nombre: string;
    logo_url: string;
    color_primario: string;
    color_secundario: string;
    color_fondo: string;
    color_texto: string;
    fuente: string;
    template: string;
    dominio_propio: string | null;
    dominio_activo: boolean;
    created_at: string;
    updated_at: string;
  }>`
    select wl.id, wl.tenant_id, t.name as tenant_nombre, c.name as client_nombre,
           wl.marca_nombre, wl.logo_url, wl.color_primario, wl.color_secundario,
           wl.color_fondo, wl.color_texto, wl.fuente, wl.template,
           wl.dominio_propio, wl.dominio_activo,
           wl.created_at::text as created_at, wl.updated_at::text as updated_at
    from torre.white_label_config wl
    join torre.saas_tenants t on t.id = wl.tenant_id
    join torre.saas_clients c on c.id = t.client_id
    where wl.tenant_id = ${tenantId}
  `;

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    clientNombre: r.client_nombre,
    marcaNombre: r.marca_nombre,
    logoUrl: r.logo_url,
    colorPrimario: r.color_primario,
    colorSecundario: r.color_secundario,
    colorFondo: r.color_fondo,
    colorTexto: r.color_texto,
    fuente: r.fuente,
    template: r.template,
    dominioPropio: r.dominio_propio,
    dominioActivo: r.dominio_activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Guardar (UPSERT) config white-label ---

export async function guardarWhiteLabelCore(email: string, tenantId: string, data: WhiteLabelInput): Promise<WhiteLabelConfig> {
  await exigirAccion(email, "comercial");
  const error = validarWhiteLabel(data);
  if (error) throw new Error(error);

  const sql = await getSql();

  // Verificar que el tenant existe
  const tenant = await sql<{ id: string }>`select id from torre.saas_tenants where id = ${tenantId}`;
  if (!tenant[0]) throw new Error("No existe ese tenant.");

  const id = newId("wl");
  const dominioPropio = data.dominioPropio?.trim() || null;
  const dominioActivo = data.dominioActivo ?? false;

  await sql`
    insert into torre.white_label_config
      (id, tenant_id, marca_nombre, logo_url, color_primario, color_secundario, color_fondo, color_texto, fuente, template, dominio_propio, dominio_activo)
    values
      (${id}, ${tenantId}, ${data.marcaNombre.trim()}, ${data.logoUrl.trim()}, ${data.colorPrimario}, ${data.colorSecundario}, ${data.colorFondo}, ${data.colorTexto}, ${data.fuente}, ${data.template}, ${dominioPropio}, ${dominioActivo})
    on conflict (tenant_id) do update set
      marca_nombre = excluded.marca_nombre,
      logo_url = excluded.logo_url,
      color_primario = excluded.color_primario,
      color_secundario = excluded.color_secundario,
      color_fondo = excluded.color_fondo,
      color_texto = excluded.color_texto,
      fuente = excluded.fuente,
      template = excluded.template,
      dominio_propio = excluded.dominio_propio,
      dominio_activo = excluded.dominio_activo,
      updated_at = now()
  `;

  await auditar(email, "guardar_white_label", "white_label_config", tenantId, { marcaNombre: data.marcaNombre.trim() });

  const config = await obtenerWhiteLabelCore(email, tenantId);
  if (!config) throw new Error("No se encontro la config guardada.");
  return config;
}

// --- Eliminar config white-label ---

export async function eliminarWhiteLabelCore(email: string, tenantId: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string }>`select id from torre.white_label_config where tenant_id = ${tenantId}`;
  if (!prev[0]) throw new Error("No existe configuracion white-label para ese tenant.");

  await sql`delete from torre.white_label_config where tenant_id = ${tenantId}`;
  await auditar(email, "eliminar_white_label", "white_label_config", tenantId, {});
}

// --- Preview (sin audit de permiso, solo lectura) ---

export async function previewWhiteLabelCore(email: string, tenantId: string): Promise<WhiteLabelConfig | null> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    client_nombre: string;
    marca_nombre: string;
    logo_url: string;
    color_primario: string;
    color_secundario: string;
    color_fondo: string;
    color_texto: string;
    fuente: string;
    template: string;
    dominio_propio: string | null;
    dominio_activo: boolean;
    created_at: string;
    updated_at: string;
  }>`
    select wl.id, wl.tenant_id, t.name as tenant_nombre, c.name as client_nombre,
           wl.marca_nombre, wl.logo_url, wl.color_primario, wl.color_secundario,
           wl.color_fondo, wl.color_texto, wl.fuente, wl.template,
           wl.dominio_propio, wl.dominio_activo,
           wl.created_at::text as created_at, wl.updated_at::text as updated_at
    from torre.white_label_config wl
    join torre.saas_tenants t on t.id = wl.tenant_id
    join torre.saas_clients c on c.id = t.client_id
    where wl.tenant_id = ${tenantId}
  `;

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    clientNombre: r.client_nombre,
    marcaNombre: r.marca_nombre,
    logoUrl: r.logo_url,
    colorPrimario: r.color_primario,
    colorSecundario: r.color_secundario,
    colorFondo: r.color_fondo,
    colorTexto: r.color_texto,
    fuente: r.fuente,
    template: r.template,
    dominioPropio: r.dominio_propio,
    dominioActivo: r.dominio_activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Server function wrappers ---

export const listarWhiteLabel = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarWhiteLabelCore(email);
  });

export const obtenerWhiteLabel = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return obtenerWhiteLabelCore(email, data);
  });

export const guardarWhiteLabel = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { tenantId: string } & WhiteLabelInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    const { tenantId, ...rest } = data;
    return guardarWhiteLabelCore(email, tenantId, rest);
  });

export const eliminarWhiteLabel = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return eliminarWhiteLabelCore(email, data);
  });

export const previewWhiteLabel = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return previewWhiteLabelCore(email, data);
  });
