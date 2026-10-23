import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { money, num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { leerKpisSuperAlToque } from "@/lib/torre/super-al-toque-fn";

const CLAVES = [
  "negocios",
  "clientes",
  "planes",
  "precios",
  "servicios",
  "suscripciones",
  "sucursales",
  "promociones",
  "publicidad",
  "finanzas",
  "operacion",
  "super-al-toque",
  "puesto",
  "legal",
  "procesadores",
  "apps",
  "versiones",
  "deployments",
  "auditoria",
  "configuracion",
] as const;

type Clave = (typeof CLAVES)[number];
type Punto = { dia: string; valor: number };
type Barra = { nombre: string; valor: number };
type Fila = { titulo: string; detalle: string };

export type PanelTorre = {
  titulo: string;
  detalle: string;
  serieLabel: string;
  kpis: { label: string; value: string }[];
  serie: Punto[];
  barrasLabel: string;
  barras: Barra[];
  filasLabel: string;
  filas: Fila[];
};

function entero(value: unknown) {
  return String(Math.round(num(value)));
}

function plata(currency: string, value: unknown) {
  const amount = num(value);
  return currency === "USD" ? `USD ${Math.round(amount)}` : money(amount);
}

const FRAGMENTO = /^[a-z0-9_.*()\s,:=<>'"+-]+$/i;

function fragmento(valor: string) {
  if (!FRAGMENTO.test(valor) || valor.includes("--") || valor.includes(";") || valor.includes("/*") || valor.includes("*/")) {
    throw new Error("Consulta rechazada.");
  }
  return valor;
}

async function puntos(sql: Sql, join: string, valor = "count(x.id)::int"): Promise<Punto[]> {
  const serie = fragmento(valor);
  const union = fragmento(join);
  const rows = await sql.query<{ dia: string; valor: unknown }>(
    `select to_char(d::date, 'YYYY-MM-DD') as dia, ${serie} as valor
     from generate_series(current_date - 29, current_date, interval '1 day') as d
     left join ${union}
     group by d::date
     order by d::date`,
  );
  return rows.map((row) => ({ dia: String(row.dia).slice(0, 10), valor: num(row.valor) }));
}

async function armar(sql: Sql, clave: Clave): Promise<PanelTorre> {
  if (clave === "negocios") {
    const [tot] = await sql.query<{ activos: unknown; inactivos: unknown; sin_vinculo: unknown; otra_version: unknown }>(
      `select count(*) filter (where t.status = 'active') as activos,
              count(*) filter (where t.status <> 'active') as inactivos,
              count(*) filter (where t.operational_tenant_ref is null) as sin_vinculo,
              count(*) filter (where a.current_version is not null and t.installed_version is distinct from a.current_version) as otra_version
       from torre.saas_tenants t
       join torre.saas_apps a on a.id = t.app_id`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select a.name as nombre, count(t.id)::int as valor
       from torre.saas_apps a
       left join torre.saas_tenants t on t.app_id = a.id and t.status = 'active'
       group by a.name
       order by count(t.id) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select t.name as titulo,
              case when t.operational_tenant_ref is null then 'Sin puesto vinculado' else 'Versión distinta a la publicada' end as detalle
       from torre.saas_tenants t
       join torre.saas_apps a on a.id = t.app_id
       where t.operational_tenant_ref is null
          or (a.current_version is not null and t.installed_version is distinct from a.current_version)
       order by t.operational_tenant_ref nulls first
       limit 6`,
    );
    return {
      titulo: "Negocios",
      detalle: "Altas de los últimos 30 días",
      serieLabel: "Negocios creados",
      kpis: [
        { label: "Activos", value: entero(tot?.activos) },
        { label: "Inactivos", value: entero(tot?.inactivos) },
        { label: "Sin vínculo", value: entero(tot?.sin_vinculo) },
        { label: "Otra versión", value: entero(tot?.otra_version) },
      ],
      serie: await puntos(sql, "torre.saas_tenants x on x.created_at::date = d::date"),
      barrasLabel: "Activos por aplicación",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Para revisar",
      filas,
    };
  }

  if (clave === "clientes") {
    const [tot] = await sql.query<{ activos: unknown; otros: unknown; sin_negocio: unknown; con_deuda: unknown }>(
      `select count(*) filter (where c.status = 'active') as activos,
              count(*) filter (where c.status <> 'active') as otros,
              count(*) filter (where not exists (select 1 from torre.saas_tenants t where t.client_id = c.id)) as sin_negocio,
              count(distinct c.id) filter (where exists (
                select 1 from torre.saas_payments p where p.client_id = c.id and p.status = 'pending'
              )) as con_deuda
       from torre.saas_clients c`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select c.name as nombre, coalesce(sum(l.subtotal) filter (where l.currency = 'USD' and l.status = 'active' and l.frequency = 'monthly' and l.charge = 'recurring'), 0) as valor
       from torre.saas_clients c
       left join torre.saas_subscriptions s on s.client_id = c.id
       left join torre.saas_subscription_lines l on l.subscription_id = s.id
       group by c.id, c.name
       order by valor desc
       limit 6`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select c.name as titulo, 'Tiene un cobro pendiente' as detalle
       from torre.saas_clients c
       where exists (select 1 from torre.saas_payments p where p.client_id = c.id and p.status = 'pending')
       order by c.name
       limit 6`,
    );
    return {
      titulo: "Clientes",
      detalle: "Altas de los últimos 30 días",
      serieLabel: "Clientes creados",
      kpis: [
        { label: "Activos", value: entero(tot?.activos) },
        { label: "Pausados o archivo", value: entero(tot?.otros) },
        { label: "Sin negocio", value: entero(tot?.sin_negocio) },
        { label: "Con deuda", value: entero(tot?.con_deuda) },
      ],
      serie: await puntos(sql, "torre.saas_clients x on x.created_at::date = d::date"),
      barrasLabel: "Abono mensual en dólares",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Cobros abiertos",
      filas,
    };
  }

  if (clave === "planes") {
    const [tot] = await sql.query<{ activos: unknown; archivo: unknown; suscripciones: unknown; sin_plan: unknown }>(
      `select (select count(*) from torre.saas_plans where status = 'active') as activos,
              (select count(*) from torre.saas_plans where status <> 'active') as archivo,
              (select count(*) from torre.saas_subscriptions where status = 'active') as suscripciones,
              (select count(*) from torre.saas_tenants where plan_id is null) as sin_plan`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select p.name as nombre, count(t.id)::int as valor
       from torre.saas_plans p
       left join torre.saas_tenants t on t.plan_id = p.id
       group by p.id, p.name
       order by count(t.id) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select name as titulo, 'USD ' || round(monthly_price) || ' / mes de encabezado' as detalle
       from torre.saas_plans
       where status = 'active'
       order by monthly_price desc
       limit 6`,
    );
    return {
      titulo: "Planes",
      detalle: "Suscripciones iniciadas en 30 días",
      serieLabel: "Suscripciones nuevas",
      kpis: [
        { label: "Planes activos", value: entero(tot?.activos) },
        { label: "Archivados", value: entero(tot?.archivo) },
        { label: "Suscripciones", value: entero(tot?.suscripciones) },
        { label: "Negocios sin plan", value: entero(tot?.sin_plan) },
      ],
      serie: await puntos(sql, "torre.saas_subscriptions x on x.start_date = d::date"),
      barrasLabel: "Negocios por plan",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Precio de encabezado",
      filas,
    };
  }

  if (clave === "precios") {
    const [tot] = await sql.query<{ activos: unknown; archivo: unknown; en_uso: unknown; ajustes: unknown }>(
      `select count(*) filter (where status = 'active') as activos,
              count(*) filter (where status <> 'active') as archivo,
              count(*) filter (where exists (
                select 1 from torre.saas_subscription_lines l
                where l.product_id = torre.saas_products.id and l.status = 'active'
              )) as en_uso,
              (select count(*) from torre.saas_price_adjustments where status = 'active') as ajustes
       from torre.saas_products`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select pr.name as nombre, count(l.id)::int as valor
       from torre.saas_products pr
       left join torre.saas_subscription_lines l on l.product_id = pr.id and l.status = 'active'
       group by pr.id, pr.name
       order by count(l.id) desc
       limit 8`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select pr.name as titulo,
              'USD ' || round(coalesce(pr.recurring_usd, 0)) || ' / mes · ' || count(l.id) || ' en uso' as detalle
       from torre.saas_products pr
       left join torre.saas_subscription_lines l on l.product_id = pr.id and l.status = 'active'
       where pr.status = 'active'
       group by pr.id, pr.name, pr.recurring_usd
       order by count(l.id) desc, pr.recurring_usd desc
       limit 6`,
    );
    const ajustes = await sql.query<{ kind: string; n: unknown }>(
      `select kind, count(*)::int as n from torre.saas_price_adjustments where status = 'active' group by kind`,
    );
    return {
      titulo: "Add-ons y precios",
      detalle: "Líneas contratadas en 30 días",
      serieLabel: "Contrataciones",
      kpis: [
        { label: "Productos activos", value: entero(tot?.activos) },
        { label: "Archivados", value: entero(tot?.archivo) },
        { label: "Con uso", value: entero(tot?.en_uso) },
        { label: "Ajustes vigentes", value: entero(tot?.ajustes) },
      ],
      serie: await puntos(sql, "torre.saas_subscription_lines x on x.created_at::date = d::date"),
      barrasLabel: "Uso por producto",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: ajustes.length
        ? `Ajustes: ${ajustes.map((row) => `${row.kind} ${entero(row.n)}`).join(" · ")}`
        : "Precio de catálogo y uso",
      filas,
    };
  }

  if (clave === "servicios") {
    const [tot] = await sql.query<{ activas: unknown; usd: unknown; ars: unknown; pendientes: unknown }>(
      `select count(*) filter (where l.status = 'active') as activas,
              coalesce(sum(l.subtotal) filter (where l.status = 'active' and l.charge = 'recurring' and l.frequency = 'monthly' and l.currency = 'USD'), 0) as usd,
              coalesce(sum(l.subtotal) filter (where l.status = 'active' and l.charge = 'recurring' and l.frequency = 'monthly' and l.currency = 'ARS'), 0) as ars,
              (select count(*) from torre.saas_payments p where p.status = 'pending' and p.line_id is null) as pendientes
       from torre.saas_subscription_lines l`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select pr.kind as nombre, count(*)::int as valor
       from torre.saas_subscription_lines l
       join torre.saas_products pr on pr.id = l.product_id
       where l.status = 'active'
       group by pr.kind
       order by count(*) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select t.name as titulo, pr.name || ' · ' || p.currency || ' ' || round(p.amount) as detalle
       from torre.saas_payments p
       join torre.saas_tenants t on t.id = p.tenant_id
       join torre.saas_products pr on pr.id = p.product_id
       where p.status = 'pending' and p.line_id is null
       order by p.created_at desc
       limit 6`,
    );
    return {
      titulo: "Servicios",
      detalle: "Líneas dadas de alta en 30 días",
      serieLabel: "Altas de servicio",
      kpis: [
        { label: "Líneas activas", value: entero(tot?.activas) },
        { label: "Abono USD", value: plata("USD", tot?.usd) },
        { label: "Abono ARS", value: plata("ARS", tot?.ars) },
        { label: "Sin habilitar", value: entero(tot?.pendientes) },
      ],
      serie: await puntos(sql, "torre.saas_subscription_lines x on x.created_at::date = d::date"),
      barrasLabel: "Activos por tipo",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Pedidos que todavía no se prendieron",
      filas,
    };
  }

  if (clave === "suscripciones") {
    const estados = await sql.query<{ nombre: string; valor: unknown }>(
      `select status as nombre, count(*)::int as valor from torre.saas_subscriptions group by status order by count(*) desc`,
    );
    const [vencen] = await sql.query<{ n: unknown }>(
      `select count(*)::int as n from torre.saas_subscriptions
       where status = 'active' and next_payment_date is not null and next_payment_date <= current_date + 7`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select t.name as titulo, 'Vence ' || s.next_payment_date::text as detalle
       from torre.saas_subscriptions s
       join torre.saas_tenants t on t.id = s.tenant_id
       where s.status = 'active' and s.next_payment_date is not null and s.next_payment_date <= current_date + 7
       order by s.next_payment_date
       limit 6`,
    );
    const activas = estados.find((row) => row.nombre === "active");
    return {
      titulo: "Suscripciones",
      detalle: "Inicios de los últimos 30 días",
      serieLabel: "Suscripciones iniciadas",
      kpis: [
        { label: "Activas", value: entero(activas?.valor) },
        { label: "Vencen en 7 días", value: entero(vencen?.n) },
        { label: "Pausadas", value: entero(estados.find((row) => row.nombre === "paused")?.valor) },
        { label: "Canceladas", value: entero(estados.find((row) => row.nombre === "cancelled")?.valor) },
      ],
      serie: await puntos(sql, "torre.saas_subscriptions x on x.start_date = d::date"),
      barrasLabel: "Por estado",
      barras: estados.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Próximos vencimientos",
      filas,
    };
  }

  if (clave === "sucursales") {
    const [tot] = await sql.query<{ activas: unknown; inactivas: unknown; incluidas: unknown; extra: unknown }>(
      `select count(*) filter (where status = 'active') as activas,
              count(*) filter (where status <> 'active') as inactivas,
              count(*) filter (where included and status = 'active') as incluidas,
              count(*) filter (where not included and status = 'active') as extra
       from torre.saas_branches`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select t.name as nombre, count(b.id)::int as valor
       from torre.saas_branches b
       join torre.saas_tenants t on t.id = b.tenant_id
       group by t.name
       order by count(b.id) desc
       limit 6`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select b.name as titulo, t.name || case when b.included then ' · incluida' else ' · se cobra aparte' end as detalle
       from torre.saas_branches b
       join torre.saas_tenants t on t.id = b.tenant_id
       order by b.included, b.name
       limit 6`,
    );
    return {
      titulo: "Sucursales",
      detalle: "Aperturas de los últimos 30 días",
      serieLabel: "Sucursales abiertas",
      kpis: [
        { label: "Activas", value: entero(tot?.activas) },
        { label: "Inactivas", value: entero(tot?.inactivas) },
        { label: "Incluidas", value: entero(tot?.incluidas) },
        { label: "Extra", value: entero(tot?.extra) },
      ],
      serie: await puntos(sql, "torre.saas_branches x on x.opened_on = d::date"),
      barrasLabel: "Por negocio",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Cuáles se cobran",
      filas,
    };
  }

  if (clave === "promociones") {
    const [tot] = await sql.query<{ activas: unknown; otorgadas: unknown; ajustes: unknown; vencen: unknown }>(
      `select (select count(*) from torre.saas_promotions where status = 'active') as activas,
              (select count(*) from torre.saas_promotion_grants where status = 'active') as otorgadas,
              (select count(*) from torre.saas_price_adjustments where status = 'active') as ajustes,
              (select count(*) from torre.saas_promotion_grants where status = 'active' and ends_on is not null and ends_on <= current_date + 7) as vencen`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select kind as nombre, count(*)::int as valor
       from torre.saas_price_adjustments
       where status = 'active'
       group by kind
       order by count(*) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select t.name as titulo, g.status || coalesce(' hasta ' || g.ends_on::text, '') as detalle
       from torre.saas_promotion_grants g
       join torre.saas_tenants t on t.id = g.tenant_id
       order by g.starts_on desc
       limit 6`,
    );
    return {
      titulo: "Promociones",
      detalle: "Beneficios otorgados en 30 días",
      serieLabel: "Otorgamientos",
      kpis: [
        { label: "Promos activas", value: entero(tot?.activas) },
        { label: "Otorgadas", value: entero(tot?.otorgadas) },
        { label: "Ajustes vivos", value: entero(tot?.ajustes) },
        { label: "Vencen en 7 días", value: entero(tot?.vencen) },
      ],
      serie: await puntos(sql, "torre.saas_promotion_grants x on x.starts_on = d::date"),
      barrasLabel: "Ajustes vigentes por tipo",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Últimos otorgamientos",
      filas,
    };
  }

  if (clave === "publicidad") {
    const estados = await sql.query<{ nombre: string; valor: unknown }>(
      `select status as nombre, count(*)::int as valor from torre.saas_ads group by status order by count(*) desc`,
    );
    const [cierran] = await sql.query<{ n: unknown }>(
      `select count(*)::int as n from torre.saas_ads where status = 'active' and ends_on <= current_date + 7`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select placement as nombre, count(*)::int as valor
       from torre.saas_ads
       where status in ('active', 'scheduled')
       group by placement
       order by count(*) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select t.name as titulo, a.placement || ' · cierra ' || a.ends_on::text as detalle
       from torre.saas_ads a
       join torre.saas_tenants t on t.id = a.tenant_id
       where a.status = 'active'
       order by a.ends_on
       limit 6`,
    );
    return {
      titulo: "Publicidad",
      detalle: "Piezas que empiezan en 30 días",
      serieLabel: "Avisos iniciados",
      kpis: [
        { label: "Activos", value: entero(estados.find((row) => row.nombre === "active")?.valor) },
        { label: "Programados", value: entero(estados.find((row) => row.nombre === "scheduled")?.valor) },
        { label: "Vencidos", value: entero(estados.find((row) => row.nombre === "expired")?.valor) },
        { label: "Cierran en 7 días", value: entero(cierran?.n) },
      ],
      serie: await puntos(sql, "torre.saas_ads x on x.starts_on = d::date"),
      barrasLabel: "Ubicación de los que están al aire",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Qué está al aire",
      filas,
    };
  }

  if (clave === "finanzas") {
    const [tot] = await sql.query<{ usd: unknown; ars: unknown; pendiente: unknown; gastos: unknown }>(
      `select coalesce(sum(amount) filter (where status = 'paid' and currency = 'USD' and payment_date >= current_date - 29), 0) as usd,
              coalesce(sum(amount) filter (where status = 'paid' and currency = 'ARS' and payment_date >= current_date - 29), 0) as ars,
              coalesce(sum(amount) filter (where status = 'pending'), 0) as pendiente,
              (select coalesce(sum(amount), 0) from torre.saas_expenses where expense_date >= current_date - 29) as gastos
       from torre.saas_payments`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select category as nombre, coalesce(sum(amount), 0) as valor
       from torre.saas_expenses
       where expense_date >= current_date - 29
       group by category
       order by sum(amount) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select concept as titulo, currency || ' ' || round(amount) || ' · ' || status as detalle
       from torre.saas_payments
       where status = 'pending'
       order by payment_date
       limit 6`,
    );
    const cobrado = num(tot?.ars);
    const gastos = num(tot?.gastos);
    return {
      titulo: "Finanzas",
      detalle: "Cobrado en pesos, últimos 30 días. El dólar no se mezcla.",
      serieLabel: "Cobrado en pesos",
      kpis: [
        { label: "Cobrado ARS", value: plata("ARS", cobrado) },
        { label: "Cobrado USD", value: plata("USD", tot?.usd) },
        { label: "Gastos", value: plata("ARS", gastos) },
        { label: "Margen ARS", value: plata("ARS", cobrado - gastos) },
      ],
      serie: await puntos(sql, "torre.saas_payments x on x.payment_date = d::date and x.status = 'paid' and x.currency = 'ARS'", "coalesce(sum(x.amount), 0)"),
      barrasLabel: "Gastos del mes por rubro",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Todavía no cobrados",
      filas,
    };
  }

  if (clave === "operacion") {
    const [tot] = await sql.query<{ mostrador: unknown; mercado: unknown; abiertos: unknown; anulados: unknown }>(
      `select coalesce(sum(c.monto) filter (where c.anulado = false and p.origen is distinct from 'mercado_al_toque'), 0) as mostrador,
              coalesce(sum(c.monto) filter (where c.anulado = false and p.origen = 'mercado_al_toque'), 0) as mercado,
              (select count(*) from pedidos where estado in ('enviado', 'en_preparacion', 'listo') and created_at::date >= current_date - 29) as abiertos,
              count(*) filter (where c.anulado) as anulados
       from cobros c
       join pedidos p on p.id = c.pedido_id
       where c.created_at::date >= current_date - 29`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select forma_pago as nombre, coalesce(sum(monto) filter (where anulado = false), 0) as valor
       from cobros
       where created_at::date >= current_date - 29
       group by forma_pago
       order by sum(monto) desc nulls last`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select estado as titulo, count(*) || ' pedidos' as detalle
       from pedidos
       where created_at::date >= current_date - 29
       group by estado
       order by count(*) desc`,
    );
    return {
      titulo: "Mostrador y Mercado",
      detalle: "Cobros de los últimos 30 días, en pesos del puesto",
      serieLabel: "Cobros por día",
      kpis: [
        { label: "Mostrador", value: plata("ARS", tot?.mostrador) },
        { label: "Mercado", value: plata("ARS", tot?.mercado) },
        { label: "En curso", value: entero(tot?.abiertos) },
        { label: "Anulados", value: entero(tot?.anulados) },
      ],
      serie: await puntos(sql, "cobros x on x.created_at::date = d::date and x.anulado = false", "coalesce(sum(x.monto), 0)"),
      barrasLabel: "Por medio de pago",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Pedidos por estado",
      filas,
    };
  }

  if (clave === "legal") {
    const [tot] = await sql.query<{ publicados: unknown; borrador: unknown; pendientes: unknown; aceptados: unknown }>(
      `select (select count(*) from torre.saas_legal_documents where status = 'published') as publicados,
              (select count(*) from torre.saas_legal_documents where status = 'draft') as borrador,
              (select count(*) from torre.saas_tenant_contracts where status = 'pending') as pendientes,
              (select count(*) from torre.saas_contract_acceptances where accepted_at::date >= current_date - 29) as aceptados`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select audience as nombre, count(*)::int as valor from torre.saas_legal_documents group by audience order by count(*) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select d.title as titulo, t.name || ' · pendiente' as detalle
       from torre.saas_tenant_contracts c
       join torre.saas_legal_documents d on d.id = c.document_id
       join torre.saas_tenants t on t.id = c.tenant_id
       where c.status = 'pending'
       order by c.offered_at desc
       limit 6`,
    );
    return {
      titulo: "Legal",
      detalle: "Aceptaciones de los últimos 30 días",
      serieLabel: "Aceptaciones",
      kpis: [
        { label: "Publicados", value: entero(tot?.publicados) },
        { label: "En borrador", value: entero(tot?.borrador) },
        { label: "Contratos pendientes", value: entero(tot?.pendientes) },
        { label: "Aceptados en 30 días", value: entero(tot?.aceptados) },
      ],
      serie: await puntos(sql, "torre.saas_contract_acceptances x on x.accepted_at::date = d::date"),
      barrasLabel: "Documentos por audiencia",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Falta la aceptación",
      filas,
    };
  }

  if (clave === "procesadores") {
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select category as nombre, count(*)::int as valor from torre.saas_processors group by category order by count(*) desc`,
    );
    const [tot] = await sql.query<{ activos: unknown; archivo: unknown }>(
      `select count(*) filter (where status = 'active') as activos, count(*) filter (where status <> 'active') as archivo from torre.saas_processors`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select name as titulo, category as detalle from torre.saas_processors where status = 'active' order by name limit 8`,
    );
    return {
      titulo: "Procesadores",
      detalle: "Altas de los últimos 30 días",
      serieLabel: "Procesadores cargados",
      kpis: [
        { label: "Activos", value: entero(tot?.activos) },
        { label: "Archivados", value: entero(tot?.archivo) },
        { label: "Rubros", value: String(barras.length) },
        { label: "En la lista", value: String(filas.length) },
      ],
      serie: await puntos(sql, "torre.saas_processors x on x.created_at::date = d::date"),
      barrasLabel: "Por rubro",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Quién trata datos",
      filas,
    };
  }

  if (clave === "apps") {
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select a.name as nombre, count(t.id)::int as valor
       from torre.saas_apps a
       left join torre.saas_tenants t on t.app_id = a.id and t.status = 'active'
       group by a.id, a.name
       order by count(t.id) desc`,
    );
    const [tot] = await sql.query<{ activas: unknown; pausadas: unknown }>(
      `select count(*) filter (where status = 'active') as activas, count(*) filter (where status <> 'active') as pausadas from torre.saas_apps`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select name as titulo, coalesce(current_version, 'sin versión publicada') as detalle from torre.saas_apps order by name`,
    );
    return {
      titulo: "Aplicaciones",
      detalle: "Versiones publicadas en 30 días",
      serieLabel: "Publicaciones",
      kpis: [
        { label: "Activas", value: entero(tot?.activas) },
        { label: "Pausadas", value: entero(tot?.pausadas) },
        { label: "Negocios", value: String(barras.reduce((acc, row) => acc + num(row.valor), 0)) },
        { label: "En catálogo", value: String(filas.length) },
      ],
      serie: await puntos(sql, "torre.saas_versions x on x.release_date = d::date and x.status = 'published'"),
      barrasLabel: "Negocios activos",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Versión publicada",
      filas,
    };
  }

  if (clave === "versiones") {
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select platform as nombre, count(*)::int as valor from torre.saas_versions group by platform order by count(*) desc`,
    );
    const [tot] = await sql.query<{ publicadas: unknown; borrador: unknown; retiradas: unknown }>(
      `select count(*) filter (where status = 'published') as publicadas,
              count(*) filter (where status = 'draft') as borrador,
              count(*) filter (where status = 'yanked') as retiradas
       from torre.saas_versions`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select a.name || ' ' || v.version as titulo, v.platform || ' · ' || v.status as detalle
       from torre.saas_versions v
       join torre.saas_apps a on a.id = v.app_id
       order by v.release_date desc
       limit 6`,
    );
    return {
      titulo: "Versiones",
      detalle: "Publicaciones de los últimos 30 días",
      serieLabel: "Versiones por día",
      kpis: [
        { label: "Publicadas", value: entero(tot?.publicadas) },
        { label: "Borrador", value: entero(tot?.borrador) },
        { label: "Retiradas", value: entero(tot?.retiradas) },
        { label: "Plataformas", value: String(barras.length) },
      ],
      serie: await puntos(sql, "torre.saas_versions x on x.release_date = d::date"),
      barrasLabel: "Por plataforma",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Últimas",
      filas,
    };
  }

  if (clave === "deployments") {
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select status as nombre, count(*)::int as valor from torre.saas_deployments group by status order by count(*) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select a.name as titulo, d.status || ' · ' || d.platform as detalle
       from torre.saas_deployments d
       join torre.saas_apps a on a.id = d.app_id
       where d.status in ('failed', 'pending', 'rolled_back')
       order by d.deployed_at desc nulls last
       limit 6`,
    );
    return {
      titulo: "Deployments",
      detalle: "Despliegues de los últimos 30 días",
      serieLabel: "Despliegues",
      kpis: [
        { label: "Publicados", value: entero(barras.find((row) => row.nombre === "deployed")?.valor) },
        { label: "Pendientes", value: entero(barras.find((row) => row.nombre === "pending")?.valor) },
        { label: "Fallaron", value: entero(barras.find((row) => row.nombre === "failed")?.valor) },
        { label: "Vueltos atrás", value: entero(barras.find((row) => row.nombre === "rolled_back")?.valor) },
      ],
      serie: await puntos(sql, "torre.saas_deployments x on x.deployed_at::date = d::date"),
      barrasLabel: "Por estado",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Los que no quedaron bien",
      filas,
    };
  }

  if (clave === "auditoria") {
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select action as nombre, count(*)::int as valor
       from torre.saas_audit
       where created_at::date >= current_date - 29
       group by action
       order by count(*) desc
       limit 6`,
    );
    const [tot] = await sql.query<{ eventos: unknown; actores: unknown }>(
      `select count(*) as eventos, count(distinct actor_email) as actores
       from torre.saas_audit
       where created_at::date >= current_date - 29`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select action as titulo, actor_email || ' · ' || entity as detalle
       from torre.saas_audit
       order by created_at desc
       limit 6`,
    );
    return {
      titulo: "Auditoría",
      detalle: "Eventos de los últimos 30 días",
      serieLabel: "Eventos por día",
      kpis: [
        { label: "Eventos", value: entero(tot?.eventos) },
        { label: "Personas", value: entero(tot?.actores) },
        { label: "Acciones distintas", value: String(barras.length) },
        { label: "Último", value: filas[0]?.titulo ?? "—" },
      ],
      serie: await puntos(sql, "torre.saas_audit x on x.created_at::date = d::date"),
      barrasLabel: "Qué se hizo",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Lo más reciente",
      filas,
    };
  }

  if (clave === "super-al-toque") {
    const k = await leerKpisSuperAlToque(30);
    return {
      titulo: "Super al Toque",
      detalle: "KPIs leídos de la API con token de servicio. La Torre no toca la base de esa app.",
      serieLabel: "Pedidos por día",
      kpis: [
        { label: "GMV", value: money(k.sales.gmvCents / 100) },
        { label: "Comisión", value: money(k.sales.commissionCents / 100) },
        { label: "Pedidos", value: String(k.sales.ordersCount) },
        { label: "Sin repartidor", value: String(k.deliveries.unassigned) },
      ],
      serie: [],
      barrasLabel: "Ventas por comercio",
      barras: k.byMerchant.map((m) => ({ nombre: m.name, valor: Math.round(m.salesCents / 100) })),
      filasLabel: "Para mirar",
      filas: [
        { titulo: "Comercios pendientes", detalle: `${k.merchants.pending} esperando aprobación` },
        { titulo: "Flete en juego", detalle: money(k.deliveries.deliveryFeeCents / 100) },
      ],
    };
  }

  if (clave === "puesto") {
    const [tot] = await sql.query<{ total: unknown; con_identidad: unknown; con_costos: unknown; con_reposicion: unknown }>(
      `select count(*)::int as total,
              count(*) filter (where coalesce(config->>'bajada', '') <> '' and coalesce(config->>'direccion', '') <> '') as con_identidad,
              count(*) filter (where exists (select 1 from productos p where p.tenant_id = tenants.id and p.activo = true and p.costo is not null)) as con_costos,
              0 as con_reposicion
       from tenants`,
    );
    const barras = await sql.query<{ nombre: string; valor: unknown }>(
      `select case when coalesce(config->>'bajada', '') = '' then 'Sin identidad' else 'Con identidad' end as nombre,
              count(*)::int as valor
       from tenants
       group by nombre
       order by count(*) desc`,
    );
    const filas = await sql.query<{ titulo: string; detalle: string }>(
      `select nombre as titulo,
              case
                when coalesce(config->>'bajada', '') = '' then 'Falta bajada'
                when coalesce(config->>'direccion', '') = '' then 'Falta dirección'
                else 'Identidad completa'
              end as detalle
       from tenants
       order by nombre
       limit 6`,
    );
    return {
      titulo: "Del puesto",
      detalle: "Fichas por puesto operativo. Lo que el dueño carga y antes Torre no miraba.",
      serieLabel: "Puestos creados",
      kpis: [
        { label: "Total puestos", value: entero(tot?.total) },
        { label: "Con identidad", value: entero(tot?.con_identidad) },
        { label: "Con costos", value: entero(tot?.con_costos) },
        { label: "Con reposición", value: entero(tot?.con_reposicion) },
      ],
      serie: await puntos(sql, "tenants x on x.created_at::date = d::date"),
      barrasLabel: "Identidad cargada",
      barras: barras.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
      filasLabel: "Para completar",
      filas,
    };
  }

  const [fx] = await sql.query<{ usd_ars: unknown; as_of: string; fuente: string }>(
    `select usd_ars, as_of::text as as_of, source as fuente from torre.saas_fx_rates order by as_of desc limit 1`,
  );
  const [medio] = await sql.query<{ alias: string; cbu: string }>(
    `select alias, cbu from torre.saas_medios_pago where id = 'transferencia' limit 1`,
  );
  const roles = await sql.query<{ nombre: string; valor: unknown }>(
    `select role as nombre, count(*)::int as valor from torre.saas_access group by role order by count(*) desc`,
  );
  const cotizaciones = await sql.query<{ dia: string; valor: unknown }>(
    `select as_of::text as dia, usd_ars as valor from torre.saas_fx_rates where as_of >= current_date - 90 order by as_of`,
  );
  return {
    titulo: "Configuración",
    detalle: "Cotización cargada. No es un gráfico decorativo: es el dólar que usa el catálogo.",
    serieLabel: "Dólar oficial vendedor",
    kpis: [
      { label: "Dólar", value: fx ? String(num(fx.usd_ars)) : "Sin cotización" },
      { label: "Fecha", value: fx?.as_of?.slice(0, 10) ?? "—" },
      { label: "Alias", value: medio?.alias?.trim() ? "Cargado" : "Vacío" },
      { label: "CBU", value: medio?.cbu?.trim() ? "Cargado" : "Vacío" },
    ],
    serie: cotizaciones.map((row) => ({ dia: String(row.dia).slice(0, 10), valor: num(row.valor) })),
    barrasLabel: "Accesos por rol",
    barras: roles.map((row) => ({ nombre: row.nombre, valor: num(row.valor) })),
    filasLabel: "Medio de transferencia",
    filas: [
      { titulo: medio?.alias?.trim() || "Sin alias", detalle: medio?.cbu?.trim() || "Sin CBU" },
      { titulo: fx?.fuente ?? "Sin fuente", detalle: fx ? `ARS ${num(fx.usd_ars)} por dólar` : "Cargá una cotización" },
    ],
  };
}

export const panelPantalla = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { clave?: string } | undefined) => {
    const clave = input?.clave ?? "";
    if (!CLAVES.includes(clave as Clave)) throw new Error("Pantalla desconocida.");
    return { clave: clave as Clave };
  })
  .handler(async ({ context, data }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    return armar(sql, data.clave);
  });
