import { TENANT_BAJADA, TENANT_NOMBRE, TENANT_PIE } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { assertRole, audit } from "@/lib/server/context";
import { condicionOperativa, puedeAparecer } from "@/lib/torre/presencia";
import type { Marca, Staff } from "@/lib/types";

type MarcaConfig = {
  pieTicket?: string;
  bajada?: string;
  membrete?: string;
  fondo?: string | null;
};

function leerConfig(raw: unknown): MarcaConfig {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as MarcaConfig;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as MarcaConfig;
  return {};
}

export async function getMarcaCompleta(tenantId: string): Promise<Marca> {
  const sql = await getSql();
  const rows = await sql<{ id: string; nombre: string; config: unknown }>`
    select id, nombre, config from tenants where id = ${tenantId}
  `;
  const row = rows[0];
  const config = leerConfig(row?.config);
  const fondo = typeof config.fondo === "string" && config.fondo.startsWith("data:image/") ? config.fondo : null;
  return {
    id: row?.id ?? tenantId,
    nombre: row?.nombre ?? TENANT_NOMBRE,
    bajada: config.bajada?.trim() || TENANT_BAJADA,
    membrete: config.membrete?.trim() || "",
    pieTicket: config.pieTicket?.trim() || TENANT_PIE,
    fondo,
  };
}

export async function getMarcaForStaff(staff: Staff): Promise<Marca> {
  return getMarcaCompleta(staff.tenantId);
}

export async function guardarMarcaForStaff(
  staff: Staff,
  input: { nombre: string; bajada: string; membrete: string; pieTicket: string; fondo: string | null },
): Promise<Marca> {
  assertRole(staff, ["admin"]);
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Falta el nombre del puesto.");
  if (nombre.length > 80) throw new Error("El nombre es demasiado largo.");
  if (input.bajada.trim().length > 80) throw new Error("La bajada es demasiado larga.");
  if (input.membrete.trim().length > 240) throw new Error("El membrete es demasiado largo.");
  if (input.pieTicket.trim().length > 240) throw new Error("El pie del ticket es demasiado largo.");
  if (input.fondo && (!input.fondo.startsWith("data:image/") || input.fondo.length > 450_000)) {
    throw new Error("El fondo tiene que ser una imagen chica.");
  }
  const actual = await getMarcaCompleta(staff.tenantId);
  const sql = await getSql();
  const rows = await sql<{ config: unknown }>`select config from tenants where id = ${staff.tenantId} limit 1`;
  const previo =
    typeof rows[0]?.config === "string"
      ? (JSON.parse(rows[0].config) as Record<string, unknown>)
      : ((rows[0]?.config as Record<string, unknown> | null) ?? {});
  const config = {
    ...previo,
    bajada: input.bajada.trim() || TENANT_BAJADA,
    membrete: input.membrete.trim(),
    pieTicket: input.pieTicket.trim() || actual.pieTicket,
    fondo: input.fondo,
  };
  await sql`
    update tenants set nombre = ${nombre}, config = ${JSON.stringify(config)}::jsonb
    where id = ${staff.tenantId}
  `;
  await audit(staff.tenantId, staff, "marca", "tenant", { nombre });
  return getMarcaCompleta(staff.tenantId);
}

export async function canalMercadoForStaff(staff: Staff) {
  const sql = await getSql();
  const rows = await sql<{ config: unknown }>`select config from tenants where id = ${staff.tenantId} limit 1`;
  const raw = rows[0]?.config;
  const config =
    typeof raw === "string"
      ? (JSON.parse(raw) as { mercadoAlToque?: boolean })
      : ((raw ?? {}) as { mercadoAlToque?: boolean });
  const condicion = await condicionOperativa(staff.tenantId);
  return {
    activo: config.mercadoAlToque === true,
    presencia: condicion.presencia,
    tier: condicion.tier,
    cuentaCorriente: condicion.cuentaCorriente,
    packs: condicion.packs,
    avisos: condicion.avisos,
    comision: condicion.comision,
  };
}

export async function guardarCanalMercadoForStaff(staff: Staff, activo: boolean) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  if (activo) {
    const presencia = await puedeAparecer(staff.tenantId, { mercadoAlToque: true });
    if (!presencia.tier) throw new Error("Este puesto no tiene Presencia o Pro activo.");
  }
  await sql`
    update tenants
    set config = coalesce(config, '{}'::jsonb) || ${JSON.stringify({ mercadoAlToque: activo })}::jsonb
    where id = ${staff.tenantId}
  `;
  await audit(staff.tenantId, staff, "canal_mercado", "tenant", { activo });
  return { activo };
}
