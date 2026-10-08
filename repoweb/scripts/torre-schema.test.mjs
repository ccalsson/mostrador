import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../migrations/0008_torre.sql", import.meta.url), "utf8");

test("la Torre crea solo tablas saas_ en el schema torre", () => {
  const tables = [...sql.matchAll(/create table if not exists (torre\.saas_[a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(tables, [
    "torre.saas_access",
    "torre.saas_apps",
    "torre.saas_clients",
    "torre.saas_plans",
    "torre.saas_tenants",
    "torre.saas_subscriptions",
    "torre.saas_payments",
    "torre.saas_expenses",
    "torre.saas_versions",
    "torre.saas_deployments",
  ]);
});

test("operational_tenant_ref es texto y no hay FK hacia Mostrador", () => {
  assert.match(sql, /operational_tenant_ref text/);
  assert.doesNotMatch(sql, /references\s+(public\.)?tenants\b/i);
  assert.doesNotMatch(sql, /references\s+(public\.)?(productos|clientes|staff|pedidos|cobros)\b/i);
  assert.doesNotMatch(sql, /\balter table\b/i);
  const fks = [...sql.matchAll(/references\s+([a-z0-9_.]+)/gi)].map((m) => m[1]);
  assert.ok(fks.length > 0);
  assert.ok(fks.every((name) => name.startsWith("torre.")));
});

test("el único acceso inicial es el correo de la software house", () => {
  const inserts = [...sql.matchAll(/insert into torre\.saas_access[\s\S]*?values\s*\(([^)]+)\)/gi)];
  assert.equal(inserts.length, 1);
  assert.match(inserts[0][1], /calssonclaudio@gmail\.com/);
});
