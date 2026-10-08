import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const files = ["0008_torre.sql", "0011_torre_control.sql", "0012_torre_legal.sql", "0013_torre_integridad.sql"];
const sqls = await Promise.all(files.map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")));

function hash(body) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

test("tenant, plan, add-on, precio, fundador, contrato, hash, aislamiento y auditoría", async () => {
  const db = new PGlite();
  for (const text of sqls) await db.exec(text);

  const plan = await db.query("select monthly_price, setup_price from torre.saas_plans where id = 'plan_base'");
  assert.equal(Number(plan.rows[0].monthly_price), 45000);
  assert.equal(Number(plan.rows[0].setup_price), 0);
  const base = await db.query("select setup_usd, recurring_usd from torre.saas_products where slug = 'mostrador-base'");
  assert.equal(Number(base.rows[0].setup_usd), 975);
  assert.equal(Number(base.rows[0].recurring_usd), 100);
  const presencia = await db.query("select recurring_usd from torre.saas_products where slug = 'mercado-presencia'");
  assert.equal(Number(presencia.rows[0].recurring_usd), 32);

  await db.query(
    `insert into torre.saas_tenants (id, app_id, client_id, name, slug, status, plan_id, operational_tenant_ref)
     values ('ten_a', 'app_mostrador', 'cli_roman', 'Puesto A', 'puesto-a', 'active', 'plan_base', 'op_a'),
            ('ten_b', 'app_mostrador', 'cli_roman', 'Puesto B', 'puesto-b', 'active', 'plan_base', 'op_b')`,
  );
  await db.query(
    `insert into torre.saas_subscriptions (id, client_id, tenant_id, plan_id, monthly_price, status, start_date)
     values ('sub_a', 'cli_roman', 'ten_a', 'plan_base', 0, 'pending', '2026-10-07')`,
  );
  await db.query("update torre.saas_subscriptions set status = 'active' where id = 'sub_a'");
  await db.query(
    `insert into torre.saas_subscription_lines
      (id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal, starts_on, status)
     values
      ('lin_base', 'sub_a', 'prod_base', 1, 100, 'USD', 'monthly', 'recurring', 100, '2026-10-07', 'active'),
      ('lin_setup', 'sub_a', 'prod_base', 1, 975, 'USD', 'once', 'setup', 975, '2026-10-07', 'active'),
      ('lin_add', 'sub_a', 'prod_presencia', 1, 32, 'USD', 'monthly', 'recurring', 32, '2026-10-07', 'active')`,
  );
  await db.query("update torre.saas_products set recurring_usd = 180 where slug = 'mercado-presencia'");
  const contratado = await db.query("select unit_price from torre.saas_subscription_lines where id = 'lin_add'");
  assert.equal(Number(contratado.rows[0].unit_price), 32);

  await db.query("update torre.saas_promotions set status = 'active' where code = 'fundador-mercado'");
  await db.query(
    `insert into torre.saas_promotion_grants (id, promotion_id, tenant_id, status, starts_on, ends_on, conditions, evidence_ref)
     values ('grant_a', 'promo_fundador', 'ten_a', 'active', current_date, current_date + 365, 'Testimonio y referencia', 'acuerdo-a')`,
  );
  await db.query(
    `insert into torre.saas_price_adjustments
      (id, tenant_id, line_id, grant_id, kind, percent, amount, currency, starts_on, ends_on, status, note)
     values
      ('adj_bonus', 'ten_a', 'lin_add', 'grant_a', 'bonus', 100, null, 'USD', current_date, current_date + 180, 'active', 'Bonificación'),
      ('adj_freeze', 'ten_a', 'lin_add', 'grant_a', 'freeze', null, 32, 'USD', current_date, current_date + 365, 'active', 'Congelado'),
      ('adj_com', 'ten_a', null, 'grant_a', 'commission_override', 0, null, null, current_date, current_date + 180, 'active', 'Comisión')`,
  );
  await assert.rejects(
    db.query("update torre.saas_subscription_lines set unit_price = 65 where id = 'lin_add'"),
    /precio congelado/,
  );
  const ajenos = await db.query("select id from torre.saas_price_adjustments where tenant_id = 'ten_b'");
  assert.equal(ajenos.rows.length, 0);

  const body = "Contrato exacto del puesto A.\n";
  const digest = hash(body);
  await db.query(
    `insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status, published_at)
     values ('ver_1', 'doc_saas', '1.0', $1, $2, 'published', now())`,
    [body, digest],
  );
  await db.query("update torre.saas_legal_documents set status = 'published' where id = 'doc_saas'");
  await assert.rejects(
    db.query("update torre.saas_legal_versions set body = 'otro texto' where id = 'ver_1'"),
    /inmutable/,
  );
  const body2 = "Contrato exacto del puesto A. Versión 2.\n";
  const digest2 = hash(body2);
  await db.query(
    `insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status, published_at)
     values ('ver_2', 'doc_saas', '2.0', $1, $2, 'published', now())`,
    [body2, digest2],
  );
  const vieja = await db.query("select content_hash from torre.saas_legal_versions where id = 'ver_1'");
  assert.equal(vieja.rows[0].content_hash, digest);
  await db.query(
    `insert into torre.saas_tenant_contracts (id, tenant_id, document_id, version_id, status, snapshot_body, snapshot_hash)
     values ('ctr_a', 'ten_a', 'doc_saas', 'ver_1', 'pending', $1, $2)`,
    [body, digest],
  );
  await assert.rejects(
    db.query("update torre.saas_tenant_contracts set snapshot_body = 'alterado' where id = 'ctr_a'"),
    /snapshot contractual inmutable/,
  );
  await db.query(
    `insert into torre.saas_contract_acceptances
      (id, contract_id, version_id, tenant_id, user_id, user_email, snapshot_hash, ip, user_agent, action)
     values ('acc_a', 'ctr_a', 'ver_1', 'ten_a', 'user_a', 'a@puesto.test', $1, '203.0.113.8', 'Mostrador', 'electronic_acceptance')`,
    [digest],
  );
  await db.query("update torre.saas_tenant_contracts set status = 'accepted' where id = 'ctr_a'");
  await assert.rejects(
    db.query("update torre.saas_contract_acceptances set snapshot_hash = 'ff' where id = 'acc_a'"),
    /registro inmutable/,
  );
  const historia = await db.query("select snapshot_hash from torre.saas_contract_acceptances where tenant_id = 'ten_a'");
  assert.equal(historia.rows[0].snapshot_hash, digest);
  const cruzado = await db.query("select id from torre.saas_tenant_contracts where tenant_id = 'ten_b'");
  assert.equal(cruzado.rows.length, 0);
  const borrador = await db.query("select id from torre.saas_legal_documents where code = 'mercado-comprador' and status = 'draft'");
  assert.equal(borrador.rows.length, 1);
  const publicadoComprador = await db.query(
    `select v.id from torre.saas_legal_versions v
     join torre.saas_legal_documents d on d.id = v.document_id
     where d.code = 'mercado-comprador' and v.status = 'published'`,
  );
  assert.equal(publicadoComprador.rows.length, 0);

  await db.query(
    `insert into torre.saas_audit (id, actor_email, action, entity, entity_id, metadata)
     values ('aud_a', 'legal@torre.test', 'publicar_version_legal', 'legal_version', 'ver_1', '{"before":null,"after":{"hash":"x"}}')`,
  );
  await assert.rejects(db.query("delete from torre.saas_audit where id = 'aud_a'"), /registro inmutable/);
  await assert.rejects(
    db.query("insert into torre.saas_access (email, role) values ('soporte@torre.test', 'dueno')"),
    /saas_access_role_check|check constraint/,
  );
  await db.close();
});
