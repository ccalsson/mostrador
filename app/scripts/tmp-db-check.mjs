import pg from "pg";

const url = process.env.DATABASE_URL;
console.log("DATABASE_URL:", url ? "PRESENTE" : "AUSENTE");
if (!url) process.exit(2);

const masked = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
console.log("URL (enmascarada):", masked);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const db = await client.query(
    "select current_database() as db, inet_server_addr()::text as host, current_user as usr, version() as v",
  );
  console.log("DB:", JSON.stringify(db.rows[0]));
  const users = await client.query('select email from "user" order by email');
  console.log("USERS:", users.rows.length, users.rows.map((r) => r.email).join(", "));
  const counts = await client.query(
    "select (select count(*) from pedidos) as pedidos, (select count(*) from productos) as productos, (select count(*) from staff) as staff",
  );
  console.log("COUNTS:", JSON.stringify(counts.rows[0]));
} catch (e) {
  console.error("QUERY FAILED:", e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
