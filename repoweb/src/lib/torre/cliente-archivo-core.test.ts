import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";

// Igual que en `demo-limpieza.test.ts`: `getSql()` se enchufa a PGlite antes de
// cargar el módulo, porque el backend se decide cuando el módulo se evalúa.
process.env.DATABASE_URL = "postgres://prueba-local/no-se-usa";

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

const globalRef = globalThis as {
  __pgSqlPromise__?: Promise<Sql>;
  __pgPool__?: { connect: () => Promise<{ query: unknown; release: () => void }> };
};
globalRef.__pgSqlPromise__ = Promise.resolve(sqlFor(pg));
globalRef.__pgPool__ = {
  connect: async () => ({ query: (t: string, p?: unknown[]) => pg.query(t, p), release: () => {} }),
};

const { archivarClienteCore } = await import("./cliente-archivo-core.ts");

const JEFE = "jefe@example.test";
const COMERCIAL = "comercial@example.test";
const SOPORTE = "soporte@example.test";
const sql = sqlFor(pg);

const SEED = `
insert into torre.saas_access (email, role) values
  ('${JEFE}', 'administracion'),
  ('${COMERCIAL}', 'comercial'),
  ('${SOPORTE}', 'soporte')
on conflict (email) do update set role = excluded.role;

-- algunos catálogo de planes ya trae estas filas cargadas
insert into torre.saas_apps (id, name, slug) values ('app_mostrador', 'Mostrador', 'mostrador')
on conflict (id) do nothing;
insert into torre.saas_plans (id, name) values ('plan_base', 'Base') on conflict (id) do nothing;
insert into torre.saas_clients (id, name, status) values
  ('cli_uno', 'Cliente Uno', 'active'),
  ('cli_dos', 'Cliente Dos', 'active');
insert into torre.saas_tenants (id, app_id, client_id, name, slug) values
  ('neg_uno', 'app_mostrador', 'cli_uno', 'Negocio Uno', 'neg-uno');
insert into torre.saas_subscriptions (id, client_id, tenant_id, plan_id, monthly_price, start_date) values
  ('sub_uno', 'cli_uno', 'neg_uno', 'plan_base', 100, '2026-01-01');
insert into torre.saas_payments (id, client_id, subscription_id, amount, payment_date, concept) values
  ('pay_uno', 'cli_uno', 'sub_uno', 100, '2026-01-05', 'enero'),
  ('pay_dos', 'cli_uno', 'sub_uno', 100, '2026-02-05', 'febrero');
`;

before(async () => {
  for (const file of (await readdir(new URL("../../../migrations/", import.meta.url)))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  await pg.exec(SEED);
});
after(() => pg.close());

async function estado(id: string) {
  const filas = await sql.query<{ status: string }>(
    "select status from torre.saas_clients where id = $1",
    [id],
  );
  return filas[0]?.status;
}

async function auditoria(id: string) {
  return sql.query<{ action: string }>(
    "select action from torre.saas_audit where entity_id = $1 order by created_at",
    [id],
  );
}

test("archivar deja el estado en archived, informa el historial y audita", async () => {
  const resultado = await archivarClienteCore(JEFE, "cli_uno", true);
  assert.equal(resultado.yaEstaba, false);
  assert.equal(resultado.negocios, 1);
  assert.equal(resultado.suscripciones, 1);
  assert.equal(resultado.pagos, 2);
  assert.equal(await estado("cli_uno"), "archived");
  assert.deepEqual((await auditoria("cli_uno")).map((a) => a.action), ["archivar_cliente"]);
});

test("repetir el pedido no escribe dos veces", async () => {
  const repetido = await archivarClienteCore(JEFE, "cli_uno", true);
  assert.equal(repetido.yaEstaba, true);
  assert.equal(repetido.negocios, 1);
  assert.deepEqual((await auditoria("cli_uno")).map((a) => a.action), ["archivar_cliente"]);
});

test("restaurar devuelve el cliente al alta y audita la otra acción", async () => {
  const restaurado = await archivarClienteCore(JEFE, "cli_uno", false);
  assert.equal(restaurado.yaEstaba, false);
  assert.equal(await estado("cli_uno"), "active");
  assert.deepEqual((await auditoria("cli_uno")).map((a) => a.action), [
    "archivar_cliente",
    "restaurar_cliente",
  ]);
});

test("el rol comercial alcanza y el de soporte no", async () => {
  assert.equal((await archivarClienteCore(COMERCIAL, "cli_dos", true)).ok, true);
  assert.equal(await estado("cli_dos"), "archived");
  await assert.rejects(archivarClienteCore(SOPORTE, "cli_dos", false), /permiso/);
  assert.equal(await estado("cli_dos"), "archived");
  await assert.rejects(archivarClienteCore("fantasma@example.test", "cli_dos", false), /permiso/);
});

test("un cliente que no existe se frena antes de tocar nada", async () => {
  await assert.rejects(archivarClienteCore(JEFE, "cli-inexistente", true), /no existe/);
  assert.equal((await auditoria("cli-inexistente")).length, 0);
});
