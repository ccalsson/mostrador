import { readFile } from "node:fs/promises";
import pg from "pg";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const name = process.argv[2] ?? "0023_web_compat_mercado.sql";
const file = new URL(`../../repoweb/migrations/${name}`, import.meta.url);
const text = await readFile(file, "utf8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const ya = await client.query("select name from _migrations where name = $1", [name]);
  if (ya.rows.length) {
    console.log("YA APLICADA:", name);
  } else {
    await client.query("BEGIN");
    await client.query(text);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
    console.log("APLICADA:", name);
  }
  const comp = await client.query(
    "select column_name from information_schema.columns where table_name = 'mercado_compradores' and column_name in ('user_id','identidad_estado','documento_ref','selfie_ref') order by 1",
  );
  const carg = await client.query(
    "select count(*)::int as faltantes from information_schema.columns where table_name = 'mercado_cargadores' and column_name in ('user_id','estado','nivel','recorridos_aceptados','recorridos_completados','cancelaciones','pedidos_retirados','pedidos_entregados','entregas_a_tiempo','entregas_demoradas','suma_minutos_retiro','suma_minutos_entrega','calificacion_suma','calificacion_cantidad','incidencias','reclamos')",
  );
  console.log("compradores cols nuevas:", comp.rows.map((r) => r.column_name).join(","));
  console.log("cargadores cols nuevas:", carg.rows[0].faltantes, "de 16");
} catch (e) {
  console.error("FALLO:", e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
