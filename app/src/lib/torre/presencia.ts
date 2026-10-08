import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import {
  apareceEnMercado,
  permiteCuentaCorriente,
  resolverComision,
  tierContratado,
  type LineaMercado,
} from "@/lib/torre/condiciones";

function configText(value: unknown, key: string) {
  let record = value;
  if (typeof value === "string" && value.trim()) {
    try {
      record = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!record || typeof record !== "object") return null;
  const raw = (record as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : null;
}

export async function lineasPorPuesto() {
  const sql = await getSql();
  const rows = await sql<{
    ref: string;
    config: unknown;
    line_status: string;
    sub_status: string;
  }>`
    select t.operational_tenant_ref as ref, p.config, l.status as line_status, s.status as sub_status
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_tenants t on t.id = s.tenant_id
    join torre.saas_products p on p.id = l.product_id
    where t.operational_tenant_ref is not null and t.status = 'active'
  `;
  const mapa = new Map<string, LineaMercado[]>();
  for (const row of rows) {
    const lista = mapa.get(row.ref) ?? [];
    lista.push({
      family: configText(row.config, "family"),
      tier: configText(row.config, "tier"),
      lineStatus: row.line_status,
      subscriptionStatus: row.sub_status,
    });
    mapa.set(row.ref, lista);
  }
  return mapa;
}

export async function tierDePuesto(operationalTenantId: string) {
  const mapa = await lineasPorPuesto();
  return tierContratado(mapa.get(operationalTenantId) ?? []);
}

export async function comisionDePuesto(operationalTenantId: string) {
  const sql = await getSql();
  const override = await sql<{ percent: unknown }>`
    select a.percent
    from torre.saas_price_adjustments a
    join torre.saas_tenants t on t.id = a.tenant_id
    where t.operational_tenant_ref = ${operationalTenantId}
      and a.kind = 'commission_override'
      and a.status = 'active'
      and a.starts_on <= current_date
      and (a.ends_on is null or a.ends_on >= current_date)
    order by a.starts_on desc
    limit 1
  `;
  const policy = await sql<{ percent_min: unknown; percent_max: unknown }>`
    select percent_min, percent_max
    from torre.saas_commission_policies
    where status = 'active'
      and effective_from <= current_date
      and (effective_to is null or effective_to >= current_date)
    order by effective_from desc
    limit 1
  `;
  return resolverComision({
    overrideVigente: Boolean(override[0]),
    overridePercent: override[0] ? num(override[0].percent) : null,
    policyMin: policy[0] ? num(policy[0].percent_min) : null,
    policyMax: policy[0] ? num(policy[0].percent_max) : null,
  });
}

export async function avisosDe(operationalTenantId?: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    placement: string;
    status: string;
    starts_on: unknown;
    ends_on: unknown;
    content_ref: string;
    notes: string;
    currency: string;
    price: unknown;
    tenant_id: string;
    nombre: string;
  }>`
    select a.id, a.placement, a.status, a.starts_on, a.ends_on, a.content_ref, a.notes,
           a.currency, a.price, tn.id as tenant_id, tn.nombre
    from torre.saas_ads a
    join torre.saas_tenants t on t.id = a.tenant_id
    join tenants tn on tn.id = t.operational_tenant_ref
    where a.status in ('scheduled', 'active')
      and a.starts_on <= current_date
      and a.ends_on >= current_date
      and (${operationalTenantId ?? null}::text is null or tn.id = ${operationalTenantId ?? null})
  `;
  return rows.map((row) => ({
    id: row.id,
    placement: row.placement,
    status: row.status,
    startsOn: String(row.starts_on).slice(0, 10),
    endsOn: String(row.ends_on).slice(0, 10),
    contentRef: row.content_ref,
    notes: row.notes,
    currency: row.currency,
    price: num(row.price),
    tenantId: row.tenant_id,
    tenantNombre: row.nombre,
  }));
}

export async function packsDe(operationalTenantId: string) {
  const sql = await getSql();
  const rows = await sql<{ name: string; quantity: number; consumed: number; status: string }>`
    select p.name, k.quantity, k.consumed, k.status
    from torre.saas_message_packs k
    join torre.saas_tenants t on t.id = k.tenant_id
    join torre.saas_products p on p.id = k.product_id
    where t.operational_tenant_ref = ${operationalTenantId} and k.status = 'active'
  `;
  return rows.map((row) => ({
    product: row.name,
    quantity: row.quantity,
    consumed: row.consumed,
    remaining: row.quantity - row.consumed,
    status: row.status,
  }));
}

export async function condicionOperativa(operationalTenantId: string) {
  const tier = operationalTenantId ? await tierDePuesto(operationalTenantId) : null;
  const [comision, packs, avisos] = operationalTenantId
    ? await Promise.all([
        comisionDePuesto(operationalTenantId),
        packsDe(operationalTenantId),
        avisosDe(operationalTenantId),
      ])
    : [
        resolverComision({
          overrideVigente: false,
          overridePercent: null,
          policyMin: null,
          policyMax: null,
        }),
        [],
        [],
      ];
  return {
    tier,
    presencia: tier != null,
    cuentaCorriente: permiteCuentaCorriente(tier),
    comision,
    packs,
    avisos,
  };
}

export function publicadoEnMercado(config: unknown) {
  if (!config || typeof config !== "object") return false;
  const flag = (config as { mercadoAlToque?: unknown }).mercadoAlToque;
  return flag === true || flag === "true";
}

export async function puedeAparecer(operationalTenantId: string, config: unknown) {
  const tier = await tierDePuesto(operationalTenantId);
  return { tier, visible: apareceEnMercado(publicadoEnMercado(config), tier) };
}
