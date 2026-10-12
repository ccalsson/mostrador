import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  /* sin .env */
}

const url = process.env.DATABASE_URL;
console.log("DATABASE_URL:", url ? "PRESENTE" : "AUSENTE");
if (!url) process.exit(2);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = async (label, text, params = []) => {
  try {
    const r = await client.query(text, params);
    console.log(label, JSON.stringify(r.rows));
  } catch (e) {
    console.log(label, "ERROR:", e?.message);
  }
};

try {
  await client.connect();
  await q("DB:", "select current_database() db, now()::text ahora");
  await q(
    "MIGRATIONS_LAST:",
    "select name, applied_at::text from _migrations order by applied_at desc nulls last limit 12",
  );
  await q("TENANT_CONFIG:", "select config from tenants where id = $1", ["frutas-roman"]);
  await q(
    "COUNTS:",
    `select
      (select count(*) from tickets where tenant_id='frutas-roman') tickets,
      (select count(*) from cobros where tenant_id='frutas-roman') cobros,
      (select count(*) from pedidos where tenant_id='frutas-roman') pedidos,
      (select count(*) from alertas where tenant_id='frutas-roman') alertas,
      (select count(*) from cierres_caja where tenant_id='frutas-roman') cierres,
      (select count(*) from cuenta_movimientos where tenant_id='frutas-roman') cta_mov,
      (select count(*) from auditoria where tenant_id='frutas-roman') auditoria`,
  );
  await q(
    "FK_BLOCKERS:",
    `select count(*) blockers,
       (select count(*) from mercado_recorrido_pedidos) rec_ped_total
     from mercado_recorrido_pedidos mp
     join pedidos p on p.id = mp.pedido_id
     where p.tenant_id = 'frutas-roman'`,
  );
  await q("USER:", "select email from \"user\" where email = 'dueno@frutasroman.com'");
  await q("SESSIONS:", "select count(*) n, max(\"createdAt\")::text last from session");
  await q("STAFF:", "select email, rol, activo from staff where tenant_id = 'frutas-roman' order by email");
} catch (e) {
  console.error("FATAL:", e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
