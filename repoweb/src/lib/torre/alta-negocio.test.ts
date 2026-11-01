import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { guardarNegocio, sincronizarPlan } from "./alta-negocio.ts";
import {
  exigirAccesoPuesto,
  exigirCupoUsuario,
  limitesPlan,
  tienePremium,
} from "./acceso-puesto.ts";
import type { Sql } from "../db.ts";

const pg = new PGlite();
function sqlFor(db: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}): Sql {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) =>
    db
      .query(
        strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""),
        values,
      )
      .then((r) => r.rows);
  sql.query = (text: string, params: unknown[] = []) => db.query(text, params).then((r) => r.rows);
  return sql as Sql;
}
const sql = sqlFor(pg);
before(async () => {
  for (const file of (await readdir(new URL("../../../migrations/", import.meta.url)))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
});
after(() => pg.close());
const input = (suffix: string, planId = "plan_base") => ({
  appId: "app_mostrador",
  clientId: "",
  clientName: "Cliente " + suffix,
  name: "Negocio " + suffix,
  slug: "qa-" + suffix,
  status: "active",
  planId,
  installedVersion: "",
  operationalTenantRef: "",
  ownerEmail: `qa-${suffix}@example.test`,
  ownerPassword: "not-a-real-password",
  direccion: "Mercado central 123",
});
async function create(suffix: string, planId = "plan_base") {
  return pg.transaction((tx) =>
    guardarNegocio(sqlFor(tx), input(suffix, planId), "qa@example.test", "hash-local-de-prueba"),
  );
}
async function editInput(id: string, planId: string) {
  const row = (
    await sql<{
      client_id: string;
      operational_tenant_ref: string;
      name: string;
      slug: string;
    }>`select client_id,operational_tenant_ref,name,slug from torre.saas_tenants where id=${id}`
  )[0];
  return {
    ...input("edit", planId),
    id,
    clientId: row.client_id,
    operationalTenantRef: row.operational_tenant_ref,
    name: row.name,
    slug: row.slug,
  };
}

test("alta completa vincula dueño, matriz, cliente y abono sin crear otro negocio al entrar", async () => {
  const result = await create("complete");
  const rows = await sql<{
    rol: string;
    emailVerified: boolean;
    quantity: number;
    product_id: string;
    operational_tenant_ref: string;
  }>`
    select s.rol,u."emailVerified",l.quantity,l.product_id,t.operational_tenant_ref from torre.saas_tenants t
    join staff s on s.tenant_id=t.operational_tenant_ref join "user" u on u.id=s.user_id
    join account a on a."userId"=u.id join sucursales b on b.id=s.sucursal_actual_id and b.tenant_id=s.tenant_id
    join torre.saas_branches tb on tb.id=b.torre_branch_id and tb.tenant_id=t.id
    join torre.saas_subscriptions sub on sub.tenant_id=t.id join torre.saas_subscription_lines l on l.subscription_id=sub.id
    where t.id=${result.id} and l.charge='recurring'`;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rol, "admin");
  assert.equal(rows[0].emailVerified, true);
  assert.equal(rows[0].product_id, "prod_base");
  await exigirAccesoPuesto(sql, rows[0].operational_tenant_ref);
});

test("fallo tardío revierte cliente, negocio, cuenta y dueño", async () => {
  const before = (await sql<{ n: number }>`select count(*)::int as n from torre.saas_clients`)[0].n;
  await assert.rejects(
    pg.transaction(async (tx) => {
      const real = sqlFor(tx);
      const failing = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        if (strings.join("").includes("insert into torre.saas_subscription_lines"))
          throw new Error("fallo tardío de prueba");
        return real(strings, ...values);
      }) as Sql;
      failing.query = real.query;
      return guardarNegocio(failing, input("rollback"), "qa@example.test", "hash-local");
    }),
    /fallo tardío/,
  );
  assert.equal(
    (await sql<{ n: number }>`select count(*)::int as n from torre.saas_clients`)[0].n,
    before,
  );
  assert.equal((await sql`select id from "user" where email='qa-rollback@example.test'`).length, 0);
  assert.equal((await sql`select id from tenants where nombre='Negocio rollback'`).length, 0);
});

test("guardar dos veces conserva un único abono y su precio contratado", async () => {
  const result = await create("snapshot");
  const data = await editInput(result.id, "plan_base");
  const old = (
    await sql<{
      unit_price: string;
    }>`select l.unit_price from torre.saas_subscription_lines l join torre.saas_subscriptions s on s.id=l.subscription_id where s.tenant_id=${result.id}`
  )[0].unit_price;
  await sql`update torre.saas_products set recurring_usd=999 where id='prod_base'`;
  await pg.transaction((tx) => guardarNegocio(sqlFor(tx), data, "qa@example.test"));
  const lines = await sql<{
    unit_price: string;
  }>`select l.unit_price from torre.saas_subscription_lines l join torre.saas_subscriptions s on s.id=l.subscription_id where s.tenant_id=${result.id} and l.status='active'`;
  assert.equal(lines.length, 1);
  assert.equal(Number(lines[0].unit_price), Number(old));
  await sql`update torre.saas_products set recurring_usd=62 where id='prod_base'`;
});

test("cambiar plan termina el anterior, conserva extras y no vuelve a cobrar instalación", async () => {
  const result = await create("upgrade", "plan_pro");
  const sub = (
    await sql<{ id: string }>`select id from torre.saas_subscriptions where tenant_id=${result.id}`
  )[0].id;
  await sql`insert into torre.saas_subscription_lines(id,subscription_id,product_id,quantity,unit_price,currency,frequency,charge,subtotal,starts_on,status,notes) values('qa-extra',${sub},'prod_usuario',1,9,'USD','monthly','recurring',9,current_date,'active','Extra manual')`;
  const upgrade = await editInput(result.id, "plan_premium");
  await pg.transaction((tx) => guardarNegocio(sqlFor(tx), upgrade, "qa@example.test"));
  const lines = await sql<{
    product_id: string;
    charge: string;
    status: string;
  }>`select product_id,charge,status from torre.saas_subscription_lines where subscription_id=${sub}`;
  assert.ok(
    lines.some(
      (l) => l.product_id === "prod_pro" && l.charge === "recurring" && l.status === "ended",
    ),
  );
  assert.ok(
    lines.some(
      (l) => l.product_id === "prod_premium" && l.charge === "recurring" && l.status === "active",
    ),
  );
  assert.ok(lines.some((l) => l.product_id === "prod_usuario" && l.status === "active"));
  assert.equal(lines.filter((l) => l.charge === "setup").length, 1);
  const downgrade = await editInput(result.id, "plan_base");
  await pg.transaction((tx) => guardarNegocio(sqlFor(tx), downgrade, "qa@example.test"));
  const premium =
    await sql`select l.id from torre.saas_subscription_lines l join torre.saas_products p on p.id=l.product_id where l.subscription_id=${sub} and l.status='active' and coalesce(p.config,'{}'::jsonb)->>'plan'='premium'`;
  assert.equal(premium.length, 0);
});

test("suspensión, desactivación y vencimiento se controlan en servidor", async () => {
  const result = await create("access");
  const data = await editInput(result.id, "plan_base");
  const casa = data.operationalTenantRef;
  await sql`update torre.saas_subscriptions set status='suspended' where tenant_id=${result.id}`;
  await assert.rejects(exigirAccesoPuesto(sql, casa), /no están habilitados/);
  await sql`update torre.saas_subscriptions set status='active' where tenant_id=${result.id}`;
  await exigirAccesoPuesto(sql, casa);
  await sql`update torre.saas_tenants set status='inactive' where id=${result.id}`;
  await assert.rejects(exigirAccesoPuesto(sql, casa), /no están habilitados/);
  await sql`update torre.saas_tenants set status='active' where id=${result.id}`;
  await sql`update torre.saas_subscription_lines set ends_on=current_date-1 where subscription_id in(select id from torre.saas_subscriptions where tenant_id=${result.id})`;
  await assert.rejects(exigirAccesoPuesto(sql, casa), /no están habilitados/);
});

test("cupos del plan impiden crear o reactivar usuarios adicionales", async () => {
  const result = await create("limits");
  const data = await editInput(result.id, "plan_base");
  await sql`update torre.saas_plans set limits='{"users":1,"branches":2}'::jsonb where id='plan_base'`;
  assert.deepEqual(await limitesPlan(sql, data.operationalTenantRef), { users: 1, branches: 2 });
  await assert.rejects(
    pg.transaction((tx) => exigirCupoUsuario(sqlFor(tx), data.operationalTenantRef)),
    /hasta 1/,
  );
  const owner = (
    await sql<{ id: string }>`select id from staff where tenant_id=${data.operationalTenantRef}`
  )[0].id;
  await pg.transaction((tx) => exigirCupoUsuario(sqlFor(tx), data.operationalTenantRef, owner));
  await sql`update torre.saas_plans set limits='{}'::jsonb where id='plan_base'`;
});

test("mail duplicado, plan inválido y cambio de aplicación no dejan altas parciales", async () => {
  const result = await create("duplicate");
  await assert.rejects(create("duplicate"), /ya tiene cuenta/);
  await assert.rejects(create("invalid", "missing-plan"), /plan activo/);
  const wrongApp = { ...(await editInput(result.id, "plan_base")), appId: "app_mercado" };
  await assert.rejects(
    pg.transaction((tx) => guardarNegocio(sqlFor(tx), wrongApp, "qa@example.test")),
    /no corresponde|no se puede|No se puede/,
  );
  await assert.rejects(
    pg.transaction(async (tx) =>
      sincronizarPlan(
        sqlFor(tx),
        result.id,
        "plan_inexistente",
        "app_mostrador",
        result.clientId,
        "qa@example.test",
      ),
    ),
    /plan activo/,
  );
});

test("una instalación histórica no mantiene Premium después de bajar de plan", async () => {
  const result = await create("downgrade-with-setup");
  const premium = await editInput(result.id, "plan_premium");
  await pg.transaction((tx) => guardarNegocio(sqlFor(tx), premium, "qa@example.test"));
  assert.equal(await tienePremium(sql, premium.operationalTenantRef), true);
  const basic = await editInput(result.id, "plan_base");
  await pg.transaction((tx) => guardarNegocio(sqlFor(tx), basic, "qa@example.test"));
  assert.equal(await tienePremium(sql, basic.operationalTenantRef), false);
  const setup =
    await sql`select l.id from torre.saas_subscription_lines l join torre.saas_subscriptions s on s.id=l.subscription_id where s.tenant_id=${result.id} and l.product_id='prod_premium' and l.charge='setup'`;
  assert.equal(setup.length, 1);
});
