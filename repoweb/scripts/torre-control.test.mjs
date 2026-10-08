import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../migrations/0011_torre_control.sql", import.meta.url), "utf8");
const base = await readFile(new URL("../migrations/0008_torre.sql", import.meta.url), "utf8");
const control = await readFile(new URL("../src/lib/torre/control-fn.ts", import.meta.url), "utf8");

test("0011 no crea FK hacia tablas operativas", () => {
  assert.doesNotMatch(migration, /references\s+(public\.)?(tenants|productos|clientes|pedidos|cobros|staff)\b/i);
  assert.doesNotMatch(migration, /\bfrom\s+(public\.)?(pedidos|productos|clientes|cobros)\b/i);
  assert.match(migration, /torre\.saas_products/);
  assert.match(migration, /torre\.saas_branches/);
  assert.match(migration, /torre\.saas_subscription_lines/);
  assert.match(migration, /1540/);
});

test("las funciones nuevas de Torre pasan por torreGuard", () => {
  const fns = [...control.matchAll(/export const (\w+) = createServerFn/g)].map((m) => m[1]);
  assert.ok(fns.length >= 10);
  const guarded = [...control.matchAll(/\.middleware\(\[torreGuard\]\)/g)].length;
  assert.equal(guarded, fns.length);
  assert.doesNotMatch(control, /\bfrom\s+(public\.)?(pedidos|productos|clientes|cobros)\b/);
});

test("el catálogo inicial y el flujo comercial viven en Postgres", async () => {
  const db = new PGlite();
  await db.exec(base);
  await db.exec(migration);
  const products = await db.query("select slug, recurring_usd, once_usd from torre.saas_products order by slug");
  const slugs = products.rows.map((row) => row.slug);
  assert.ok(slugs.includes("mostrador-base"));
  assert.ok(slugs.includes("sucursal-extra"));
  assert.ok(slugs.includes("mercado-presencia"));
  assert.ok(slugs.includes("mercado-pro"));
  const fx = await db.query("select usd_ars from torre.saas_fx_rates where id = 'fx_bna_20261007'");
  assert.equal(Number(fx.rows[0].usd_ars), 1540);

  await db.query(
    `insert into torre.saas_tenants (id, app_id, client_id, name, slug, status, plan_id)
     values ('ten_flow', 'app_mostrador', 'cli_roman', 'Flujo', 'flujo', 'active', 'plan_base')`,
  );
  await db.query(
    `insert into torre.saas_subscriptions (id, client_id, tenant_id, plan_id, monthly_price, status, start_date)
     values ('sub_flow', 'cli_roman', 'ten_flow', 'plan_base', 0, 'active', '2026-10-07')`,
  );
  await db.query(
    `insert into torre.saas_subscription_lines
      (id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal, starts_on, status)
     values
      ('l1', 'sub_flow', 'prod_base', 1, 100, 'USD', 'monthly', 'recurring', 100, '2026-10-07', 'active'),
      ('l2', 'sub_flow', 'prod_sucursal', 1, 25, 'USD', 'monthly', 'recurring', 25, '2026-10-07', 'active'),
      ('l3', 'sub_flow', 'prod_presencia', 1, 32, 'USD', 'monthly', 'recurring', 32, '2026-10-07', 'active')`,
  );
  const total = await db.query(
    `select sum(subtotal) as total from torre.saas_subscription_lines
     where subscription_id = 'sub_flow' and status = 'active' and frequency = 'monthly'`,
  );
  assert.equal(Number(total.rows[0].total), 157);
  await db.query("update torre.saas_products set recurring_usd = 999 where id = 'prod_base'");
  const congelado = await db.query("select unit_price from torre.saas_subscription_lines where id = 'l1'");
  assert.equal(Number(congelado.rows[0].unit_price), 100);

  await db.query(
    `insert into torre.saas_versions
      (id, app_id, version, platform, release_date, changelog, download_url, status, checksum, minimum_supported_version, mandatory, published_at)
     values ('ver_flow', 'app_mostrador', '2.0.0', 'windows', '2026-10-07', 'Notas', 'https://example.test/app.exe', 'published', 'abc', '1.0.0', false, now())`,
  );
  await db.query(
    `insert into torre.saas_release_targets (id, version_id, scope, status)
     values ('rt_flow', 'ver_flow', 'all', 'approved')`,
  );
  const manifest = await db.query(
    `select v.version, v.checksum, v.download_url
     from torre.saas_versions v
     join torre.saas_apps a on a.id = v.app_id
     join torre.saas_release_targets t on t.version_id = v.id
     where a.slug = 'mostrador' and v.platform = 'windows' and v.status = 'published' and t.scope = 'all'`,
  );
  assert.equal(manifest.rows[0].version, "2.0.0");
  assert.equal(manifest.rows[0].checksum, "abc");
  await db.close();
});
