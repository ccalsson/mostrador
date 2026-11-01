import type { Sql } from "../db.ts";
import { record } from "./alta-negocio.ts";

export async function tienePremium(sql: Sql, casaId: string) {
  const rows = await sql`select l.id from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id=l.subscription_id and s.status in ('active','past_due')
    join torre.saas_tenants t on t.id=s.tenant_id and t.status='active'
    join torre.saas_products p on p.id=l.product_id
    where t.operational_tenant_ref=${casaId} and l.status='active' and l.charge='recurring'
      and l.starts_on<=current_date and (l.ends_on is null or l.ends_on>=current_date)
      and s.start_date<=current_date and coalesce(p.config,'{}'::jsonb)->>'plan'='premium' limit 1`;
  return rows.length > 0;
}

export async function exigirAccesoPuesto(sql: Sql, casaId: string) {
  const rows = await sql<{
    status: string;
    client_status: string;
    managed: boolean;
    enabled: boolean;
    has_subscription: boolean;
    subscription_enabled: boolean;
  }>`
    select t.status,c.status as client_status,
      exists(select 1 from torre.saas_subscriptions s where s.tenant_id=t.id) as has_subscription,
      exists(select 1 from torre.saas_subscriptions s where s.tenant_id=t.id and s.status in ('active','past_due') and s.start_date<=current_date) as subscription_enabled,
      exists(select 1 from torre.saas_subscriptions s join torre.saas_subscription_lines l on l.subscription_id=s.id where s.tenant_id=t.id and l.notes like 'alta-plan:%') as managed,
      exists(select 1 from torre.saas_subscriptions s join torre.saas_subscription_lines l on l.subscription_id=s.id
        where s.tenant_id=t.id and s.status in ('active','past_due') and s.start_date<=current_date and l.status='active' and l.charge='recurring'
          and l.notes like 'alta-plan:%' and l.starts_on<=current_date and (l.ends_on is null or l.ends_on>=current_date)) as enabled
    from torre.saas_tenants t join torre.saas_clients c on c.id=t.client_id
    where t.operational_tenant_ref=${casaId}
  `;
  if (!rows.length) return;
  if (
    rows.some(
      (row) =>
        row.status !== "active" ||
        row.client_status !== "active" ||
        (row.has_subscription && !row.subscription_enabled) ||
        (row.managed && !row.enabled),
    )
  )
    throw new Error("El negocio o su suscripción no están habilitados. Contactá al administrador.");
}

export async function limitesPlan(sql: Sql, casaId: string) {
  const rows = await sql<{
    limits: unknown;
  }>`select p.limits from torre.saas_tenants t join torre.saas_plans p on p.id=t.plan_id where t.operational_tenant_ref=${casaId} and t.status='active' limit 1`;
  const raw = record(rows[0]?.limits);
  const limit = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
  return { users: limit(raw.users), branches: limit(raw.branches) };
}

export async function exigirCupoUsuario(sql: Sql, casaId: string, existingId?: string) {
  await sql`select id from tenants where id=${casaId} for update`;
  const limits = await limitesPlan(sql, casaId);
  if (limits.users == null) return;
  if (
    existingId &&
    (await sql`select id from staff where id=${existingId} and tenant_id=${casaId} and activo=true`)
      .length
  )
    return;
  const count = await sql<{
    n: number;
  }>`select count(*)::int as n from staff where tenant_id=${casaId} and activo=true`;
  if ((count[0]?.n ?? 0) >= limits.users)
    throw new Error(`El plan permite hasta ${limits.users} usuarios activos.`);
}
