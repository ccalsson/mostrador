import pg from "pg";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const check = async (table, cols) => {
    const r = await client.query(
      `select column_name, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = any($2)
        order by column_name`,
      [table, cols],
    );
    for (const row of r.rows) {
      console.log(
        `${table}.${row.column_name}: nullable=${row.is_nullable} default=${row.column_default ?? "NULL"}`,
      );
    }
  };
  await check("mercado_compradores", [
    "email",
    "pais",
    "tipo_documento",
    "numero_documento",
    "telefono",
    "user_id",
  ]);
  await check("mercado_cargadores", ["email", "telefono", "user_id", "estado"]);
  const conteo = await client.query(
    `select count(*)::int as n, count(user_id)::int as con_user_id from mercado_compradores`,
  );
  console.log("mercado_compradores:", JSON.stringify(conteo.rows[0]));
} catch (e) {
  console.error("FAILED:", e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
