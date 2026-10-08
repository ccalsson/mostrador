import { getSql } from "@/lib/db";
import type { Staff } from "@/lib/types";

const SUSCRIPCION_VIGENTE = new Set(["active", "past_due"]);
const CACHE_TTL_MS = 60_000;

const g = globalThis as typeof globalThis & {
  __capCcCache?: Map<string, { at: number; ok: boolean }>;
};

function configDe(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

async function tierDePuesto(operationalTenantId: string): Promise<"presencia" | "pro" | null> {
  const sql = await getSql();
  const rows = await sql<{ line_status: string; sub_status: string; config: unknown }>`
    select l.status as line_status, s.status as sub_status, p.config
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_tenants t on t.id = s.tenant_id
    join torre.saas_products p on p.id = l.product_id
    where t.operational_tenant_ref = ${operationalTenantId} and t.status = 'active'
  `;
  let tier: "presencia" | "pro" | null = null;
  for (const row of rows) {
    if (row.line_status !== "active" || !SUSCRIPCION_VIGENTE.has(row.sub_status)) continue;
    const config = configDe(row.config);
    if (config?.family !== "mercado") continue;
    if (config.tier === "pro") return "pro";
    if (config.tier === "presencia") tier = "presencia";
  }
  return tier;
}

// Fail-closed: si Torre no responde o el puesto no está vinculado, se deniega.
export async function exigirCuentaCorriente(staff: Staff) {
  g.__capCcCache ??= new Map();
  const hit = g.__capCcCache.get(staff.tenantId);
  let ok = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.ok : null;
  if (ok == null) {
    try {
      ok = (await tierDePuesto(staff.tenantId)) === "pro";
    } catch {
      ok = false;
    }
    g.__capCcCache.set(staff.tenantId, { at: Date.now(), ok });
  }
  if (!ok) throw new Error("La cuenta corriente corresponde al plan Pro y no está activa.");
}
