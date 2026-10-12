import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "migrations");
const nombres = (await readdir(dir)).filter((nombre) => nombre.endsWith(".sql")).sort();
const db = new PGlite();
for (const nombre of nombres) {
  const text = await readFile(join(dir, nombre), "utf8");
  await db.exec(text);
}

const registro = {
  cuando: new Date().toISOString(),
  plan: "presencia",
  pasos: [],
};

function anotar(paso, detalle) {
  registro.pasos.push({ paso, ...detalle });
}

await db.query(
  `insert into tenants (id, nombre, config) values
    ('op_presencia', 'Puesto Presencia', '{"mercadoAlToque": true, "bajada": "Nave 1"}'::jsonb)`,
);
await db.query(
  `insert into productos (id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, activo)
   values ('prd_banana', 'op_presencia', 'Banana', 'kg', 'kg', 1000, 20, 2, true)`,
);
await db.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
  values ('usr_compra', 'Ana', 'ana@prueba.test', true, now(), now()),
         ('usr_carga', 'Luis', 'luis@prueba.test', true, now(), now())`);
await db.query(
  `insert into mercado_compradores (id, user_id, nombre, telefono, pais, tipo_documento, numero_documento, identidad_estado)
   values ('com_ana', 'usr_compra', 'Ana', '110000', 'AR', 'DNI', '30111222', 'documentacion_cargada')`,
);
await db.query(
  `insert into mercado_cargadores (id, user_id, nombre, telefono, estado, disponibilidad)
   values ('car_luis', 'usr_carga', 'Luis', '119999', 'activo', 'disponible')`,
);

const plan = await db.query(`select id from torre.saas_plans order by name limit 1`);
const client = await db.query(`select id from torre.saas_clients limit 1`);
await db.query(
  `insert into torre.saas_tenants (id, app_id, client_id, name, slug, status, plan_id, operational_tenant_ref)
   values ('ten_presencia', 'app_mercado', $1, 'Puesto Presencia', 'puesto-presencia', 'active', $2, 'op_presencia')`,
  [client.rows[0].id, plan.rows[0].id],
);
await db.query(
  `insert into torre.saas_subscriptions (id, client_id, tenant_id, plan_id, monthly_price, status, start_date)
   values ('sub_presencia', $1, 'ten_presencia', $2, 0, 'active', current_date)`,
  [client.rows[0].id, plan.rows[0].id],
);
await db.query(
  `insert into torre.saas_subscription_lines
    (id, subscription_id, product_id, quantity, unit_price, currency, frequency, charge, subtotal, starts_on, status)
   values ('lin_presencia', 'sub_presencia', 'prod_presencia', 1, 32, 'USD', 'monthly', 'recurring', 32, current_date, 'active')`,
);

const vistos = await db.query(`
  select t.id, t.nombre, p.slug
  from tenants t
  join torre.saas_tenants st on st.operational_tenant_ref = t.id
  join torre.saas_subscriptions s on s.tenant_id = st.id and s.status = 'active'
  join torre.saas_subscription_lines l on l.subscription_id = s.id and l.status = 'active'
  join torre.saas_products p on p.id = l.product_id
  where coalesce(t.config, '{}'::jsonb)->>'mercadoAlToque' = 'true'
    and p.slug = 'mercado-presencia'
`);
assert.equal(vistos.rows.length, 1);
assert.equal(vistos.rows[0].nombre, "Puesto Presencia");
anotar("catalogo", { visible: true, puesto: vistos.rows[0].nombre, plan: "presencia", producto: "Banana" });

const caro = await db.query(`select slug from torre.saas_products where slug = 'mercado-pro'`);
assert.equal(caro.rows.length, 1);
anotar("plan", { usado: "presencia", proExigido: false });

await db.query(
  `insert into pedidos (id, tenant_id, client_uuid, cliente_nombre, estado, comprador_mercado_id)
   values ('ped_ana', 'op_presencia', 'ped_ana', 'Ana', 'entregado', 'com_ana')`,
);
await db.query(
  `insert into pedido_items (id, pedido_id, producto_id, nombre_snapshot, unidad, unidad_label, cantidad, precio_unitario)
   values ('it_banana', 'ped_ana', 'prd_banana', 'Banana', 'kg', 'kg', 2, 1000)`,
);
await db.query(
  `insert into mercado_recorridos (id, comprador_id, cargador_id, estado, delivered_at)
   values ('rec_ana', 'com_ana', 'car_luis', 'entregado', now())`,
);
await db.query(
  `insert into mercado_recorrido_pedidos (recorrido_id, pedido_id, estado, delivered_at)
   values ('rec_ana', 'ped_ana', 'entregado', now())`,
);
anotar("compra", { pedido: "ped_ana", comprador: "Ana", cargador: "Luis", estado: "entregado" });

const cruces = [
  ["comprador_cargador", null, "rec_ana", "com_ana", "car_luis", null, 5, "Entregó bien"],
  ["cargador_comprador", null, "rec_ana", "com_ana", "car_luis", null, 4, "Recibió bien"],
  ["comprador_puesto", "ped_ana", null, "com_ana", null, "op_presencia", 5, "La fruta estaba bien"],
  ["puesto_comprador", "ped_ana", null, "com_ana", null, "op_presencia", 5, "Pagó y recibió"],
];
await db.query(
  `insert into mercado_calificaciones (id, recorrido_id, comprador_id, cargador_id, estrellas, comentario)
   values ('cal_cargador', 'rec_ana', 'com_ana', 'car_luis', 5, 'Entregó bien')`,
);
for (const [sentido, pedido, recorrido, comprador, cargador, tenant, estrellas, comentario] of cruces.slice(1)) {
  await db.query(
    `insert into mercado_cruces (id, sentido, pedido_id, recorrido_id, comprador_id, cargador_id, tenant_id, estrellas, comentario)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [`cru_${sentido}`, sentido, pedido, recorrido, comprador, cargador, tenant, estrellas, comentario],
  );
}
const guardadas = await db.query(`
  select 'comprador_cargador' as sentido, estrellas, comentario from mercado_calificaciones
  union all
  select sentido, estrellas, comentario from mercado_cruces
  order by sentido
`);
assert.equal(guardadas.rows.length, 4);
anotar("calificaciones", { registros: guardadas.rows });

const perfil = await db.query(`select nombre, telefono, foto_id from mercado_cargadores where id = 'car_luis'`);
assert.equal(perfil.rows[0].foto_id ?? null, null);
anotar("perfil_cargador", { nombre: perfil.rows[0].nombre, fotoObligatoria: false, tieneFoto: false });

const salida = join(root, "artifacts", "prueba-presencia.json");
await mkdir(join(root, "artifacts"), { recursive: true });
await writeFile(salida, JSON.stringify(registro, null, 2));
console.log(salida);
console.log(JSON.stringify(registro, null, 2));
