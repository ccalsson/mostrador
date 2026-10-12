import pg from "pg";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const tables = ["clientes", "staff", "mercado_compradores", "mercado_cargadores", "torre.saas_access"];
  for (const t of tables) {
    const [schema, name] = t.includes(".") ? t.split(".") : ["public", t];
    try {
      const cols = await client.query(
        `select column_name from information_schema.columns where table_schema = $1 and table_name = $2 order by column_name`,
        [schema, name],
      );
      const hasUser = cols.rows.some((r) => r.column_name === "user_id");
      console.log(`${t}: ${cols.rows.length} cols | user_id=${hasUser} | ${cols.rows.map((r) => r.column_name).join(",")}`);
    } catch (e) {
      console.log(`${t}: ERROR ${e.message}`);
    }
  }
  const mig = await client.query(
    `select name, applied_at from _migrations where name like '0005%' or name like '0019%' or name like '0015%' order by name`,
  );
  console.log("MIGRATIONS:", JSON.stringify(mig.rows));
} catch (e) {
  console.error("FAILED:", e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
