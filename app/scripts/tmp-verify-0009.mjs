// Verificación post-migración 0009 (solo lectura). Borrar al terminar.
import pg from "pg";

try {
  process.loadEnvFile(".env");
} catch {
  // usa variables del shell
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = (text, params) => pool.query(text, params);

const out = {};

out.migraciones = (await q("select name, applied_at::text from _migrations order by applied_at")).rows;

out.tablasMercado = (
  await q(
    "select table_name from information_schema.tables where table_schema='public' and table_name like 'mercado%' order by 1",
  )
).rows.map((r) => r.table_name);

out.columnasNuevas = (
  await q(
    `select table_name, column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema='public'
       and ((table_name='productos' and column_name='publicado_online')
         or (table_name='pedidos' and column_name in
            ('origen','comprador_mercado_id','pago_estado','confirmed_at',
             'preparation_started_at','prepared_at','picked_up_at','delivered_at')))
     order by table_name, column_name`,
  )
).rows;

out.indicesMercado = (
  await q(
    "select indexname from pg_indexes where schemaname='public' and (indexname like 'mercado%' or indexname='pedidos_mercado_comprador_idx') order by 1",
  )
).rows.map((r) => r.indexname);

out.mostrador = {};
for (const t of ["tenants", "staff", "productos", "pedidos", "pedido_items", "cobros", "stock_movimientos", "clientes", "remitos", "auditoria"]) {
  const r = await q(`select count(*)::int as n from ${t}`);
  out.mostrador[t] = r.rows[0].n;
}

out.pedidosPorOrigen = (await q("select coalesce(origen,'(null)') as origen, count(*)::int as n from pedidos group by 1")).rows;

const fks = await q(
  `select conname, conrelid::regclass as tabla, confrelid::regclass as ref
   from pg_constraint where contype='f' and confrelid::regclass::text in ('pedidos','tenants') order by 1`,
);
out.fkHaciaMostrador = fks.rows;

await pool.end();
console.log(JSON.stringify(out, null, 2));
