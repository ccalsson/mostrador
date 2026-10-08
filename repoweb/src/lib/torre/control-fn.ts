import { createServerFn } from "@tanstack/react-start";
import { materializarAjustes } from "@/lib/torre/aplicar-ajustes";
import { auditar } from "@/lib/torre/audit";
import { lineaCongelada, precioEfectivo } from "@/lib/torre/comercial";
import { intentarDeployWeb } from "@/lib/torre/deploy";
import {
  elegirManifest,
  extrasFacturables,
  hayActualizacion,
  incluidasPorBase,
  marcarIncluidas,
  precioSnapshot,
  totalMensual,
  cmpVer,
  type ReleaseRow,
} from "@/lib/torre/reglas";
import { exigirAccion } from "@/lib/torre/roles";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";

const KINDS = ["base_product", "addon", "branch", "subscription", "advertising", "messaging", "commission", "free"] as const;
const CURRENCIES = ["USD", "ARS"] as const;

function day(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function configOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  kind: string;
  app_id: string | null;
  billing: string;
  frequency: string;
  setup_usd: unknown;
  setup_ars: unknown;
  recurring_usd: unknown;
  recurring_ars: unknown;
  once_usd: unknown;
  once_ars: unknown;
  unit_label: string;
  config: unknown;
  status: string;
};

function publicarProducto(row: ProductRow) {
  const config = configOf(row.config);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    kind: row.kind,
    appId: row.app_id ?? "",
    billing: row.billing,
    frequency: row.frequency,
    setupUsd: row.setup_usd == null ? null : num(row.setup_usd),
    setupArs: row.setup_ars == null ? null : num(row.setup_ars),
    recurringUsd: row.recurring_usd == null ? null : num(row.recurring_usd),
    recurringArs: row.recurring_ars == null ? null : num(row.recurring_ars),
    onceUsd: row.once_usd == null ? null : num(row.once_usd),
    onceArs: row.once_ars == null ? null : num(row.once_ars),
    unitLabel: row.unit_label,
    config,
    configJson: JSON.stringify(config),
    status: row.status,
  };
}

async function fxVigente(sql: Awaited<ReturnType<typeof getSql>>) {
  const rows = await sql<{ id: string; source: string; as_of: unknown; usd_ars: unknown }>`
    select id, source, as_of, usd_ars from torre.saas_fx_rates order by as_of desc, created_at desc limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, source: row.source, asOf: day(row.as_of), usdArs: num(row.usd_ars) };
}

async function leerProducto(sql: Awaited<ReturnType<typeof getSql>>, id: string) {
  const rows = await sql<ProductRow>`
    select id, name, slug, description, kind, app_id, billing, frequency,
           setup_usd, setup_ars, recurring_usd, recurring_ars, once_usd, once_ars,
           unit_label, config, status
    from torre.saas_products where id = ${id} limit 1
  `;
  return rows[0] ? publicarProducto(rows[0]) : null;
}

async function asegurarSuscripcion(sql: Awaited<ReturnType<typeof getSql>>, tenantId: string, start: string) {
  const existing = await sql<{ id: string }>`
    select id from torre.saas_subscriptions
    where tenant_id = ${tenantId} and status = 'active'
    order by start_date desc limit 1
  `;
  if (existing[0]) return existing[0].id;
  const tenants = await sql<{ client_id: string; plan_id: string | null }>`
    select client_id, plan_id from torre.saas_tenants where id = ${tenantId} limit 1
  `;
  const tenant = tenants[0];
  if (!tenant) throw new Error("No está ese tenant.");
  const plans = tenant.plan_id
    ? [{ id: tenant.plan_id }]
    : await sql<{ id: string }>`select id from torre.saas_plans where status = 'active' order by name limit 1`;
  if (!plans[0]) throw new Error("No hay un plan para abrir la suscripción.");
  const id = newId("sub");
  await sql`
    insert into torre.saas_subscriptions (
      id, client_id, tenant_id, plan_id, monthly_price, status, start_date
    ) values (
      ${id}, ${tenant.client_id}, ${tenantId}, ${plans[0].id}, 0, 'active', ${start}::date
    )
  `;
  return id;
}

async function resincronizarSucursales(sql: Awaited<ReturnType<typeof getSql>>, tenantId: string, email: string) {
  const bases = await sql<{ status: string; kind: string; config: unknown }>`
    select l.status, p.kind, p.config
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_products p on p.id = l.product_id
    where s.tenant_id = ${tenantId}
  `;
  const allowance = incluidasPorBase(
    bases.map((row) => ({
      status: row.status,
      kind: row.kind,
      includedBranches: Number(configOf(row.config).includedBranches ?? 1),
    })),
  );
  const branches = await sql<{ id: string }>`
    select id from torre.saas_branches
    where tenant_id = ${tenantId} and status = 'active'
    order by opened_on, created_at, id
  `;
  const marks = marcarIncluidas(branches, allowance);
  for (const mark of marks) {
    await sql`update torre.saas_branches set included = ${mark.included}, updated_at = now() where id = ${mark.id}`;
  }
  const extras = extrasFacturables(branches.length, allowance);
  const productRows = await sql<ProductRow>`
    select id, name, slug, description, kind, app_id, billing, frequency,
           setup_usd, setup_ars, recurring_usd, recurring_ars, once_usd, once_ars,
           unit_label, config, status
    from torre.saas_products where slug = 'sucursal-extra' limit 1
  `;
  const product = productRows[0] ? publicarProducto(productRows[0]) : null;
  const lineRows = await sql<{ id: string; unit_price: unknown; currency: string; status: string }>`
    select l.id, l.unit_price, l.currency, l.status
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_products p on p.id = l.product_id
    where s.tenant_id = ${tenantId} and p.slug = 'sucursal-extra' and l.status = 'active' and l.charge = 'recurring'
    limit 1
  `;
  if (extras === 0) {
    if (lineRows[0]) {
      await sql`
        update torre.saas_subscription_lines
        set status = 'ended', ends_on = current_date, updated_at = now()
        where id = ${lineRows[0].id}
      `;
    }
    return { extras, allowance };
  }
  if (!product) throw new Error("Falta el producto Sucursal extra en el catálogo.");
  if (lineRows[0]) {
    const unit = num(lineRows[0].unit_price);
    await sql`
      update torre.saas_subscription_lines
      set quantity = ${extras}, subtotal = ${unit * extras}, updated_at = now()
      where id = ${lineRows[0].id}
    `;
    return { extras, allowance };
  }
  const fx = await fxVigente(sql);
  const snap = precioSnapshot(product, "USD", "recurring", fx?.usdArs ?? null);
  const subscriptionId = await asegurarSuscripcion(sql, tenantId, new Date().toISOString().slice(0, 10));
  const lineId = newId("lin");
  await sql`
    insert into torre.saas_subscription_lines (
      id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal, starts_on, status
    ) values (
      ${lineId}, ${subscriptionId}, ${product.id}, ${extras}, ${snap.unit}, 'USD', 'monthly', 'recurring',
      ${snap.unit * extras}, current_date, 'active'
    )
  `;
  await auditar(email, "contratar_sucursal_extra", "subscription_line", lineId, { tenantId, extras, unit: snap.unit });
  return { extras, allowance };
}

export const listProducts = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<ProductRow>`
      select id, name, slug, description, kind, app_id, billing, frequency,
             setup_usd, setup_ars, recurring_usd, recurring_ars, once_usd, once_ars,
             unit_label, config, status
      from torre.saas_products
      order by lower(name)
    `;
    return rows.map((row) => {
      const product = publicarProducto(row);
      const { config: _config, ...rest } = product;
      return rest;
    });
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    id?: string;
    name: string;
    slug: string;
    description: string;
    kind: string;
    appId: string;
    billing: string;
    frequency: string;
    setupUsd: string;
    setupArs: string;
    recurringUsd: string;
    recurringArs: string;
    onceUsd: string;
    onceArs: string;
    unitLabel: string;
    config: string;
    status: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.name.trim() || !data.slug.trim()) throw new Error("Nombre y slug son obligatorios.");
    if (!KINDS.includes(data.kind as (typeof KINDS)[number])) throw new Error("Tipo inválido.");
    let config: Record<string, unknown> = {};
    if (data.config.trim()) {
      try {
        config = JSON.parse(data.config) as Record<string, unknown>;
      } catch {
        throw new Error("La configuración tiene que ser JSON.");
      }
    }
    const numOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
    const sql = await getSql();
    const id = data.id || newId("prod");
    const appId = data.appId || null;
    if (data.id) {
      await sql`
        update torre.saas_products set
          name = ${data.name.trim()}, slug = ${data.slug.trim()}, description = ${data.description.trim()},
          kind = ${data.kind}, app_id = ${appId}, billing = ${data.billing}, frequency = ${data.frequency},
          setup_usd = ${numOrNull(data.setupUsd)}, setup_ars = ${numOrNull(data.setupArs)},
          recurring_usd = ${numOrNull(data.recurringUsd)}, recurring_ars = ${numOrNull(data.recurringArs)},
          once_usd = ${numOrNull(data.onceUsd)}, once_ars = ${numOrNull(data.onceArs)},
          unit_label = ${data.unitLabel.trim()}, config = ${JSON.stringify(config)}::jsonb,
          status = ${data.status}, updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_products (
          id, name, slug, description, kind, app_id, billing, frequency,
          setup_usd, setup_ars, recurring_usd, recurring_ars, once_usd, once_ars,
          unit_label, config, status
        ) values (
          ${id}, ${data.name.trim()}, ${data.slug.trim()}, ${data.description.trim()}, ${data.kind}, ${appId},
          ${data.billing}, ${data.frequency}, ${numOrNull(data.setupUsd)}, ${numOrNull(data.setupArs)},
          ${numOrNull(data.recurringUsd)}, ${numOrNull(data.recurringArs)}, ${numOrNull(data.onceUsd)},
          ${numOrNull(data.onceArs)}, ${data.unitLabel.trim()}, ${JSON.stringify(config)}::jsonb, ${data.status}
        )
      `;
    }
    if (data.kind === "commission") {
      const min = Number(config.percentMin ?? 10);
      const max = Number(config.percentMax ?? min);
      await sql`
        update torre.saas_commission_policies
        set status = 'archived', effective_to = current_date
        where product_id = ${id} and status = 'active'
      `;
      await sql`
        insert into torre.saas_commission_policies (id, product_id, percent_min, percent_max, effective_from, status)
        values (${newId("pol")}, ${id}, ${min}, ${max}, current_date, 'active')
      `;
    }
    await auditar(email, data.id ? "editar_producto" : "crear_producto", "product", id, { slug: data.slug, kind: data.kind });
    return { id };
  });

export const listFx = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; source: string; as_of: unknown; usd_ars: unknown }>`
      select id, source, as_of, usd_ars from torre.saas_fx_rates order by as_of desc, created_at desc
    `;
    return rows.map((row) => ({ id: row.id, source: row.source, asOf: day(row.as_of), usdArs: num(row.usd_ars) }));
  });

export const saveFx = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { source: string; asOf: string; usdArs: number }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.source.trim() || !data.asOf || !(data.usdArs > 0)) throw new Error("Completá fuente, fecha y valor.");
    const sql = await getSql();
    const id = newId("fx");
    await sql`
      insert into torre.saas_fx_rates (id, source, as_of, usd_ars)
      values (${id}, ${data.source.trim()}, ${data.asOf}::date, ${data.usdArs})
    `;
    await auditar(email, "actualizar_tipo_cambio", "fx_rate", id, { source: data.source, usdArs: data.usdArs, asOf: data.asOf });
    return { id };
  });

export const listBranches = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      name: string;
      slug: string;
      address: string;
      status: string;
      included: boolean;
      opened_on: unknown;
      closed_on: unknown;
    }>`
      select b.id, b.tenant_id, t.name as tenant_name, b.name, b.slug, b.address, b.status, b.included,
             b.opened_on, b.closed_on
      from torre.saas_branches b
      join torre.saas_tenants t on t.id = b.tenant_id
      order by t.name, b.opened_on, b.name
    `;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      name: row.name,
      slug: row.slug,
      address: row.address,
      status: row.status,
      included: row.included,
      openedOn: day(row.opened_on),
      closedOn: row.closed_on ? day(row.closed_on) : "",
    }));
  });

export const saveBranch = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id?: string; tenantId: string; name: string; slug: string; address: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.tenantId || !data.name.trim() || !data.slug.trim()) throw new Error("Completá tenant, nombre y slug.");
    const sql = await getSql();
    const id = data.id || newId("br");
    if (data.id) {
      await sql`
        update torre.saas_branches
        set name = ${data.name.trim()}, slug = ${data.slug.trim()}, address = ${data.address.trim()}, updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_branches (id, tenant_id, name, slug, address, status, opened_on)
        values (${id}, ${data.tenantId}, ${data.name.trim()}, ${data.slug.trim()}, ${data.address.trim()}, 'active', current_date)
      `;
    }
    const sync = await resincronizarSucursales(sql, data.tenantId, email);
    await auditar(email, data.id ? "editar_sucursal" : "alta_sucursal", "branch", id, { tenantId: data.tenantId, ...sync });
    return { id, ...sync };
  });

export const setBranchStatus = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id: string; status: "active" | "inactive" }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    const sql = await getSql();
    const rows = await sql<{ tenant_id: string }>`select tenant_id from torre.saas_branches where id = ${data.id} limit 1`;
    if (!rows[0]) throw new Error("No está esa sucursal.");
    await sql`
      update torre.saas_branches
      set status = ${data.status},
          closed_on = case when ${data.status} = 'inactive' then current_date else null end,
          updated_at = now()
      where id = ${data.id}
    `;
    const sync = await resincronizarSucursales(sql, rows[0].tenant_id, email);
    await auditar(email, data.status === "active" ? "activar_sucursal" : "desactivar_sucursal", "branch", data.id, sync);
    return { ok: true, ...sync };
  });

export const serviciosDeTenant = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ context, data: tenantId }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const lines = await sql<{
      id: string;
      product_id: string;
      product_name: string;
      slug: string;
      kind: string;
      quantity: unknown;
      unit_price: unknown;
      currency: string;
      frequency: string;
      charge: string;
      subtotal: unknown;
      starts_on: unknown;
      ends_on: unknown;
      next_due: unknown;
      paid_through: unknown;
      status: string;
      notes: string;
    }>`
      select l.id, l.product_id, p.name as product_name, p.slug, p.kind, l.quantity, l.unit_price, l.currency,
             l.frequency, l.charge, l.subtotal, l.starts_on, l.ends_on, l.next_due, l.paid_through, l.status, l.notes
      from torre.saas_subscription_lines l
      join torre.saas_subscriptions s on s.id = l.subscription_id
      join torre.saas_products p on p.id = l.product_id
      where s.tenant_id = ${tenantId}
      order by l.starts_on, p.name
    `;
    const branches = await sql<{ id: string; name: string; status: string; included: boolean }>`
      select id, name, status, included from torre.saas_branches where tenant_id = ${tenantId} order by opened_on, name
    `;
    const mapped = lines.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      slug: row.slug,
      kind: row.kind,
      quantity: num(row.quantity),
      unitPrice: num(row.unit_price),
      currency: row.currency,
      frequency: row.frequency,
      charge: row.charge,
      subtotal: num(row.subtotal),
      startsOn: day(row.starts_on),
      endsOn: row.ends_on ? day(row.ends_on) : "",
      nextDue: row.next_due ? day(row.next_due) : "",
      paidThrough: row.paid_through ? day(row.paid_through) : "",
      status: row.status,
      notes: row.notes,
    }));
    const today = new Date().toISOString().slice(0, 10);
    const adjustments = await sql<{
      line_id: string | null;
      kind: string;
      percent: unknown;
      amount: unknown;
      status: string;
      starts_on: unknown;
      ends_on: unknown;
    }>`
      select line_id, kind, percent, amount, status, starts_on, ends_on
      from torre.saas_price_adjustments
      where tenant_id = ${tenantId}
    `;
    const withDue = mapped.map((line) => {
      const propios = adjustments.filter((row) => row.line_id === line.id).map((row) => ({
        kind: row.kind,
        percent: row.percent == null ? null : num(row.percent),
        amount: row.amount == null ? null : num(row.amount),
        status: row.status,
        startsOn: day(row.starts_on),
        endsOn: row.ends_on ? day(row.ends_on) : null,
      }));
      const efecto = precioEfectivo(line.unitPrice, propios, today);
      return {
        ...line,
        amountDue: Math.round(efecto.effective * line.quantity * 100) / 100,
        frozen: efecto.frozen,
      };
    });
    const monthlyDue: Record<string, number> = {};
    for (const line of withDue) {
      if (line.status !== "active" || line.frequency !== "monthly" || line.charge !== "recurring") continue;
      monthlyDue[line.currency] = Math.round(((monthlyDue[line.currency] ?? 0) + line.amountDue) * 100) / 100;
    }
    return {
      lines: withDue,
      branches: branches.map((row) => ({ id: row.id, name: row.name, status: row.status, included: row.included })),
      monthly: totalMensual(mapped),
      monthlyDue,
    };
  });

type ContratarInput = {
  tenantId: string;
  productId: string;
  currency: "USD" | "ARS";
  quantity: number;
  start: string;
  notes: string;
  contentRef: string;
};

async function contratarEn(email: string, data: ContratarInput) {
  if (!CURRENCIES.includes(data.currency)) throw new Error("Moneda inválida.");
    const sql = await getSql();
    const product = await leerProducto(sql, data.productId);
    if (!product || product.status !== "active") throw new Error("Ese producto no está activo.");
    if (product.kind === "branch") {
      throw new Error("La sucursal extra se suma al crear una sucursal. La primera no se factura.");
    }
    if (product.kind === "commission") {
      throw new Error("El cargador es una comisión, no un abono. La política está en el catálogo.");
    }
    if (product.kind === "free") {
      await auditar(email, "anotar_producto_gratis", "product", product.id, { tenantId: data.tenantId });
      return { id: product.id, monthly: {}, note: "Sin cargo. No se creó una línea." };
    }
    const start = data.start || new Date().toISOString().slice(0, 10);
    const dup = await sql<{ id: string }>`
      select l.id
      from torre.saas_subscription_lines l
      join torre.saas_subscriptions s on s.id = l.subscription_id
      where s.tenant_id = ${data.tenantId} and l.product_id = ${product.id} and l.status = 'active' and l.charge = 'recurring'
      limit 1
    `;
    if (dup[0] && product.billing === "recurring") throw new Error("Ese servicio ya está contratado.");
    const subscriptionId = await asegurarSuscripcion(sql, data.tenantId, start);
    const fx = await fxVigente(sql);
    const quantity = product.kind === "messaging" ? 1 : Math.max(1, data.quantity || 1);
    const charge = product.billing === "once" || product.frequency === "once" ? "recurring" : "recurring";
    const snap = precioSnapshot(
      product,
      data.currency,
      product.billing === "once" ? "recurring" : "recurring",
      fx?.usdArs ?? null,
    );
    const once = product.billing === "once" || product.frequency === "once";
    const lineId = newId("lin");
    const subtotal = snap.unit * quantity;
    const days = Number(product.config.days ?? 0);
    const ends = once && days > 0 ? addDays(start, days) : null;
    await sql`
      insert into torre.saas_subscription_lines (
        id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal,
        starts_on, ends_on, next_due, status, notes, fx_rate_id, fx_rate
      ) values (
        ${lineId}, ${subscriptionId}, ${product.id}, ${quantity}, ${snap.unit}, ${data.currency},
        ${once ? "once" : product.frequency}, ${once ? "recurring" : charge}, ${subtotal},
        ${start}::date, ${ends}::date, ${once ? null : start}::date, 'active', ${data.notes.trim()},
        ${snap.fxUsed ? fx?.id ?? null : null}, ${snap.fxUsed}
      )
    `;
    if ((product.setupUsd != null || product.setupArs != null) && product.billing === "recurring") {
      const setup = precioSnapshot(product, data.currency, "setup", fx?.usdArs ?? null);
      if (setup.unit > 0) {
        await sql`
          insert into torre.saas_subscription_lines (
            id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal,
            starts_on, status, notes, fx_rate_id, fx_rate
          ) values (
            ${newId("lin")}, ${subscriptionId}, ${product.id}, 1, ${setup.unit}, ${data.currency}, 'once', 'setup',
            ${setup.unit}, ${start}::date, 'active', 'Implementación', ${setup.fxUsed ? fx?.id ?? null : null}, ${setup.fxUsed}
          )
        `;
      }
    }
    if (product.kind === "base_product") {
      const count = await sql<{ n: number }>`select count(*)::int as n from torre.saas_branches where tenant_id = ${data.tenantId}`;
      if ((count[0]?.n ?? 0) === 0) {
        await sql`
          insert into torre.saas_branches (id, tenant_id, name, slug, status, included, opened_on)
          values (${newId("br")}, ${data.tenantId}, 'Sucursal 1', 'sucursal-1', 'active', true, ${start}::date)
        `;
      }
      await resincronizarSucursales(sql, data.tenantId, email);
    }
    if (product.kind === "advertising") {
      await sql`
        insert into torre.saas_ads (
          id, product_id, tenant_id, line_id, placement, starts_on, ends_on, price, currency, status, content_ref, notes
        ) values (
          ${newId("ad")}, ${product.id}, ${data.tenantId}, ${lineId}, ${String(product.config.placement ?? "home")},
          ${start}::date, ${ends ?? addDays(start, 7)}::date, ${subtotal}, ${data.currency}, 'scheduled',
          ${data.contentRef.trim()}, ${data.notes.trim()}
        )
      `;
    }
    if (product.kind === "messaging") {
      const sends = Number(product.config.sends ?? quantity);
      await sql`
        insert into torre.saas_message_packs (id, tenant_id, product_id, line_id, quantity, consumed, purchased_on, status)
        values (${newId("pack")}, ${data.tenantId}, ${product.id}, ${lineId}, ${sends}, 0, ${start}::date, 'active')
      `;
    }
    await auditar(email, "contratar", "subscription_line", lineId, {
      tenantId: data.tenantId,
      product: product.slug,
      unit: snap.unit,
      currency: data.currency,
      charge: once ? "once" : "recurring",
      setup: product.billing === "recurring" && (product.setupUsd != null || product.setupArs != null),
    });
    const ajustes = await materializarAjustes(data.tenantId);
    const servicios = await sql<{ currency: string; subtotal: unknown; frequency: string; charge: string; status: string }>`
      select l.currency, l.subtotal, l.frequency, l.charge, l.status
      from torre.saas_subscription_lines l
      join torre.saas_subscriptions s on s.id = l.subscription_id
      where s.tenant_id = ${data.tenantId}
    `;
    return {
      id: lineId,
      monthly: totalMensual(servicios.map((row) => ({ ...row, subtotal: num(row.subtotal) }))),
      adjustments: ajustes.inserted,
    };
}

export const contratarProducto = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: ContratarInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    return contratarEn(email, data);
  });

export const reemplazarProducto = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { lineId: string; productId: string; currency: "USD" | "ARS" }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    const sql = await getSql();
    const current = await sql<{ tenant_id: string; slug: string }>`
      select s.tenant_id, p.slug
      from torre.saas_subscription_lines l
      join torre.saas_subscriptions s on s.id = l.subscription_id
      join torre.saas_products p on p.id = l.product_id
      where l.id = ${data.lineId} and l.status = 'active'
      limit 1
    `;
    if (!current[0]) throw new Error("Esa línea no está activa.");
    const hoy = new Date().toISOString().slice(0, 10);
    const freezes = await sql<{ status: string; starts_on: unknown; ends_on: unknown }>`
      select status, starts_on, ends_on
      from torre.saas_price_adjustments
      where line_id = ${data.lineId} and kind = 'freeze'
    `;
    if (lineaCongelada(freezes.map((row) => ({
      kind: "freeze",
      status: row.status,
      startsOn: day(row.starts_on),
      endsOn: row.ends_on ? day(row.ends_on) : null,
    })), hoy)) {
      throw new Error("Ese precio está congelado. No se reemplaza el servicio durante la vigencia.");
    }
    await sql`
      update torre.saas_subscription_lines
      set status = 'ended', ends_on = current_date, updated_at = now()
      where id = ${data.lineId}
    `;
    const created = await contratarEn(email, {
      tenantId: current[0].tenant_id,
      productId: data.productId,
      currency: data.currency,
      quantity: 1,
      start: new Date().toISOString().slice(0, 10),
      notes: `Reemplaza a ${current[0].slug}`,
      contentRef: "",
    });
    await auditar(email, "reemplazar_servicio", "subscription_line", data.lineId, {
      from: current[0].slug,
      productId: data.productId,
    });
    return created;
  });

export const listAds = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      product_name: string;
      tenant_name: string;
      placement: string;
      starts_on: unknown;
      ends_on: unknown;
      price: unknown;
      currency: string;
      status: string;
      content_ref: string;
      notes: string;
    }>`
      select a.id, p.name as product_name, t.name as tenant_name, a.placement, a.starts_on, a.ends_on,
             a.price, a.currency, a.status, a.content_ref, a.notes
      from torre.saas_ads a
      join torre.saas_products p on p.id = a.product_id
      join torre.saas_tenants t on t.id = a.tenant_id
      order by a.starts_on desc
    `;
    return rows.map((row) => ({
      id: row.id,
      productName: row.product_name,
      tenantName: row.tenant_name,
      placement: row.placement,
      startsOn: day(row.starts_on),
      endsOn: day(row.ends_on),
      price: num(row.price),
      currency: row.currency,
      status: row.status,
      contentRef: row.content_ref,
      notes: row.notes,
    }));
  });

export const setAdStatus = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id: string; status: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    const allowed = ["draft", "pending_payment", "scheduled", "active", "expired", "cancelled"];
    if (!allowed.includes(data.status)) throw new Error("Estado inválido.");
    const sql = await getSql();
    await sql`update torre.saas_ads set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    await auditar(email, "estado_publicidad", "ad", data.id, { status: data.status });
    return { ok: true };
  });

export const listPacks = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      tenant_name: string;
      product_name: string;
      quantity: number;
      consumed: number;
      purchased_on: unknown;
      expires_on: unknown;
      status: string;
    }>`
      select k.id, t.name as tenant_name, p.name as product_name, k.quantity, k.consumed, k.purchased_on, k.expires_on, k.status
      from torre.saas_message_packs k
      join torre.saas_tenants t on t.id = k.tenant_id
      join torre.saas_products p on p.id = k.product_id
      order by k.purchased_on desc
    `;
    return rows.map((row) => ({
      id: row.id,
      tenantName: row.tenant_name,
      productName: row.product_name,
      quantity: row.quantity,
      consumed: row.consumed,
      remaining: row.quantity - row.consumed,
      purchasedOn: day(row.purchased_on),
      expiresOn: row.expires_on ? day(row.expires_on) : "",
      status: row.status,
    }));
  });

export const registrarConsumo = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id: string; amount: number }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!(data.amount > 0)) throw new Error("El consumo tiene que ser mayor a cero.");
    const sql = await getSql();
    const rows = await sql<{ quantity: number; consumed: number }>`
      select quantity, consumed from torre.saas_message_packs where id = ${data.id} limit 1
    `;
    const pack = rows[0];
    if (!pack) throw new Error("No está ese pack.");
    const consumed = pack.consumed + Math.floor(data.amount);
    if (consumed > pack.quantity) throw new Error("Supera el cupo contratado.");
    await sql`
      update torre.saas_message_packs
      set consumed = ${consumed}, status = ${consumed === pack.quantity ? "exhausted" : "active"}
      where id = ${data.id}
    `;
    await auditar(email, "consumo_mensajeria", "message_pack", data.id, { amount: data.amount, consumed });
    return { consumed, remaining: pack.quantity - consumed };
  });

export const publicarRelease = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: {
    versionId: string;
    scope: "all" | "tenant" | "branch" | "beta";
    tenantId: string;
    branchId: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (data.scope === "tenant" || data.scope === "beta") {
      if (!data.tenantId) throw new Error("Elegí el tenant.");
    }
    if (data.scope === "branch" && !data.branchId) throw new Error("Elegí la sucursal.");
    const sql = await getSql();
    const versions = await sql<{ id: string; app_id: string; platform: string; version: string }>`
      select id, app_id, platform, version from torre.saas_versions where id = ${data.versionId} limit 1
    `;
    const version = versions[0];
    if (!version) throw new Error("No está esa versión.");
    await sql`
      update torre.saas_versions
      set status = 'published', published_at = coalesce(published_at, now())
      where id = ${version.id}
    `;
    const targetId = newId("rt");
    await sql`
      insert into torre.saas_release_targets (id, version_id, scope, tenant_id, branch_id, status)
      values (
        ${targetId}, ${version.id}, ${data.scope},
        ${data.scope === "all" ? null : data.tenantId || null},
        ${data.scope === "branch" ? data.branchId : null},
        'approved'
      )
    `;
    const attempt = await intentarDeployWeb(version.platform);
    const depId = newId("dep");
    const confirmed = attempt.attempted && attempt.ok;
    const status = !attempt.attempted ? "pending" : attempt.ok ? "deployed" : "failed";
    const note = attempt.attempted ? attempt.log : attempt.reason;
    await sql`
      insert into torre.saas_deployments (
        id, app_id, tenant_id, version_id, platform, status, deployed_at, notes,
        infra_confirmed, external_id, external_url, log_excerpt, origin
      ) values (
        ${depId}, ${version.app_id}, ${data.scope === "tenant" || data.scope === "beta" ? data.tenantId || null : null},
        ${version.id}, ${version.platform}, ${status},
        ${confirmed ? new Date().toISOString() : null}::timestamptz,
        ${note}, ${confirmed}, ${attempt.attempted ? attempt.externalId || null : null},
        ${attempt.attempted ? attempt.url || null : null}, ${note}, 'publish'
      )
    `;
    await auditar(email, "publicar_release", "version", version.id, {
      scope: data.scope,
      infrastructureConfirmed: confirmed,
      deploymentId: depId,
    });
    return {
      deploymentId: depId,
      publication: "torre" as const,
      infrastructureConfirmed: confirmed,
      message: confirmed
        ? "El hook de deploy respondió. La versión quedó publicada en Torre."
        : `Publicado en Torre. ${note}`,
    };
  });

export const recomendarAnterior = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((versionId: string) => versionId)
  .handler(async ({ context, data: versionId }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    const sql = await getSql();
    const rows = await sql<{ app_id: string; platform: string; version: string }>`
      select app_id, platform, version from torre.saas_versions where id = ${versionId} limit 1
    `;
    const current = rows[0];
    if (!current) throw new Error("No está esa versión.");
    const prev = await sql<{ id: string; version: string }>`
      select id, version from torre.saas_versions
      where app_id = ${current.app_id} and platform = ${current.platform} and status = 'published' and id <> ${versionId}
    `;
    const older = prev
      .map((row) => row)
      .sort((a, b) => (a.version < b.version ? 1 : -1))
      .find((row) => row.version.localeCompare(current.version, undefined, { numeric: true }) < 0);
    if (!older) throw new Error("No hay una versión publicada anterior para recomendar.");
    await sql`update torre.saas_versions set status = 'deprecated' where id = ${versionId}`;
    await auditar(email, "recomendar_version_anterior", "version", older.id, {
      deprecated: versionId,
      note: "Rollback administrativo del manifest. No revierte un deploy en ejecución.",
    });
    return {
      recommendedId: older.id,
      infrastructureConfirmed: false,
      message: "El manifest vuelve a recomendar la versión anterior. La infraestructura no hizo rollback.",
    };
  });

export const listTargets = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      version_id: string;
      version: string;
      platform: string;
      app_name: string;
      scope: string;
      tenant_name: string | null;
      branch_name: string | null;
      status: string;
    }>`
      select t.id, t.version_id, v.version, v.platform, a.name as app_name, t.scope,
             tn.name as tenant_name, b.name as branch_name, t.status
      from torre.saas_release_targets t
      join torre.saas_versions v on v.id = t.version_id
      join torre.saas_apps a on a.id = v.app_id
      left join torre.saas_tenants tn on tn.id = t.tenant_id
      left join torre.saas_branches b on b.id = t.branch_id
      order by t.created_at desc
    `;
    return rows.map((row) => ({
      id: row.id,
      versionId: row.version_id,
      version: row.version,
      platform: row.platform,
      appName: row.app_name,
      scope: row.scope,
      tenantName: row.tenant_name ?? "",
      branchName: row.branch_name ?? "",
      status: row.status,
    }));
  });

export const resumenComercial = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const lines = await sql<{ currency: string; subtotal: unknown; frequency: string; charge: string; status: string }>`
      select currency, subtotal, frequency, charge, status from torre.saas_subscription_lines
    `;
    const pending = await sql<{ currency: string; amount: unknown }>`
      select currency, coalesce(sum(amount), 0) as amount
      from torre.saas_payments where status = 'pending' group by currency
    `;
    const counts = await sql<{
      subs: number;
      branches: number;
      addons: number;
      ads: number;
      mostrador: number;
      mercado: number;
      documents: number;
      published_documents: number;
      pending_contracts: number;
      acceptances: number;
      releases: number;
      packs: number;
    }>`
      select
        (select count(*)::int from torre.saas_subscriptions where status = 'active') as subs,
        (select count(*)::int from torre.saas_branches where status = 'active') as branches,
        (select count(*)::int from torre.saas_subscription_lines l join torre.saas_products p on p.id = l.product_id where l.status = 'active' and p.kind = 'addon') as addons,
        (select count(*)::int from torre.saas_ads where status = 'active') as ads,
        (select count(distinct s.tenant_id)::int from torre.saas_subscription_lines l
           join torre.saas_subscriptions s on s.id = l.subscription_id
           join torre.saas_products p on p.id = l.product_id
           where l.status = 'active' and p.slug = 'mostrador-base') as mostrador,
        (select count(distinct s.tenant_id)::int from torre.saas_subscription_lines l
           join torre.saas_subscriptions s on s.id = l.subscription_id
           join torre.saas_products p on p.id = l.product_id
           where l.status = 'active' and coalesce(p.config->>'family', '') = 'mercado') as mercado,
        (select count(*)::int from torre.saas_legal_documents) as documents,
        (select count(*)::int from torre.saas_legal_documents where status = 'published') as published_documents,
        (select count(*)::int from torre.saas_tenant_contracts where status = 'pending') as pending_contracts,
        (select count(*)::int from torre.saas_contract_acceptances) as acceptances,
        (select count(*)::int from torre.saas_versions where status = 'published') as releases,
        (select count(*)::int from torre.saas_message_packs where status = 'active') as packs
    `;
    const alertas: string[] = [];
    const vencidas = await sql<{ name: string; next_due: unknown }>`
      select t.name, l.next_due
      from torre.saas_subscription_lines l
      join torre.saas_subscriptions s on s.id = l.subscription_id
      join torre.saas_tenants t on t.id = s.tenant_id
      where l.status = 'active' and l.frequency = 'monthly' and l.next_due is not null and l.next_due < current_date
    `;
    for (const row of vencidas) alertas.push(`Abono vencido: ${row.name} (${day(row.next_due)}).`);
    const porVencer = await sql<{ name: string; ends_on: unknown }>`
      select t.name, l.ends_on
      from torre.saas_subscription_lines l
      join torre.saas_subscriptions s on s.id = l.subscription_id
      join torre.saas_tenants t on t.id = s.tenant_id
      where l.status = 'active' and l.ends_on is not null and l.ends_on <= current_date + 7
    `;
    for (const row of porVencer) alertas.push(`Contrato por vencer: ${row.name} (${day(row.ends_on)}).`);
    const ads = await sql<{ tenant: string; ends_on: unknown; status: string }>`
      select t.name as tenant, a.ends_on, a.status
      from torre.saas_ads a
      join torre.saas_tenants t on t.id = a.tenant_id
      where a.status in ('scheduled', 'active') and a.ends_on <= current_date + 3
    `;
    for (const row of ads) alertas.push(`Publicidad ${row.status === "active" && day(row.ends_on) < new Date().toISOString().slice(0, 10) ? "vencida" : "por vencer"}: ${row.tenant} (${day(row.ends_on)}).`);
    const bajas = await sql<{ n: number }>`select count(*)::int as n from torre.saas_branches where status = 'inactive'`;
    if ((bajas[0]?.n ?? 0) > 0) alertas.push(`${bajas[0]?.n} sucursal(es) desactivada(s).`);
    const sinLineas = await sql<{ name: string }>`
      select t.name from torre.saas_subscriptions s
      join torre.saas_tenants t on t.id = s.tenant_id
      where s.status = 'active'
        and not exists (select 1 from torre.saas_subscription_lines l where l.subscription_id = s.id and l.status = 'active')
    `;
    for (const row of sinLineas) alertas.push(`${row.name} tiene suscripción activa sin líneas de servicio.`);
    return {
      mrr: totalMensual(lines.map((row) => ({ ...row, subtotal: num(row.subtotal) }))),
      pending: pending.map((row) => ({ currency: row.currency, amount: num(row.amount) })),
      subscriptions: counts[0]?.subs ?? 0,
      branches: counts[0]?.branches ?? 0,
      addons: counts[0]?.addons ?? 0,
      ads: counts[0]?.ads ?? 0,
      mostrador: counts[0]?.mostrador ?? 0,
      mercado: counts[0]?.mercado ?? 0,
      documents: counts[0]?.documents ?? 0,
      publishedDocuments: counts[0]?.published_documents ?? 0,
      pendingContracts: counts[0]?.pending_contracts ?? 0,
      acceptances: counts[0]?.acceptances ?? 0,
      releases: counts[0]?.releases ?? 0,
      packs: counts[0]?.packs ?? 0,
      alertas,
    };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{ actor_email: string; action: string; entity: string; entity_id: string; created_at: string; metadata: unknown }>`
      select actor_email, action, entity, entity_id, created_at::text as created_at, metadata
      from torre.saas_audit
      order by created_at desc
      limit 150
    `;
    return rows.map((row) => ({
      actor: row.actor_email,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      at: row.created_at.slice(0, 16).replace("T", " "),
      metadata: JSON.stringify(configOf(row.metadata)),
    }));
  });

export const listLineas = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      product_id: string;
      product_name: string;
      currency: string;
      subtotal: unknown;
      status: string;
      subscription_id: string;
    }>`
      select l.id, s.tenant_id, t.name as tenant_name, l.product_id, p.name as product_name,
             l.currency, l.subtotal, l.status, l.subscription_id
      from torre.saas_subscription_lines l
      join torre.saas_subscriptions s on s.id = l.subscription_id
      join torre.saas_tenants t on t.id = s.tenant_id
      join torre.saas_products p on p.id = l.product_id
      where l.status = 'active'
      order by t.name, p.name
    `;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      productId: row.product_id,
      productName: row.product_name,
      currency: row.currency,
      subtotal: num(row.subtotal),
      status: row.status,
      subscriptionId: row.subscription_id,
    }));
  });

export async function manifestPara(appSlug: string, platform: string, audience: { tenantId?: string; branchId?: string; current?: string }) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    version: string;
    status: string;
    published_at: string | null;
    checksum: string | null;
    minimum_supported_version: string | null;
    mandatory: boolean;
    download_url: string | null;
    changelog: string;
  }>`
    select v.id, v.version, v.status, v.published_at::text as published_at, v.checksum,
           v.minimum_supported_version, v.mandatory, v.download_url, v.changelog
    from torre.saas_versions v
    join torre.saas_apps a on a.id = v.app_id
    where a.slug = ${appSlug} and v.platform = ${platform}
  `;
  const targets = await sql<{ version_id: string; scope: string; tenant_id: string | null; branch_id: string | null; status: string }>`
    select version_id, scope, tenant_id, branch_id, status from torre.saas_release_targets
  `;
  const releases: (ReleaseRow & {
    checksum: string | null;
    minimumSupportedVersion: string | null;
    mandatory: boolean;
    downloadUrl: string | null;
    changelog: string;
  })[] = rows.map((row) => ({
    id: row.id,
    version: row.version,
    status: row.status,
    publishedAt: row.published_at,
    checksum: row.checksum,
    minimumSupportedVersion: row.minimum_supported_version,
    mandatory: row.mandatory,
    downloadUrl: row.download_url,
    changelog: row.changelog,
    targets: targets
      .filter((target) => target.version_id === row.id)
      .map((target) => ({
        scope: target.scope,
        tenantId: target.tenant_id,
        branchId: target.branch_id,
        status: target.status,
      })),
  }));
  const chosen = elegirManifest(releases, audience);
  if (!chosen) {
    return {
      latestVersion: null,
      minimumSupportedVersion: null,
      downloadUrl: null,
      checksum: null,
      mandatory: false,
      releaseNotes: "",
      publishedAt: null,
      updateAvailable: false,
      publication: "torre" as const,
      infrastructureConfirmed: false as const,
    };
  }
  const mandatory = chosen.mandatory || (chosen.minimumSupportedVersion ? hayActualizacion(audience.current, chosen.minimumSupportedVersion) && cmpVer(audience.current || "0", chosen.minimumSupportedVersion) < 0 : false);
  return {
    latestVersion: chosen.version,
    minimumSupportedVersion: chosen.minimumSupportedVersion,
    downloadUrl: chosen.downloadUrl,
    checksum: chosen.checksum,
    mandatory,
    releaseNotes: chosen.changelog,
    publishedAt: chosen.publishedAt,
    updateAvailable: hayActualizacion(audience.current, chosen.version),
    publication: "torre" as const,
    infrastructureConfirmed: false as const,
  };
}