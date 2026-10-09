import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL: AUSENTE");
  process.exit(1);
}
console.log("DATABASE_URL: PRESENTE");

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("begin");

  const refs = await client.query(
    `select table_name, column_name
     from information_schema.key_column_usage
     where table_name <> 'staff'
       and constraint_name in (
         select constraint_name from information_schema.referential_constraints
         where unique_constraint_name in (
           select constraint_name from information_schema.table_constraints
           where table_name = 'staff' and constraint_type = 'PRIMARY KEY'
         )
       )`,
  );
  console.log("FKs hacia staff:", refs.rows);

  const victims = await client.query(
    `select id, nombre, email from staff where email like 'test%@frutasroman.com'`,
  );
  console.log("Usuarios de prueba:", victims.rows);
  const ids = victims.rows.map((r) => r.id);

  if (ids.length > 0) {
    for (const ref of refs.rows) {
      const res = await client.query(
        `select count(*)::int as n from ${ref.table_name} where ${ref.column_name} = any($1)`,
        [ids],
      );
      console.log(`refs en ${ref.table_name}.${ref.column_name}:`, res.rows[0].n);
    }
    const delStaff = await client.query(
      `delete from staff where id = any($1)`,
      [ids],
    );
    console.log("staff borrados:", delStaff.rowCount);
    const delAuth = await client.query(
      `delete from "user" where email like 'test%@frutasroman.com'`,
    );
    console.log("auth users borrados:", delAuth.rowCount);
  }

  await client.query("commit");
  console.log("COMMIT OK");
} catch (error) {
  await client.query("rollback");
  console.error("ROLLBACK:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
