import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  /* sin .env */
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL AUSENTE");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const before = await client.query(
    "select config->>'operacionesPruebaBorradas' as flag from tenants where id = $1",
    ["frutas-roman"],
  );
  console.log("ANTES:", JSON.stringify(before.rows));
  const upd = await client.query(
    `update tenants
     set config = coalesce(config, '{}'::jsonb) || '{"operacionesPruebaBorradas": true}'::jsonb
     where id = $1 and config->>'operacionesPruebaBorradas' is distinct from 'true'`,
    ["frutas-roman"],
  );
  console.log("FILAS ACTUALIZADAS:", upd.rowCount);
  const after = await client.query(
    "select config from tenants where id = $1",
    ["frutas-roman"],
  );
  console.log("DESPUES:", JSON.stringify(after.rows));
} catch (e) {
  console.error("FATAL:", e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
