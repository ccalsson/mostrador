import pg from "pg";

process.loadEnvFile(".env");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const BUYER = "mercado-e2e-comprador@frutasroman.com";
const modo = process.argv[2] ?? "inspect";

try {
  await client.connect();
  const bid = (
    await client.query("select id from mercado_compradores where email = $1", [BUYER])
  ).rows[0]?.id;
  if (!bid) throw new Error(`comprador ${BUYER} inexistente`);

  const pedidos = await client.query(
    `select id, estado, created_at::text from pedidos
     where comprador_mercado_id = $1 order by created_at desc`,
    [bid],
  );
  console.log("PEDIDOS del comprador e2e:");
  for (const p of pedidos.rows) console.log(`  ${p.id} ${p.estado} ${p.created_at}`);

  const recorridos = await client.query(
    `select r.id, r.estado, r.created_at::text,
            (select count(*)::int from mercado_recorrido_pedidos rp where rp.recorrido_id = r.id) as paradas
     from mercado_recorridos r where r.comprador_id = $1 order by r.created_at desc`,
    [bid],
  );
  console.log("RECORRIDOS del comprador e2e:");
  for (const r of recorridos.rows) console.log(`  ${r.id} ${r.estado} ${r.created_at} paradas=${r.paradas}`);

  const asignados = recorridos.rows.filter((r) => r.estado === "asignado" || r.estado === "aceptado");
  console.log(`atascados (asignado/aceptado): ${asignados.map((r) => r.id).join(", ") || "(ninguno)"}`);

  if (modo === "clean") {
    if (!asignados.length) {
      console.log("clean: nada que limpiar");
    } else {
      for (const r of asignados) {
        await client.query("delete from mercado_recorrido_pedidos where recorrido_id = $1", [r.id]);
        await client.query("update mercado_recorridos set estado = 'rechazado' where id = $1", [r.id]);
        console.log(`clean: recorrido ${r.id} -> rechazado (paradas liberadas)`);
      }
      const res = await client.query(
        `update pedidos set estado = 'anulado', updated_at = now()
         where comprador_mercado_id = $1 and origen = 'mercado_al_toque'
           and estado in ('confirmado', 'en_preparacion', 'listo')
           and id not in (select pedido_id from mercado_recorrido_pedidos)`,
        [bid],
      );
      console.log(`clean: pedidos atascados anulados: ${res.rowCount}`);
    }
  }
} catch (e) {
  console.error("FALLO:", e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
