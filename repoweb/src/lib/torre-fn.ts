import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { auditar } from "@/lib/torre/audit";
import { transicionSuscripcion } from "@/lib/torre/comercial";
import { aplicarPagoALinea } from "@/lib/torre/reglas";
import { exigirAccion } from "@/lib/torre/roles";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";

const PLATFORMS = ["web", "android", "windows"] as const;
const DEPLOY_STATUS = ["pending", "deployed", "failed", "rolled_back"] as const;
const EXPENSE_CATS = ["hosting", "database", "domain", "ai", "tools", "api", "other"] as const;
const FREQS = ["once", "monthly", "yearly"] as const;
const PAY_KINDS = ["instalacion", "mensualidad", "addon", "sucursal", "mercado", "publicidad", "push", "otro"] as const;

function day(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  return text.slice(0, 10);
}

function cmpVer(a: string, b: string) {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function requireTorre(userId: string) {
  const sql = await getSql();
  const users = await sql<{ email: string }>`select email from "user" where id = ${userId} limit 1`;
  const email = (users[0]?.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Forbidden");
  const rows = await sql<{ email: string }>`
    select email from torre.saas_access where lower(email) = ${email} limit 1
  `;
  if (!rows[0]) throw new Error("Forbidden");
  return email;
}

export const torreGuard = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { requireUserId } = await import("@/lib/auth/verify.server");
    const { setResponseStatus } = await import("@tanstack/react-start/server");
    assertSameSiteRequest();
    let userId: string;
    try {
      userId = await requireUserId(context.bearerToken);
    } catch (err) {
      setResponseStatus(401);
      throw err;
    }
    try {
      await requireTorre(userId);
    } catch (err) {
      setResponseStatus(403);
      throw err;
    }
    return next({ context: { userId } });
  });

export const torreYo = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return { email };
  });

export const crearCuentaTorre = createServerFn({ method: "POST" })
  .handler(async () => {
    const { setResponseStatus } = await import("@tanstack/react-start/server");
    setResponseStatus(403);
    throw new Error("Forbidden");
  });

export const dashboardTorre = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const counts = await sql<{
      apps: number;
      clients: number;
      tenants: number;
      income: unknown;
      expenses: unknown;
    }>`
      select
        (select count(*)::int from torre.saas_apps where status = 'active') as apps,
        (select count(*)::int from torre.saas_clients where status = 'active') as clients,
        (select count(*)::int from torre.saas_tenants where status = 'active') as tenants,
        (
          select coalesce(sum(amount), 0) from torre.saas_payments
          where status = 'paid'
            and payment_date >= date_trunc('month', current_date)
            and payment_date < date_trunc('month', current_date) + interval '1 month'
        ) as income,
        (
          select coalesce(sum(amount), 0) from torre.saas_expenses
          where frequency = 'monthly'
             or (
               frequency <> 'monthly'
               and expense_date >= date_trunc('month', current_date)
               and expense_date < date_trunc('month', current_date) + interval '1 month'
             )
        ) as expenses
    `;
    const apps = await sql<{ id: string; name: string; status: string; current_version: string | null; tenants: number }>`
      select a.id, a.name, a.status, a.current_version, count(t.id)::int as tenants
      from torre.saas_apps a
      left join torre.saas_tenants t on t.app_id = a.id and t.status = 'active'
      group by a.id
      order by lower(a.name)
    `;
    const atrasados = await sql<{ tenant: string; app: string; installed: string | null; current: string | null }>`
      select t.name as tenant, a.name as app, t.installed_version as installed, a.current_version as current
      from torre.saas_tenants t
      join torre.saas_apps a on a.id = t.app_id
      where t.status = 'active'
    `;
    const vencidos = await sql<{ tenant: string; next: unknown }>`
      select t.name as tenant, s.next_payment_date as next
      from torre.saas_subscriptions s
      join torre.saas_tenants t on t.id = s.tenant_id
      where s.status = 'active' and s.next_payment_date is not null and s.next_payment_date < current_date
    `;
    const sinVersion = await sql<{ name: string }>`
      select a.name from torre.saas_apps a
      where a.status = 'active'
        and not exists (select 1 from torre.saas_versions v where v.app_id = a.id)
    `;
    const fallidos = await sql<{ app: string; tenant: string | null }>`
      select a.name as app, t.name as tenant
      from torre.saas_deployments d
      join torre.saas_apps a on a.id = d.app_id
      left join torre.saas_tenants t on t.id = d.tenant_id
      where d.status = 'failed'
    `;
    const incomeRows = await sql<{ currency: string; amount: unknown }>`
      select currency, coalesce(sum(amount), 0) as amount
      from torre.saas_payments
      where status = 'paid'
        and payment_date >= date_trunc('month', current_date)
        and payment_date < date_trunc('month', current_date) + interval '1 month'
      group by currency
      order by currency
    `;
    const income = num(counts[0]?.income);
    const expenses = num(counts[0]?.expenses);
    const alertas: { tipo: string; texto: string }[] = [];
    for (const row of atrasados) {
      if (!row.current) continue;
      if (!row.installed || cmpVer(row.installed, row.current) < 0) {
        alertas.push({
          tipo: "version",
          texto: `${row.tenant} (${row.app}) está en ${row.installed || "sin versión"} y la disponible es ${row.current}.`,
        });
      }
    }
    for (const row of vencidos) alertas.push({ tipo: "pago", texto: `Pago vencido: ${row.tenant} (${day(row.next)}).` });
    for (const row of sinVersion) alertas.push({ tipo: "app", texto: `${row.name} no tiene versiones cargadas.` });
    for (const row of fallidos) {
      alertas.push({ tipo: "deploy", texto: `Deployment fallido: ${row.app}${row.tenant ? ` · ${row.tenant}` : ""}.` });
    }
    return {
      apps: counts[0]?.apps ?? 0,
      clients: counts[0]?.clients ?? 0,
      tenants: counts[0]?.tenants ?? 0,
      income,
      incomeByCurrency: incomeRows.map((row) => ({ currency: row.currency, amount: num(row.amount) })),
      expenses,
      margin: income - expenses,
      aplicaciones: apps,
      alertas,
    };
  });

export const listApps = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      slug: string;
      description: string;
      status: string;
      repository_url: string | null;
      production_url: string | null;
      current_version: string | null;
    }>`select id, name, slug, description, status, repository_url, production_url, current_version from torre.saas_apps order by lower(name)`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      status: r.status,
      repositoryUrl: r.repository_url ?? "",
      productionUrl: r.production_url ?? "",
      currentVersion: r.current_version ?? "",
    }));
  });

export const saveApp = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    name: string;
    slug: string;
    description: string;
    status: string;
    repositoryUrl: string;
    productionUrl: string;
    currentVersion: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.name.trim() || !data.slug.trim()) throw new Error("Nombre y slug son obligatorios.");
    const sql = await getSql();
    const id = data.id || newId("app");
    if (data.id) {
      await sql`
        update torre.saas_apps set
          name = ${data.name.trim()}, slug = ${data.slug.trim()}, description = ${data.description.trim()},
          status = ${data.status}, repository_url = ${data.repositoryUrl.trim() || null},
          production_url = ${data.productionUrl.trim() || null}, current_version = ${data.currentVersion.trim() || null},
          updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_apps (
          id, name, slug, description, status, repository_url, production_url, current_version
        ) values (
          ${id}, ${data.name.trim()}, ${data.slug.trim()}, ${data.description.trim()}, ${data.status},
          ${data.repositoryUrl.trim() || null}, ${data.productionUrl.trim() || null}, ${data.currentVersion.trim() || null}
        )
      `;
    }
    return { id };
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      business_name: string;
      contact_name: string;
      phone: string | null;
      email: string | null;
      notes: string;
      status: string;
    }>`select id, name, business_name, contact_name, phone, email, notes, status from torre.saas_clients order by lower(name)`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      businessName: r.business_name,
      contactName: r.contact_name,
      phone: r.phone ?? "",
      email: r.email ?? "",
      notes: r.notes,
      status: r.status,
    }));
  });

export const saveClient = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    name: string;
    businessName: string;
    contactName: string;
    phone: string;
    email: string;
    notes: string;
    status: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.name.trim()) throw new Error("El nombre es obligatorio.");
    const sql = await getSql();
    const id = data.id || newId("cli");
    if (data.id) {
      await sql`
        update torre.saas_clients set
          name = ${data.name.trim()}, business_name = ${data.businessName.trim()},
          contact_name = ${data.contactName.trim()}, phone = ${data.phone.trim() || null},
          email = ${data.email.trim() || null}, notes = ${data.notes.trim()}, status = ${data.status},
          updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_clients (
          id, name, business_name, contact_name, phone, email, notes, status
        ) values (
          ${id}, ${data.name.trim()}, ${data.businessName.trim()}, ${data.contactName.trim()},
          ${data.phone.trim() || null}, ${data.email.trim() || null}, ${data.notes.trim()}, ${data.status}
        )
      `;
    }
    return { id };
  });

export const listPlans = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      description: string;
      monthly_price: unknown;
      setup_price: unknown;
      status: string;
      code: string | null;
      currency: string;
      periodicity: string;
      features: unknown;
      limits: unknown;
      metadata: unknown;
      valid_from: unknown;
      valid_to: unknown;
    }>`
      select id, name, description, monthly_price, setup_price, status, code, currency, periodicity,
             features, limits, metadata, valid_from, valid_to
      from torre.saas_plans order by lower(name)
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      monthlyPrice: num(r.monthly_price),
      setupPrice: num(r.setup_price),
      status: r.status,
      code: r.code ?? "",
      currency: r.currency,
      periodicity: r.periodicity,
      features: typeof r.features === "string" ? r.features : JSON.stringify(r.features ?? []),
      limits: typeof r.limits === "string" ? r.limits : JSON.stringify(r.limits ?? {}),
      metadata: typeof r.metadata === "string" ? r.metadata : JSON.stringify(r.metadata ?? {}),
      validFrom: r.valid_from ? day(r.valid_from) : "",
      validTo: r.valid_to ? day(r.valid_to) : "",
    }));
  });

export const savePlan = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    name: string;
    description: string;
    monthlyPrice: number;
    setupPrice: number;
    status: string;
    code?: string;
    currency?: string;
    periodicity?: string;
    features?: string;
    limits?: string;
    metadata?: string;
    validFrom?: string;
    validTo?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.name.trim()) throw new Error("El nombre es obligatorio.");
    const parseJson = (value: string | undefined, fallback: string) => {
      const raw = (value ?? "").trim() || fallback;
      try {
        return JSON.stringify(JSON.parse(raw));
      } catch {
        throw new Error("Funcionalidades, límites y metadata tienen que ser JSON.");
      }
    };
    const sql = await getSql();
    const id = data.id || newId("plan");
    const code = data.code?.trim() || null;
    const currency = data.currency || "ARS";
    const periodicity = data.periodicity || "monthly";
    const features = parseJson(data.features, "[]");
    const limits = parseJson(data.limits, "{}");
    const metadata = parseJson(data.metadata, "{}");
    const validFrom = data.validFrom?.trim() || null;
    const validTo = data.validTo?.trim() || null;
    const prev = data.id
      ? await sql<{ monthly_price: unknown; setup_price: unknown; status: string; code: string | null }>`
          select monthly_price, setup_price, status, code from torre.saas_plans where id = ${data.id} limit 1
        `
      : [];
    if (data.id && !prev[0]) throw new Error("No está ese plan.");
    if (data.id) {
      await sql`
        update torre.saas_plans set
          name = ${data.name.trim()}, description = ${data.description.trim()},
          monthly_price = ${data.monthlyPrice}, setup_price = ${data.setupPrice}, status = ${data.status},
          code = ${code}, currency = ${currency}, periodicity = ${periodicity},
          features = ${features}::jsonb, limits = ${limits}::jsonb, metadata = ${metadata}::jsonb,
          valid_from = ${validFrom}::date, valid_to = ${validTo}::date, updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_plans (
          id, name, description, monthly_price, setup_price, status, code, currency, periodicity,
          features, limits, metadata, valid_from, valid_to
        ) values (
          ${id}, ${data.name.trim()}, ${data.description.trim()}, ${data.monthlyPrice}, ${data.setupPrice}, ${data.status},
          ${code}, ${currency}, ${periodicity}, ${features}::jsonb, ${limits}::jsonb, ${metadata}::jsonb,
          ${validFrom}::date, ${validTo}::date
        )
      `;
    }
    await auditar(email, data.id ? "modificar_precio_plan" : "crear_plan", "plan", id, {
      before: prev[0] ? { monthlyPrice: num(prev[0].monthly_price), setupPrice: num(prev[0].setup_price), status: prev[0].status, code: prev[0].code } : null,
      after: { name: data.name.trim(), monthlyPrice: data.monthlyPrice, setupPrice: data.setupPrice, status: data.status, code, currency, periodicity },
      note: "Cambiar el plan no reescribe líneas ya contratadas.",
    });
    return { id };
  });

export const listTenants = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      slug: string;
      status: string;
      installed_version: string | null;
      operational_tenant_ref: string | null;
      last_activity_at: string | null;
      app_id: string;
      app_name: string;
      current_version: string | null;
      client_id: string;
      client_name: string;
      plan_id: string | null;
      plan_name: string | null;
    }>`
      select t.id, t.name, t.slug, t.status, t.installed_version, t.operational_tenant_ref,
             t.last_activity_at::text as last_activity_at, t.app_id, a.name as app_name, a.current_version,
             t.client_id, c.name as client_name, t.plan_id, p.name as plan_name
      from torre.saas_tenants t
      join torre.saas_apps a on a.id = t.app_id
      join torre.saas_clients c on c.id = t.client_id
      left join torre.saas_plans p on p.id = t.plan_id
      order by lower(a.name), lower(t.name)
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      installedVersion: r.installed_version ?? "",
      operationalTenantRef: r.operational_tenant_ref ?? "",
      lastActivityAt: r.last_activity_at,
      appId: r.app_id,
      appName: r.app_name,
      currentVersion: r.current_version ?? "",
      clientId: r.client_id,
      clientName: r.client_name,
      planId: r.plan_id ?? "",
      planName: r.plan_name ?? "",
      atrasado: Boolean(r.current_version) && cmpVer(r.installed_version ?? "0", r.current_version ?? "0") < 0,
    }));
  });

export const saveTenant = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    appId: string;
    clientId: string;
    name: string;
    slug: string;
    status: string;
    planId: string;
    installedVersion: string;
    operationalTenantRef: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.name.trim() || !data.slug.trim() || !data.appId || !data.clientId) {
      throw new Error("Completá aplicación, cliente, nombre y slug.");
    }
    const sql = await getSql();
    const id = data.id || newId("ten");
    const plan = data.planId || null;
    if (data.id) {
      await sql`
        update torre.saas_tenants set
          app_id = ${data.appId}, client_id = ${data.clientId}, name = ${data.name.trim()},
          slug = ${data.slug.trim()}, status = ${data.status}, plan_id = ${plan},
          installed_version = ${data.installedVersion.trim() || null},
          operational_tenant_ref = ${data.operationalTenantRef.trim() || null},
          updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_tenants (
          id, app_id, client_id, name, slug, status, plan_id, installed_version, operational_tenant_ref
        ) values (
          ${id}, ${data.appId}, ${data.clientId}, ${data.name.trim()}, ${data.slug.trim()}, ${data.status},
          ${plan}, ${data.installedVersion.trim() || null}, ${data.operationalTenantRef.trim() || null}
        )
      `;
    }
    await auditar(email, data.id ? "editar_tenant" : "crear_tenant", "tenant", id, { name: data.name, status: data.status });
    return { id };
  });

export const desactivarTenant = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    const sql = await getSql();
    await sql`update torre.saas_tenants set status = 'inactive', updated_at = now() where id = ${id}`;
    await auditar(email, "desactivar_tenant", "tenant", id, {});
    return { ok: true };
  });

export const listSubscriptions = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      client_id: string;
      client_name: string;
      tenant_id: string;
      tenant_name: string;
      plan_id: string;
      plan_name: string;
      plan_currency: string;
      monthly_price: unknown;
      status: string;
      start_date: unknown;
      next_payment_date: unknown;
    }>`
      select s.id, s.client_id, c.name as client_name, s.tenant_id, t.name as tenant_name,
             s.plan_id, p.name as plan_name, p.currency as plan_currency, s.monthly_price, s.status, s.start_date, s.next_payment_date
      from torre.saas_subscriptions s
      join torre.saas_clients c on c.id = s.client_id
      join torre.saas_tenants t on t.id = s.tenant_id
      join torre.saas_plans p on p.id = s.plan_id
      order by s.next_payment_date nulls last
    `;
    return rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      planId: r.plan_id,
      planName: r.plan_name,
      planCurrency: r.plan_currency,
      monthlyPrice: num(r.monthly_price),
      status: r.status,
      startDate: day(r.start_date),
      nextPaymentDate: r.next_payment_date ? day(r.next_payment_date) : "",
    }));
  });

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    clientId: string;
    tenantId: string;
    planId: string;
    monthlyPrice: number;
    status: string;
    startDate: string;
    nextPaymentDate: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.clientId || !data.tenantId || !data.planId || !data.startDate) {
      throw new Error("Completá cliente, tenant, plan y fecha de inicio.");
    }
    const sql = await getSql();
    const id = data.id || newId("sub");
    const next = data.nextPaymentDate || null;
    const tenant = await sql<{ client_id: string }>`select client_id from torre.saas_tenants where id = ${data.tenantId} limit 1`;
    if (!tenant[0] || tenant[0].client_id !== data.clientId) throw new Error("Ese tenant no pertenece a ese cliente.");
    const prev = data.id
      ? await sql<{ status: string; monthly_price: unknown; plan_id: string; tenant_id: string }>`
          select status, monthly_price, plan_id, tenant_id from torre.saas_subscriptions where id = ${data.id} limit 1
        `
      : [];
    if (data.id && !prev[0]) throw new Error("No está esa suscripción.");
    if (!transicionSuscripcion(prev[0]?.status ?? null, data.status)) {
      throw new Error("Esa transición de estado no está permitida.");
    }
    if (data.id) {
      await sql`
        update torre.saas_subscriptions set
          client_id = ${data.clientId}, tenant_id = ${data.tenantId}, plan_id = ${data.planId},
          monthly_price = ${data.monthlyPrice}, status = ${data.status},
          start_date = ${data.startDate}::date, next_payment_date = ${next}::date, updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_subscriptions (
          id, client_id, tenant_id, plan_id, monthly_price, status, start_date, next_payment_date
        ) values (
          ${id}, ${data.clientId}, ${data.tenantId}, ${data.planId}, ${data.monthlyPrice}, ${data.status},
          ${data.startDate}::date, ${next}::date
        )
      `;
    }
    await auditar(email, data.id ? "modificar_suscripcion" : "crear_suscripcion", "subscription", id, {
      before: prev[0] ? { status: prev[0].status, monthlyPrice: num(prev[0].monthly_price), planId: prev[0].plan_id, tenantId: prev[0].tenant_id } : null,
      after: { status: data.status, monthlyPrice: data.monthlyPrice, planId: data.planId, tenantId: data.tenantId },
      note: "monthly_price es encabezado legado. El precio aplicable está en las líneas y en los ajustes.",
    });
    return { id };
  });

export const listPayments = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      client_id: string;
      client_name: string;
      subscription_id: string | null;
      amount: unknown;
      payment_date: unknown;
      concept: string;
      status: string;
      notes: string;
      kind: string;
      currency: string;
    }>`
      select p.id, p.client_id, c.name as client_name, p.subscription_id, p.amount,
             p.payment_date, p.concept, p.status, p.notes, p.kind, p.currency
      from torre.saas_payments p
      join torre.saas_clients c on c.id = p.client_id
      order by p.payment_date desc
    `;
    return rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      subscriptionId: r.subscription_id ?? "",
      amount: num(r.amount),
      paymentDate: day(r.payment_date),
      concept: r.concept,
      status: r.status,
      notes: r.notes,
      kind: r.kind,
      currency: r.currency,
    }));
  });

export const savePayment = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    clientId: string;
    subscriptionId: string;
    amount: number;
    paymentDate: string;
    concept: string;
    status: string;
    notes: string;
    tenantId?: string;
    productId?: string;
    lineId?: string;
    kind?: string;
    currency?: string;
    applyPeriod?: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.clientId || !data.concept.trim() || !data.paymentDate) throw new Error("Completá cliente, concepto y fecha.");
    const kind = data.kind || "otro";
    const currency = data.currency || "ARS";
    if (!PAY_KINDS.includes(kind as (typeof PAY_KINDS)[number])) throw new Error("Tipo de ingreso inválido.");
    if (currency !== "USD" && currency !== "ARS") throw new Error("Moneda inválida.");
    const sql = await getSql();
    const id = data.id || newId("pay");
    const sub = data.subscriptionId || null;
    const tenantId = data.tenantId || null;
    const productId = data.productId || null;
    const lineId = data.lineId || null;
    let fxRate: number | null = null;
    let fxId: string | null = null;
    if (currency === "ARS") {
      const fx = await sql<{ id: string; usd_ars: unknown }>`
        select id, usd_ars from torre.saas_fx_rates order by as_of desc, created_at desc limit 1
      `;
      if (fx[0]) {
        fxId = fx[0].id;
        fxRate = num(fx[0].usd_ars);
      }
    }
    if (data.id) {
      await sql`
        update torre.saas_payments set
          client_id = ${data.clientId}, subscription_id = ${sub}, amount = ${data.amount},
          payment_date = ${data.paymentDate}::date, concept = ${data.concept.trim()},
          status = ${data.status}, notes = ${data.notes.trim()},
          tenant_id = ${tenantId}, product_id = ${productId}, line_id = ${lineId},
          kind = ${kind}, currency = ${currency}, fx_rate = ${fxRate}, fx_rate_id = ${fxId}
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_payments (
          id, client_id, subscription_id, amount, payment_date, concept, status, notes,
          tenant_id, product_id, line_id, kind, currency, fx_rate, fx_rate_id
        ) values (
          ${id}, ${data.clientId}, ${sub}, ${data.amount}, ${data.paymentDate}::date,
          ${data.concept.trim()}, ${data.status}, ${data.notes.trim()},
          ${tenantId}, ${productId}, ${lineId}, ${kind}, ${currency}, ${fxRate}, ${fxId}
        )
      `;
    }
    if (data.applyPeriod && lineId) {
      const lines = await sql<{ frequency: string; next_due: unknown; subscription_id: string }>`
        select frequency, next_due, subscription_id from torre.saas_subscription_lines where id = ${lineId} limit 1
      `;
      const line = lines[0];
      if (!line) throw new Error("No está esa línea de suscripción.");
      const efecto = aplicarPagoALinea({
        status: data.status,
        frequency: line.frequency,
        paymentDate: data.paymentDate,
        nextDue: line.next_due ? day(line.next_due) : null,
      });
      if (efecto) {
        await sql`
          update torre.saas_subscription_lines
          set next_due = ${efecto.nextDue}::date, paid_through = ${efecto.paidThrough}::date, updated_at = now()
          where id = ${lineId}
        `;
        await sql`
          update torre.saas_subscriptions
          set last_paid_on = ${data.paymentDate}::date,
              next_payment_date = (
                select min(next_due) from torre.saas_subscription_lines
                where subscription_id = ${line.subscription_id} and status = 'active' and frequency = 'monthly'
              ),
              updated_at = now()
          where id = ${line.subscription_id}
        `;
      }
    }
    await auditar(email, "registrar_pago", "payment", id, { kind, currency, amount: data.amount, applyPeriod: Boolean(data.applyPeriod) });
    return { id };
  });

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      app_id: string | null;
      app_name: string | null;
      concept: string;
      provider: string;
      amount: unknown;
      frequency: string;
      category: string;
      expense_date: unknown;
      notes: string;
    }>`
      select e.id, e.app_id, a.name as app_name, e.concept, e.provider, e.amount,
             e.frequency, e.category, e.expense_date, e.notes
      from torre.saas_expenses e
      left join torre.saas_apps a on a.id = e.app_id
      order by e.expense_date desc
    `;
    return rows.map((r) => ({
      id: r.id,
      appId: r.app_id ?? "",
      appName: r.app_name ?? "",
      concept: r.concept,
      provider: r.provider,
      amount: num(r.amount),
      frequency: r.frequency,
      category: r.category,
      expenseDate: day(r.expense_date),
      notes: r.notes,
    }));
  });

export const saveExpense = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    appId: string;
    concept: string;
    provider: string;
    amount: number;
    frequency: string;
    category: string;
    expenseDate: string;
    notes: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.concept.trim() || !data.expenseDate) throw new Error("Completá concepto y fecha.");
    if (!FREQS.includes(data.frequency as (typeof FREQS)[number])) throw new Error("Frecuencia inválida.");
    if (!EXPENSE_CATS.includes(data.category as (typeof EXPENSE_CATS)[number])) throw new Error("Rubro inválido.");
    const sql = await getSql();
    const id = data.id || newId("exp");
    const app = data.appId || null;
    if (data.id) {
      await sql`
        update torre.saas_expenses set
          app_id = ${app}, concept = ${data.concept.trim()}, provider = ${data.provider.trim()},
          amount = ${data.amount}, frequency = ${data.frequency}, category = ${data.category},
          expense_date = ${data.expenseDate}::date, notes = ${data.notes.trim()}
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_expenses (
          id, app_id, concept, provider, amount, frequency, category, expense_date, notes
        ) values (
          ${id}, ${app}, ${data.concept.trim()}, ${data.provider.trim()}, ${data.amount},
          ${data.frequency}, ${data.category}, ${data.expenseDate}::date, ${data.notes.trim()}
        )
      `;
    }
    return { id };
  });

export const listVersions = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      app_id: string;
      app_name: string;
      version: string;
      platform: string;
      release_date: unknown;
      changelog: string;
      download_url: string | null;
      status: string;
      checksum: string | null;
      minimum_supported_version: string | null;
      mandatory: boolean;
    }>`
      select v.id, v.app_id, a.name as app_name, v.version, v.platform, v.release_date,
             v.changelog, v.download_url, v.status, v.checksum, v.minimum_supported_version, v.mandatory
      from torre.saas_versions v
      join torre.saas_apps a on a.id = v.app_id
      order by v.release_date desc, v.version desc
    `;
    return rows.map((r) => ({
      id: r.id,
      appId: r.app_id,
      appName: r.app_name,
      version: r.version,
      platform: r.platform,
      releaseDate: day(r.release_date),
      changelog: r.changelog,
      downloadUrl: r.download_url ?? "",
      status: r.status,
      checksum: r.checksum ?? "",
      minimumSupportedVersion: r.minimum_supported_version ?? "",
      mandatory: Boolean(r.mandatory),
    }));
  });

export const saveVersion = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    appId: string;
    version: string;
    platform: string;
    releaseDate: string;
    changelog: string;
    downloadUrl: string;
    status: string;
    checksum?: string;
    minimumSupportedVersion?: string;
    mandatory?: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.appId || !data.version.trim() || !data.releaseDate) throw new Error("Completá app, versión y fecha.");
    if (!PLATFORMS.includes(data.platform as (typeof PLATFORMS)[number])) throw new Error("Plataforma inválida.");
    const sql = await getSql();
    const id = data.id || newId("ver");
    const checksum = data.checksum?.trim() || null;
    const minimum = data.minimumSupportedVersion?.trim() || null;
    const mandatory = Boolean(data.mandatory);
    if (data.id) {
      await sql`
        update torre.saas_versions set
          app_id = ${data.appId}, version = ${data.version.trim()}, platform = ${data.platform},
          release_date = ${data.releaseDate}::date, changelog = ${data.changelog.trim()},
          download_url = ${data.downloadUrl.trim() || null}, status = ${data.status},
          checksum = ${checksum}, minimum_supported_version = ${minimum}, mandatory = ${mandatory}
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_versions (
          id, app_id, version, platform, release_date, changelog, download_url, status,
          checksum, minimum_supported_version, mandatory
        ) values (
          ${id}, ${data.appId}, ${data.version.trim()}, ${data.platform}, ${data.releaseDate}::date,
          ${data.changelog.trim()}, ${data.downloadUrl.trim() || null}, ${data.status},
          ${checksum}, ${minimum}, ${mandatory}
        )
      `;
    }
    await auditar(email, "guardar_version", "version", id, { version: data.version, platform: data.platform, status: data.status });
    return { id };
  });

export const listDeployments = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      app_id: string;
      app_name: string;
      tenant_id: string | null;
      tenant_name: string | null;
      version_id: string;
      version: string;
      platform: string;
      status: string;
      deployed_at: string | null;
      notes: string;
      infra_confirmed: boolean;
      origin: string;
      log_excerpt: string;
    }>`
      select d.id, d.app_id, a.name as app_name, d.tenant_id, t.name as tenant_name,
             d.version_id, v.version, d.platform, d.status, d.deployed_at::text as deployed_at, d.notes,
             d.infra_confirmed, d.origin, d.log_excerpt
      from torre.saas_deployments d
      join torre.saas_apps a on a.id = d.app_id
      join torre.saas_versions v on v.id = d.version_id
      left join torre.saas_tenants t on t.id = d.tenant_id
      order by d.deployed_at desc nulls last
    `;
    return rows.map((r) => ({
      id: r.id,
      appId: r.app_id,
      appName: r.app_name,
      tenantId: r.tenant_id ?? "",
      tenantName: r.tenant_name ?? "",
      versionId: r.version_id,
      version: r.version,
      platform: r.platform,
      status: r.status,
      deployedAt: r.deployed_at ? r.deployed_at.slice(0, 16).replace("T", " ") : "",
      notes: r.notes,
      infraConfirmed: Boolean(r.infra_confirmed),
      origin: r.origin ?? "manual",
      logExcerpt: r.log_excerpt ?? "",
    }));
  });

export const saveDeployment = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    appId: string;
    tenantId: string;
    versionId: string;
    platform: string;
    status: string;
    notes: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.appId || !data.versionId) throw new Error("Elegí aplicación y versión.");
    if (!PLATFORMS.includes(data.platform as (typeof PLATFORMS)[number])) throw new Error("Plataforma inválida.");
    if (!DEPLOY_STATUS.includes(data.status as (typeof DEPLOY_STATUS)[number])) throw new Error("Estado inválido.");
    if (data.status === "deployed" || data.status === "rolled_back") {
      throw new Error("Ese estado no se carga a mano. Publicá la release desde Versiones. Sin infraestructura queda publicado en Torre y sin confirmación.");
    }
    const sql = await getSql();
    const id = data.id || newId("dep");
    const tenant = data.tenantId || null;
    if (data.id) {
      await sql`
        update torre.saas_deployments set
          app_id = ${data.appId}, tenant_id = ${tenant}, version_id = ${data.versionId},
          platform = ${data.platform}, status = ${data.status}, notes = ${data.notes.trim()}
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_deployments (
          id, app_id, tenant_id, version_id, platform, status, deployed_at, notes, infra_confirmed, origin
        ) values (
          ${id}, ${data.appId}, ${tenant}, ${data.versionId}, ${data.platform}, ${data.status},
          null, ${data.notes.trim()}, false, 'manual'
        )
      `;
    }
    await auditar(email, "registrar_deployment", "deployment", id, { status: data.status, origin: "manual" });
    return { id };
  });

export const listAccess = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{ email: string; role: string }>`
      select email, role from torre.saas_access order by email
    `;
    const me = rows.find((row) => row.email === email);
    return { me: email, role: me?.role ?? "administracion", accounts: rows.map((row) => ({ email: row.email, role: row.role })) };
  });

export const addAccess = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { email: string; role: string }) => input)
  .handler(async ({ context, data }) => {
    const me = await requireTorre(context.userId);
    await exigirAccion(me, "acceso");
    const email = data.email.trim().toLowerCase();
    const role = data.role || "soporte";
    if (!email.includes("@")) throw new Error("Correo inválido.");
    if (!["administracion", "comercial", "legal", "soporte", "auditoria"].includes(role)) throw new Error("Rol inválido.");
    const sql = await getSql();
    await sql`
      insert into torre.saas_access (email, role) values (${email}, ${role})
      on conflict (email) do update set role = excluded.role
    `;
    await auditar(me, "agregar_acceso", "access", email, { role });
    return { ok: true };
  });

export const removeAccess = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((email: string) => email)
  .handler(async ({ context, data }) => {
    const me = await requireTorre(context.userId);
    await exigirAccion(me, "acceso");
    const email = data.trim().toLowerCase();
    if (email === me) throw new Error("No podés quitarte a vos mismo.");
    const sql = await getSql();
    await sql`delete from torre.saas_access where lower(email) = ${email}`;
    await auditar(me, "quitar_acceso", "access", email, {});
    return { ok: true };
  });
