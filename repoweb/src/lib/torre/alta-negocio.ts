import type { Sql } from "../db.ts";
import { newId } from "../ids.ts";
import { precioSnapshot } from "./reglas.ts";

export type AltaNegocio = {
  id?: string;
  appId: string;
  clientId: string;
  clientName?: string;
  name: string;
  slug: string;
  status: string;
  planId: string;
  installedVersion: string;
  operationalTenantRef: string;
  ownerEmail?: string;
  ownerPassword?: string;
  direccion?: string;
};
type Plan = {
  id: string;
  status: string;
  code: string | null;
  currency: string;
  metadata: unknown;
  limits: unknown;
  valid_from: unknown;
  valid_to: unknown;
};
type Producto = {
  id: string;
  slug: string;
  kind: string;
  app_id: string;
  config: unknown;
  status: string;
  billing: string;
  frequency: string;
  setup_usd: unknown;
  setup_ars: unknown;
  recurring_usd: unknown;
  recurring_ars: unknown;
  once_usd: unknown;
  once_ars: unknown;
};
const PREFIX = "alta-plan:";
const amount = (v: unknown) => (v == null ? null : Number(v));
export function record(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const date = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10);

export async function productoDelPlan(sql: Sql, planId: string, appId: string, today: string) {
  const plans =
    await sql<Plan>`select id,status,code,currency,metadata,limits,valid_from,valid_to from torre.saas_plans where id=${planId}`;
  const plan = plans[0];
  if (
    !plan ||
    plan.status !== "active" ||
    (plan.valid_from && date(plan.valid_from) > today) ||
    (plan.valid_to && date(plan.valid_to) < today)
  )
    throw new Error("Elegí un plan activo y vigente.");
  if (!["USD", "ARS"].includes(plan.currency))
    throw new Error("El plan necesita una moneda válida.");
  const apps = await sql<{
    id: string;
    slug: string;
    status: string;
  }>`select id,slug,status from torre.saas_apps where id=${appId}`;
  const app = apps[0];
  if (!app || app.status !== "active") throw new Error("La aplicación no está activa.");
  const metadata = record(plan.metadata);
  if (metadata.app_slug && metadata.app_slug !== app.slug)
    throw new Error("Ese plan no pertenece a la aplicación elegida.");
  const products =
    await sql<Producto>`select id,slug,kind,app_id,config,status,billing,frequency,setup_usd,setup_ars,recurring_usd,recurring_ars,once_usd,once_ars from torre.saas_products where status='active'`;
  const code = (plan.code ?? "").replace(/^plan-/, "");
  const matches = products.filter((p) =>
    metadata.productId
      ? p.id === metadata.productId
      : metadata.catalogSlug
        ? p.slug === metadata.catalogSlug
        : record(p.config).plan === code ||
          p.slug === plan.code ||
          (code === "basico" && p.slug === "mostrador-base"),
  );
  if (matches.length !== 1)
    throw new Error(
      "El plan necesita un único producto de catálogo vinculado (metadata.catalogSlug).",
    );
  const product = matches[0];
  const family = record(product.config).family;
  if (product.app_id !== appId && !(app.slug === "mostrador" && family === "mercado"))
    throw new Error("Ese plan no corresponde a la aplicación elegida.");
  if (product.billing !== "recurring" || !["monthly", "yearly"].includes(product.frequency))
    throw new Error("El plan necesita un abono mensual o anual.");
  return { plan, product };
}

export async function planParaProducto(
  sql: Sql,
  product: { id: string; slug: string; config: unknown },
) {
  const plans = await sql<{
    id: string;
    code: string | null;
    metadata: unknown;
  }>`select id,code,metadata from torre.saas_plans where status='active'`;
  const matching = plans.filter((plan) => {
    const metadata = record(plan.metadata);
    return metadata.productId
      ? metadata.productId === product.id
      : metadata.catalogSlug
        ? metadata.catalogSlug === product.slug
        : product.slug === plan.code ||
          record(product.config).plan === (plan.code ?? "").replace(/^plan-/, "") ||
          (plan.code === "plan-basico" && product.slug === "mostrador-base");
  });
  if (matching.length > 1)
    throw new Error("Ese producto pertenece a varios planes. Elegí el plan desde Negocios.");
  return matching[0]?.id ?? null;
}

export async function sincronizarPlan(
  sql: Sql,
  tenantId: string,
  planId: string,
  appId: string,
  clientId: string,
  actor: string,
  currencyOverride?: "USD" | "ARS",
) {
  await sql`select id from torre.saas_tenants where id=${tenantId} for update`;
  const today = new Date().toISOString().slice(0, 10);
  const { plan, product } = await productoDelPlan(sql, planId, appId, today);
  const operational = (
    await sql<{
      operational_tenant_ref: string | null;
    }>`select operational_tenant_ref from torre.saas_tenants where id=${tenantId}`
  )[0]?.operational_tenant_ref;
  if (operational) {
    const limits = record(plan.limits),
      config = record(product.config);
    const userLimit = Number(limits.users);
    const branches = Number(
      limits.branches ?? (config.plan === "multi" ? 2 : (config.includedBranches ?? 1)),
    );
    const counts = (
      await sql<{
        users: number;
        branches: number;
      }>`select (select count(*)::int from staff where tenant_id=${operational} and activo=true) as users,(select count(*)::int from sucursales where tenant_id=${operational} and activa=true) as branches`
    )[0];
    const extras = await sql<{
      n: number;
    }>`select coalesce(sum(l.quantity),0)::int as n from torre.saas_subscription_lines l join torre.saas_subscriptions s on s.id=l.subscription_id join torre.saas_products p on p.id=l.product_id where s.tenant_id=${tenantId} and s.status in ('active','past_due') and l.status='active' and p.kind='branch' and l.starts_on<=current_date and (l.ends_on is null or l.ends_on>=current_date)`;
    if (Number.isInteger(userLimit) && userLimit > 0 && counts.users > userLimit)
      throw new Error(
        `El plan permite ${userLimit} usuarios. Desactivá los adicionales antes de cambiarlo.`,
      );
    if (
      Number.isInteger(branches) &&
      branches > 0 &&
      counts.branches > branches + (extras[0]?.n ?? 0)
    )
      throw new Error(
        `El plan no alcanza para las sucursales activas. Reducilas o contratá cupo antes de cambiarlo.`,
      );
  }
  const subs = await sql<{
    id: string;
    plan_id: string;
    status: string;
  }>`select id,plan_id,status from torre.saas_subscriptions where tenant_id=${tenantId} and status<>'cancelled' order by created_at desc for update`;
  if (subs.length > 1)
    throw new Error(
      "El negocio tiene varias suscripciones abiertas; resolvelas antes de cambiar el plan.",
    );
  let sub = subs[0];
  if (sub && !["active", "past_due", "pending"].includes(sub.status))
    throw new Error("Reactivá la suscripción antes de cambiar el plan.");
  if (!sub) {
    sub = { id: newId("sub"), plan_id: planId, status: "active" };
    await sql`insert into torre.saas_subscriptions(id,client_id,tenant_id,plan_id,monthly_price,status,start_date,next_payment_date) values(${sub.id},${clientId},${tenantId},${planId},0,'active',${today}::date,${today}::date)`;
  }
  const lines = await sql<{
    id: string;
    product_id: string;
    notes: string;
  }>`select id,product_id,notes from torre.saas_subscription_lines where subscription_id=${sub.id} and status='active' and charge='recurring' for update`;
  const managed = lines.filter((l) => l.notes.startsWith(PREFIX));
  const same = lines.find((l) => l.product_id === product.id);
  if (same && sub.plan_id === planId && managed.every((l) => l.product_id === product.id)) {
    if (!same.notes.startsWith(PREFIX))
      await sql`update torre.saas_subscription_lines set notes=${PREFIX + planId},updated_at=now() where id=${same.id}`;
    await sql`update torre.saas_tenants set plan_id=${planId},updated_at=now() where id=${tenantId}`;
    return { subscriptionId: sub.id, productId: product.id };
  }
  let priorProduct: string | undefined;
  if (sub.plan_id !== planId) {
    const old = await sql<{
      metadata: unknown;
      code: string;
    }>`select metadata,code from torre.saas_plans where id=${sub.plan_id}`;
    const metadata = record(old[0]?.metadata);
    const oldProducts = await sql<{
      id: string;
      slug: string;
      config: unknown;
    }>`select id,slug,config from torre.saas_products`;
    priorProduct = oldProducts.find((p) =>
      metadata.productId
        ? p.id === metadata.productId
        : metadata.catalogSlug
          ? p.slug === metadata.catalogSlug
          : record(p.config).plan === (old[0]?.code ?? "").replace(/^plan-/, "") ||
            p.slug === old[0]?.code ||
            (old[0]?.code === "plan-basico" && p.slug === "mostrador-base"),
    )?.id;
  }
  const ending = lines.filter(
    (l) =>
      l.product_id !== product.id && (l.notes.startsWith(PREFIX) || l.product_id === priorProduct),
  );
  for (const line of ending) {
    if (
      (
        await sql`select id from torre.saas_price_adjustments where line_id=${line.id} and kind='freeze' and status='active' and starts_on<=current_date and (ends_on is null or ends_on>=current_date)`
      ).length
    )
      throw new Error(
        "El plan tiene un precio congelado vigente. Resolvé ese ajuste antes de cambiarlo.",
      );
    await sql`update torre.saas_subscription_lines set status='ended',ends_on=${today}::date,updated_at=now() where id=${line.id}`;
  }
  const prices = {
    billing: product.billing,
    frequency: product.frequency,
    setupUsd: amount(product.setup_usd),
    setupArs: amount(product.setup_ars),
    recurringUsd: amount(product.recurring_usd),
    recurringArs: amount(product.recurring_ars),
    onceUsd: amount(product.once_usd),
    onceArs: amount(product.once_ars),
  };
  const currency = currencyOverride ?? (plan.currency as "USD" | "ARS");
  let fx: { id: string; usd_ars: unknown } | undefined;
  if (
    currency === "ARS" &&
    (prices.recurringArs == null || (prices.setupArs == null && (prices.setupUsd ?? 0) > 0))
  ) {
    fx = (
      await sql<{
        id: string;
        usd_ars: unknown;
      }>`select id,usd_ars from torre.saas_fx_rates order by as_of desc,created_at desc limit 1`
    )[0];
  }
  const snapshot = precioSnapshot(prices, currency, "recurring", amount(fx?.usd_ars));
  if (!same)
    await sql`insert into torre.saas_subscription_lines(id,subscription_id,product_id,quantity,unit_price,currency,frequency,charge,subtotal,starts_on,next_due,status,notes,fx_rate_id,fx_rate) values(${newId("lin")},${sub.id},${product.id},1,${snapshot.unit},${currency},${product.frequency},'recurring',${snapshot.unit},${today}::date,${today}::date,'active',${PREFIX + planId},${snapshot.fxUsed ? (fx?.id ?? null) : null},${snapshot.fxUsed})`;
  else
    await sql`update torre.saas_subscription_lines set notes=${PREFIX + planId},updated_at=now() where id=${same.id}`;
  const installationExists =
    (
      await sql`select l.id from torre.saas_subscription_lines l join torre.saas_subscriptions s on s.id=l.subscription_id where s.tenant_id=${tenantId} and l.charge='setup' and l.status<>'cancelled' limit 1`
    ).length > 0;
  if (!installationExists && (prices.setupUsd || prices.setupArs)) {
    const setup = precioSnapshot(prices, currency, "setup", amount(fx?.usd_ars));
    if (setup.unit > 0)
      await sql`insert into torre.saas_subscription_lines(id,subscription_id,product_id,quantity,unit_price,currency,frequency,charge,subtotal,starts_on,status,notes,fx_rate_id,fx_rate) values(${newId("lin")},${sub.id},${product.id},1,${setup.unit},${currency},'once','setup',${setup.unit},${today}::date,'active',${PREFIX + planId + ":instalacion"},${setup.fxUsed ? (fx?.id ?? null) : null},${setup.fxUsed})`;
  }
  await sql`update torre.saas_subscriptions set plan_id=${planId},client_id=${clientId},status='active',monthly_price=${product.frequency === "monthly" ? snapshot.unit : 0},updated_at=now() where id=${sub.id}`;
  await sql`update torre.saas_tenants set plan_id=${planId},updated_at=now() where id=${tenantId}`;
  await sql`insert into torre.saas_audit(id,actor_email,action,entity,entity_id,metadata) values(${newId("aud")},${actor},'sincronizar_plan','tenant',${tenantId},${JSON.stringify({ planId, productId: product.id, subscriptionId: sub.id })}::jsonb)`;
  return { subscriptionId: sub.id, productId: product.id };
}

export async function guardarNegocio(
  sql: Sql,
  data: AltaNegocio,
  actor: string,
  passwordHash?: string,
) {
  const name = data.name.trim(),
    slug = data.slug.trim(),
    planId = data.planId.trim();
  if (!name || !slug || !data.appId || !planId)
    throw new Error("Completá aplicación, nombre, slug y plan.");
  if (!["active", "inactive"].includes(data.status)) throw new Error("Estado de negocio inválido.");
  const today = new Date().toISOString().slice(0, 10);
  await productoDelPlan(sql, planId, data.appId, today);
  let clientId = data.clientId;
  if (data.id) {
    const current = (
      await sql<{
        app_id: string;
        operational_tenant_ref: string | null;
        client_id: string;
      }>`select app_id,operational_tenant_ref,client_id from torre.saas_tenants where id=${data.id} for update`
    )[0];
    if (!current) throw new Error("No está ese negocio.");
    if (
      current.app_id !== data.appId ||
      (data.operationalTenantRef.trim() || null) !== current.operational_tenant_ref
    )
      throw new Error(
        "No se puede cambiar la aplicación ni la referencia operativa de un negocio desde esta ficha.",
      );
    if (current.client_id !== clientId)
      throw new Error("La transferencia a otro cliente requiere una operación específica.");
    await sincronizarPlan(sql, data.id, planId, data.appId, clientId, actor);
    await sql`update torre.saas_tenants set name=${name},slug=${slug},status=${data.status},installed_version=${data.installedVersion.trim() || null},updated_at=now() where id=${data.id}`;
    if (current.operational_tenant_ref)
      await sql`update tenants set nombre=${name} where id=${current.operational_tenant_ref}`;
    return { id: data.id, clientId };
  }
  const email = (data.ownerEmail ?? "").trim().toLowerCase(),
    direccion = (data.direccion ?? "").trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !passwordHash ||
    (data.ownerPassword ?? "").length < 8
  )
    throw new Error("Completá el mail del dueño y una clave de al menos 8 caracteres.");
  if (direccion.length < 4 || direccion.length > 160)
    throw new Error("Completá una dirección de entre 4 y 160 caracteres.");
  await sql`select pg_advisory_xact_lock(hashtext(${email}))`;
  if ((await sql`select id from "user" where lower(email)=${email}`).length)
    throw new Error("Ese mail ya tiene cuenta.");
  if (clientId) {
    if (
      !(
        await sql`select id from torre.saas_clients where id=${clientId} and status='active' for update`
      ).length
    )
      throw new Error("Elegí un cliente activo.");
  } else {
    clientId = newId("cli");
    const clientName = (data.clientName ?? "").trim() || name;
    await sql`insert into torre.saas_clients(id,name,business_name,contact_name,email,status) values(${clientId},${clientName},${name},${clientName},${email},'active')`;
  }
  const id = newId("ten"),
    puestoId = newId("ten"),
    userId = newId("usr").replace("usr_", ""),
    branchId = newId("br"),
    matrixId = newId("suc");
  await sql`insert into tenants(id,nombre,config) values(${puestoId},${name},${JSON.stringify({ direccion })}::jsonb)`;
  await sql`insert into ticket_seq(tenant_id,ultimo) values(${puestoId},0)`;
  await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${userId},${name},${email},true,now(),now())`;
  await sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values(${newId("acc")},${email},'credential',${userId},${passwordHash},now(),now())`;
  await sql`insert into torre.saas_tenants(id,app_id,client_id,name,slug,status,plan_id,installed_version,operational_tenant_ref) values(${id},${data.appId},${clientId},${name},${slug},${data.status},${planId},${data.installedVersion.trim() || null},${puestoId})`;
  await sql`insert into torre.saas_branches(id,tenant_id,name,slug,address,status,included,opened_on) values(${branchId},${id},'Casa matriz','matriz',${direccion},'active',true,${today}::date)`;
  await sql`insert into sucursales(id,tenant_id,libros_tenant_id,nombre,referencia,es_matriz,activa,torre_branch_id) values(${matrixId},${puestoId},${puestoId},'Casa matriz',${direccion},true,true,${branchId})`;
  await sql`insert into staff(id,tenant_id,user_id,nombre,email,rol,activo,sucursal_actual_id) values(${newId("stf")},${puestoId},${userId},${name},${email},'admin',true,${matrixId})`;
  await sincronizarPlan(sql, id, planId, data.appId, clientId, actor);
  await sql`insert into torre.saas_audit(id,actor_email,action,entity,entity_id,metadata) values(${newId("aud")},${actor},'crear_tenant','tenant',${id},${JSON.stringify({ planId, clientId, operationalTenantRef: puestoId })}::jsonb)`;
  return { id, clientId };
}
