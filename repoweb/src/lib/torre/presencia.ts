import { getSql } from "@/lib/db";
import { TENANT_ID } from "@/lib/catalog";
import { num } from "@/lib/money";
import {
  apareceEnMercado,
  permiteCuentaCorriente,
  resolverComision,
  tierContratado,
  type LineaMercado,
} from "@/lib/torre/condiciones";
import { cupoMercadoFromLines } from "@/lib/torre/reglas";
import { armarBanner, leerBanners, type PlantillaId } from "@/lib/mercado/plantillas";

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

export function invalidarLineas() {
  lineasCache = null;
}

let lineasCache: { at: number; mapa: Map<string, LineaMercado[]> } | null = null;

export async function lineasPorPuesto() {
  if (lineasCache && Date.now() - lineasCache.at < 20_000) return lineasCache.mapa;
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
  lineasCache = { at: Date.now(), mapa };
  return mapa;
}

export async function sincronizarPresenciaPublicada() {
  const sql = await getSql();
  const faltan = await sql<{ tenant_id: string; subscription_id: string }>`
    select t.id as tenant_id, s.id as subscription_id
    from tenants t
    join torre.saas_tenants st on st.operational_tenant_ref = t.id and st.status = 'active'
    join torre.saas_subscriptions s on s.tenant_id = st.id and s.status = 'active'
    where coalesce(t.config, '{}'::jsonb)->>'mercadoAlToque' = 'true'
      and not exists (
        select 1
        from torre.saas_subscription_lines l
        join torre.saas_products p on p.id = l.product_id
        where l.subscription_id = s.id
          and l.status = 'active'
          and coalesce(p.config, '{}'::jsonb)->>'family' = 'mercado'
          and coalesce(p.config, '{}'::jsonb)->>'tier' in ('presencia', 'pro')
      )
  `;
  if (faltan.length === 0) return;
  const precio = await sql<{ recurring_usd: unknown }>`
    select recurring_usd from torre.saas_products where id = 'prod_presencia' limit 1
  `;
  const unit = num(precio[0]?.recurring_usd);
  if (!(unit > 0)) return;
  const hoy = new Date().toISOString().slice(0, 10);
  for (const row of faltan) {
    await sql`
      insert into torre.saas_subscription_lines (
        id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal, starts_on, status, notes
      ) values (
        ${`lin_presencia_${row.tenant_id}`}, ${row.subscription_id}, ${"prod_presencia"}, ${1}, ${unit}, ${"USD"},
        ${"monthly"}, ${"recurring"}, ${unit}, ${hoy}::date, ${"active"}, ${"Presencia mínima"}
      )
      on conflict (id) do update
        set status = 'active', subscription_id = excluded.subscription_id, unit_price = excluded.unit_price, subtotal = excluded.subtotal
    `;
  }
  invalidarLineas();
}

/** El puesto de prueba tiene que poder habilitar cuenta corriente. Pro la incluye; Presencia no. */
async function asegurarProDePrueba(operationalTenantId: string) {
  if (operationalTenantId !== TENANT_ID) return;
  const sql = await getSql();
  const tenants = await sql<{ subscription_id: string }>`
    select s.id as subscription_id
    from torre.saas_tenants t
    join torre.saas_subscriptions s on s.tenant_id = t.id and s.status = 'active'
    where t.operational_tenant_ref = ${operationalTenantId} and t.status = 'active'
    limit 1
  `;
  const subscriptionId = tenants[0]?.subscription_id;
  if (!subscriptionId) return;
  const ya = await sql<{ id: string }>`
    select l.id
    from torre.saas_subscription_lines l
    join torre.saas_products p on p.id = l.product_id
    where l.subscription_id = ${subscriptionId}
      and l.status = 'active'
      and coalesce(p.config, '{}'::jsonb)->>'tier' = 'pro'
    limit 1
  `;
  if (ya[0]) return;
  const precio = await sql<{ recurring_usd: unknown }>`
    select recurring_usd from torre.saas_products where id = 'prod_pro' limit 1
  `;
  const unit = num(precio[0]?.recurring_usd);
  if (!(unit > 0)) return;
  const hoy = new Date().toISOString().slice(0, 10);
  await sql`
    update torre.saas_subscription_lines l
    set status = 'ended', updated_at = now()
    from torre.saas_products p
    where l.product_id = p.id
      and l.subscription_id = ${subscriptionId}
      and l.status = 'active'
      and coalesce(p.config, '{}'::jsonb)->>'tier' = 'presencia'
  `;
  await sql`
    insert into torre.saas_subscription_lines (
      id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal, starts_on, status, notes
    ) values (
      ${`lin_pro_${operationalTenantId}`}, ${subscriptionId}, ${"prod_pro"}, ${1}, ${unit}, ${"USD"},
      ${"monthly"}, ${"recurring"}, ${unit}, ${hoy}::date, ${"active"}, ${"Pro de prueba"}
    )
    on conflict (id) do update
      set status = 'active', subscription_id = excluded.subscription_id, unit_price = excluded.unit_price, subtotal = excluded.subtotal
  `;
  invalidarLineas();
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

export async function bannersPublicados() {
  const avisos = await avisosDe();
  if (avisos.length === 0) return [];
  const sql = await getSql();
  const tenants = [...new Set(avisos.map((aviso) => aviso.tenantId))];
  const configs = await sql<{ id: string; config: unknown }>`
    select id, config from tenants where id = any(${tenants}::text[])
  `;
  const porTenant = new Map(configs.map((row) => [row.id, leerBanners(row.config)]));
  const elegidos = avisos.flatMap((aviso) => {
    const banner = porTenant.get(aviso.tenantId)?.find((item) => item.adId === aviso.id);
    return banner ? [{ aviso, banner }] : [];
  });
  const productos = [...new Set(elegidos.flatMap((item) => (item.banner.productoId ? [item.banner.productoId] : [])))];
  const fichas = productos.length
    ? await sql<{ id: string; nombre: string; unidad_label: string; precio: unknown }>`
        select id, nombre, unidad_label, precio
        from productos
        where id = any(${productos}::text[]) and activo = true and publicado_online = true
      `
    : [];
  const porProducto = new Map(fichas.map((row) => [row.id, row]));
  return elegidos.flatMap(({ aviso, banner }) => {
    const producto = banner.productoId ? porProducto.get(banner.productoId) : undefined;
    const texto = armarBanner({
      plantilla: banner.plantilla,
      puesto: aviso.tenantNombre,
      producto: producto ? { nombre: producto.nombre, unidadLabel: producto.unidad_label } : null,
      frase: banner.frase,
    });
    if (!texto) return [];
    return [{
      id: aviso.id,
      tenantNombre: aviso.tenantNombre,
      plantilla: banner.plantilla as PlantillaId,
      titulo: texto.titulo,
      detalle: texto.detalle,
      precio: banner.plantilla === "precio" && producto ? num(producto.precio) : null,
      unidadLabel: producto?.unidad_label ?? null,
      endsOn: aviso.endsOn,
    }];
  });
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
  if (operationalTenantId) await asegurarProDePrueba(operationalTenantId);
  const tier = operationalTenantId ? await tierDePuesto(operationalTenantId) : null;
  const [comision, packs, avisos] = operationalTenantId
    ? await Promise.all([comisionDePuesto(operationalTenantId), packsDe(operationalTenantId), avisosDe(operationalTenantId)])
    : [resolverComision({ overrideVigente: false, overridePercent: null, policyMin: null, policyMax: null }), [], []];
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

function configRecord(value: unknown): Record<string, unknown> {
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

/** Cuántos puestos de esa casa pueden publicar en Mercado. */
export async function cupoMercado(tenantId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ config: unknown; line_status: string }>`
    select p.config, l.status as line_status
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_products p on p.id = l.product_id
    where s.tenant_id = ${tenantId}
      and l.status = 'active'
  `;
  return cupoMercadoFromLines(
    rows.map((row) => {
      const config = configRecord(row.config);
      return {
        family: typeof config.family === "string" ? config.family : null,
        lineStatus: row.line_status,
        includedBranches: Number(config.includedBranches ?? 1),
      };
    }),
  );
}

export type LocalidadPublicada = {
  id: string;
  name: string;
  slug: string;
};

/** Qué sucursales de esa casa se ven en Mercado, hasta el cupo contratado. */
export async function localidadesPublicadas(tenantId: string): Promise<LocalidadPublicada[]> {
  const cupo = await cupoMercado(tenantId);
  if (cupo <= 0) return [];
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string; slug: string }>`
    select id, name, slug
    from torre.saas_branches
    where tenant_id = ${tenantId}
      and status = 'active'
      and coalesce(metadata->>'canalMercado', 'false') = 'true'
    order by opened_on, created_at, id
    limit ${cupo}
  `;
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}

export type CasaDeLibros = {
  id: string;
  name: string;
  slug: string;
  operationalTenantRef: string;
};

/** Dado el tenant operativo de una sucursal (libros_tenant_id), devuelve la casa (negocio en Torre). */
export async function casaDeLibros(librosTenantId: string): Promise<CasaDeLibros | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string; slug: string; operational_tenant_ref: string }>`
    select st.id, st.name, st.slug, st.operational_tenant_ref
    from sucursales s
    join torre.saas_tenants st on st.operational_tenant_ref = s.tenant_id
    where s.libros_tenant_id = ${librosTenantId}
      and st.status = 'active'
    limit 1
  `;
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    name: rows[0].name,
    slug: rows[0].slug,
    operationalTenantRef: rows[0].operational_tenant_ref,
  };
}
