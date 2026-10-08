import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const files = ["0008_torre.sql", "0011_torre_control.sql", "0012_torre_legal.sql"];
const sqls = await Promise.all(files.map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")));

function hash(body) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

test("0012 no toca tablas operativas ni duplica el catálogo", () => {
  const legal = sqls[2];
  assert.doesNotMatch(legal, /references\s+(public\.)?(tenants|productos|clientes|pedidos|cobros)\b/i);
  assert.doesNotMatch(legal, /create table if not exists torre\.saas_products/i);
  assert.match(legal, /saas_legal_versions/);
  assert.match(legal, /saas_promotion_grants/);
  assert.match(legal, /fundador-mercado/);
  assert.match(legal, /'draft'/);
});

test("contrato, hash, aceptación y aislamiento entre tenants", async () => {
  const db = new PGlite();
  for (const text of sqls) await db.exec(text);
  const integridad = await readFile(new URL("../migrations/0013_torre_integridad.sql", import.meta.url), "utf8");
  await db.exec(integridad);
  const role = await db.query("select role from torre.saas_access where email = 'calssonclaudio@gmail.com'");
  assert.equal(role.rows[0].role, "administracion");
  const promo = await db.query("select status from torre.saas_promotions where code = 'fundador-mercado'");
  assert.equal(promo.rows[0].status, "draft");
  const docs = await db.query("select status from torre.saas_legal_documents");
  assert.ok(docs.rows.every((row) => row.status === "draft"));

  const body = "Texto exacto de prueba.\n";
  const digest = hash(body);
  await db.query(
    `insert into torre.saas_tenants (id, app_id, client_id, name, slug, operational_tenant_ref)
     values ('ten_a', 'app_mostrador', 'cli_roman', 'A', 'a', 'op_a'),
            ('ten_b', 'app_mostrador', 'cli_roman', 'B', 'b', 'op_b')`,
  );
  await db.query(
    `insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status, published_at)
     values ('ver_a', 'doc_saas', '1.0', $1, $2, 'published', now())`,
    [body, digest],
  );
  await db.query(
    `insert into torre.saas_tenant_contracts (id, tenant_id, document_id, version_id, status, snapshot_body, snapshot_hash)
     values ('ctr_a', 'ten_a', 'doc_saas', 'ver_a', 'pending', $1, $2)`,
    [body, digest],
  );
  await assert.rejects(
    db.query("update torre.saas_legal_versions set body = 'cambiado' where id = 'ver_a'"),
    /inmutable/,
  );
  const ajenos = await db.query("select id from torre.saas_tenant_contracts where tenant_id = 'ten_b'");
  assert.equal(ajenos.rows.length, 0);
  const propios = await db.query("select snapshot_hash from torre.saas_tenant_contracts where tenant_id = 'ten_a'");
  assert.equal(propios.rows[0].snapshot_hash, digest);
  await db.query(
    `insert into torre.saas_contract_acceptances (id, contract_id, version_id, tenant_id, user_id, user_email, snapshot_hash, action)
     values ('acc_a', 'ctr_a', 'ver_a', 'ten_a', 'user_a', 'a@puesto.test', $1, 'electronic_acceptance')`,
    [digest],
  );
  await db.query("update torre.saas_tenant_contracts set status = 'accepted' where id = 'ctr_a'");
  const visto = await db.query(
    `select a.snapshot_hash from torre.saas_contract_acceptances a where a.tenant_id = 'ten_a'`,
  );
  assert.equal(visto.rows[0].snapshot_hash, digest);
  const cruzado = await db.query(
    `select id from torre.saas_contract_acceptances where tenant_id = 'ten_b'`,
  );
  assert.equal(cruzado.rows.length, 0);
  await db.close();
});
