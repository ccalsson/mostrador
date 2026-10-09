import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const tablas = await client.query(
    `select table_name from information_schema.tables
     where table_name like 'mercado%' order by table_name`,
  );
  console.log("tablas mercado_*:", tablas.rows.map((r) => r.table_name));
  const cols = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'productos' and column_name = 'publicado_online'`,
  );
  console.log("productos.publicado_online:", cols.rowCount === 1);
  const estados = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'pedidos' and column_name in ('origen','pago_estado','picked_up_at')`,
  );
  console.log("pedidos cols mercado:", estados.rows.map((r) => r.column_name));
  const publicado = await client.query(
    `select count(*)::int as n from productos where publicado_online = true and activo = true`,
  );
  console.log("productos publicados:", publicado.rows[0].n);
  const puestos = await client.query(
    `select count(*)::int as n from tenants where config->>'mercadoAlToque' = 'true'`,
  );
  console.log("tenants con canal prendido:", puestos.rows[0].n);
} finally {
  await client.end();
}
