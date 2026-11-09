import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";

// `demo-limpieza` habla con `getSql()`/`withTransaction()`, que eligen el
// backend cuando el módulo se carga. Con DATABASE_URL el camino es el pool de
// `pg`, así que se le enchufa PGlite antes de importar nada.
process.env.DATABASE_URL = "postgres://prueba-local/no-se-usa";

const pg = new PGlite();

function sqlFor(db: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}): Sql {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) =>
    db
      .query(
        strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""),
        values,
      )
      .then((r) => r.rows);
  sql.query = (text: string, params: unknown[] = []) => db.query(text, params).then((r) => r.rows);
  return sql as Sql;
}

const globalRef = globalThis as {
  __pgSqlPromise__?: Promise<Sql>;
  __pgPool__?: { connect: () => Promise<{ query: unknown; release: () => void }> };
};
globalRef.__pgSqlPromise__ = Promise.resolve(sqlFor(pg));
globalRef.__pgPool__ = {
  connect: async () => ({ query: (t: string, p?: unknown[]) => pg.query(t, p), release: () => {} }),
};

const { TENANT_ID } = await import("../catalog.ts");
const { PALABRA_DE_BORRADO, limpiarDatosDemoCore, previewDatosDemoCore } = await import("./demo-limpieza.ts");

const JEFE = "jefe@example.test";
const OTRA = "otra-casa";

const SEED = `
insert into tenants (id, nombre) values
  ('${TENANT_ID}', 'Puesto demo'), ('${OTRA}', 'Puesto vecino');
insert into torre.saas_access (email, role) values
  ('${JEFE}', 'administracion'), ('soporte@example.test', 'soporte');

-- catálogo: las filas existen antes y tienen que seguir existiendo después
insert into productos (id, tenant_id, nombre, unidad, unidad_label, precio, stock) values
  ('p1', '${TENANT_ID}', 'Cebolla', 'bulto', 'bulto', 100, 8),
  ('p2', '${OTRA}', 'Zapallo', 'bulto', 'bulto', 100, 4);

insert into clientes (id, tenant_id, nombre, user_id) values
  ('c1', '${TENANT_ID}', 'Cliente demo', null),
  ('c2', '${OTRA}', 'Cliente vecino', 'usr-vecino');

insert into "user" (id, name, email, "emailVerified") values
  ('usr-vecino', 'Vecino', 'vecino@example.test', true),
  ('usr-carga', 'Cargador', 'carga@example.test', true),
  ('usr-compra', 'Comprador', 'compra@example.test', true);

insert into pedidos (id, tenant_id, client_uuid, cliente_id, estado) values
  ('pd1', '${TENANT_ID}', 'uuid-1', 'c1', 'entregado'),
  ('pd2', '${OTRA}', 'uuid-2', 'c2', 'entregado');
insert into pedido_items (id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label) values
  ('pi1', 'pd1', 'p1', 'Cebolla', 2, 100, 'bulto', 'bulto'),
  ('pi2', 'pd2', 'p2', 'Zapallo', 1, 100, 'bulto', 'bulto');
insert into stock_movimientos (id, tenant_id, producto_id, tipo, cantidad) values
  ('sm1', '${TENANT_ID}', 'p1', 'venta', -2),
  ('sm2', '${OTRA}', 'p2', 'venta', -1);
insert into cuenta_movimientos (id, tenant_id, cliente_id, tipo, monto) values
  ('cm1', '${TENANT_ID}', 'c1', 'venta', 200),
  ('cm2', '${OTRA}', 'c2', 'venta', 100);
insert into pedido_mensajes (id, tenant_id, pedido_id, cliente_id, emisor, cuerpo) values
  ('ms1', '${TENANT_ID}', 'pd1', 'c1', 'cliente', 'hola'),
  ('ms2', '${OTRA}', 'pd2', 'c2', 'cliente', 'hola');
insert into ticket_seq (tenant_id, ultimo) values ('${TENANT_ID}', 7), ('${OTRA}', 9);
insert into cobros (id, tenant_id, pedido_id, client_uuid, forma_pago, monto, usuario_id) values
  ('cb1', '${TENANT_ID}', 'pd1', 'cu-1', 'efectivo', 200, 'usr-carga'),
  ('cb2', '${OTRA}', 'pd2', 'cu-2', 'efectivo', 100, 'usr-carga');
insert into tickets (id, cobro_id, tenant_id, numero, contenido) values
  ('tk1', 'cb1', '${TENANT_ID}', 7, '{}'::jsonb),
  ('tk2', 'cb2', '${OTRA}', 9, '{}'::jsonb);
insert into caja_egresos (id, tenant_id, categoria, concepto, monto) values
  ('eg1', '${TENANT_ID}', 'otros', 'nafta', 10),
  ('eg2', '${OTRA}', 'otros', 'nafta', 10);
insert into cierres_caja (id, tenant_id, usuario_id) values
  ('cj1', '${TENANT_ID}', 'usr-carga'), ('cj2', '${OTRA}', 'usr-carga');
insert into remitos (id, tenant_id, fuente, estado) values
  ('re1', '${TENANT_ID}', 'pdf', 'borrador'), ('re2', '${OTRA}', 'pdf', 'borrador');
insert into facturas (id, tenant_id, cbte_tipo, punto_venta, fecha, ambiente, neto, iva, total, alicuota, estado) values
  ('fa1', '${TENANT_ID}', 6, 1, '2026-01-01', 'test', 0, 0, 200, 0, 'emitida'),
  ('fa2', '${OTRA}', 6, 1, '2026-01-01', 'test', 0, 0, 100, 0, 'emitida');
insert into alertas (id, tenant_id, tipo, mensaje) values
  ('al1', '${TENANT_ID}', 'stock', 'bajo'), ('al2', '${OTRA}', 'stock', 'bajo');
insert into auditoria (id, tenant_id, accion, entidad) values
  ('au1', '${TENANT_ID}', 'vender', 'pedido'), ('au2', '${OTRA}', 'vender', 'pedido');

-- Mercado: un recorrido del demo y uno del vecino, con el mismo cargador
insert into mercado_compradores (id, user_id, nombre) values ('mc1', 'usr-compra', 'Comprador');
insert into mercado_cargadores (id, user_id, nombre, puntos, score) values
  ('mg1', 'usr-carga', 'Cargador', 999, 1);
insert into mercado_recorridos (id, comprador_id, cargador_id, estado) values
  ('rec1', 'mc1', 'mg1', 'entregado'), ('rec2', 'mc1', 'mg1', 'entregado');
insert into mercado_recorrido_pedidos (recorrido_id, pedido_id, estado) values
  ('rec1', 'pd1', 'entregado'), ('rec2', 'pd2', 'entregado');
insert into mercado_calificaciones (id, recorrido_id, comprador_id, cargador_id, estrellas) values
  ('cal1', 'rec1', 'mc1', 'mg1', 5), ('cal2', 'rec2', 'mc1', 'mg1', 4);
-- el esquema de la web sólo conoce "referencia", nunca "recorrido_id"
insert into mercado_punto_movimientos (id, cargador_id, codigo, puntos, referencia) values
  ('ptm1', 'mg1', 'entrega_completada', 10, 'rec1'),
  ('ptm2', 'mg1', 'entrega_a_tiempo', 7, 'rec2');
insert into mercado_cruces (id, sentido, pedido_id, recorrido_id, comprador_id, cargador_id, tenant_id, estrellas) values
  ('cr1', 'cargador_comprador', 'pd1', 'rec1', 'mc1', 'mg1', '${TENANT_ID}', 4),
  ('cr2', 'cargador_comprador', 'pd2', 'rec2', 'mc1', 'mg1', '${OTRA}', 4);
insert into mercado_idempotencia (user_id, clave, ruta, respuesta) values
  ('usr-compra', 'k1', '/pedidos', '{"id":"pd1"}'::jsonb),
  ('usr-compra', 'k2', '/pedidos', '{"id":"pd2"}'::jsonb);

insert into creativos_pedidos (id, tenant_id, formato, cantidad, brief, estado) values
  ('cp1', '${TENANT_ID}', 'banner', 1, 'b', 'listo'), ('cp2', '${OTRA}', 'banner', 1, 'b', 'listo');
insert into creativos_variantes (id, pedido_id, n, titulo, texto, imagen) values
  ('cv1', 'cp1', 1, 't', 'x', 'i'), ('cv2', 'cp2', 1, 't', 'x', 'i');
`;

const sql = sqlFor(pg);

/** Filas que quedan de un puesto, tabla por tabla. */
async function contar(tenantId: string) {
  const filas = await sql.query<{ n: number }>(
    `select count(*)::int as n from pedidos where tenant_id = $1`,
    [tenantId],
  );
  return filas[0]!.n;
}

before(async () => {
  for (const file of (await readdir(new URL("../../../migrations/", import.meta.url)))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  await pg.exec(SEED);
});
after(() => pg.close());

const VERIFICACION: [string, string][] = [
  ["mercado_cruces", "tenant_id = $1"],
  ["mercado_calificaciones", "recorrido_id = 'rec1'"],
  ["mercado_punto_movimientos", "referencia = 'rec1'"],
  ["mercado_recorrido_pedidos", "recorrido_id = 'rec1'"],
  ["mercado_idempotencia", "clave = 'k1'"],
  ["creativos_variantes", "pedido_id = 'cp1'"],
  ["creativos_pedidos", "tenant_id = $1"],
  ["stock_movimientos", "tenant_id = $1"],
  ["cuenta_movimientos", "tenant_id = $1"],
  ["pedido_mensajes", "tenant_id = $1"],
  ["tickets", "tenant_id = $1"],
  ["cobros", "tenant_id = $1"],
  ["caja_egresos", "tenant_id = $1"],
  ["cierres_caja", "tenant_id = $1"],
  ["remitos", "tenant_id = $1"],
  ["facturas", "tenant_id = $1"],
  ["alertas", "tenant_id = $1"],
  ["pedido_items", "pedido_id = 'pd1'"],
  ["pedidos", "tenant_id = $1"],
  ["auditoria", "tenant_id = $1"],
  ["clientes", "tenant_id = $1"],
];

test("la vista previa nombra cada tabla y sólo mira el puesto pedido", async () => {
  const vista = await previewDatosDemoCore(JEFE, TENANT_ID);
  assert.ok(vista.detalle.length > 0);
  for (const fila of vista.detalle) {
    assert.ok(fila.tabla && fila.tabla.length > 0, "cada fila necesita su etiqueta");
    assert.ok(fila.filas > 0);
  }
  const porNombre = new Map(vista.detalle.map((f) => [f.tabla, f.filas]));
  // Una sola fila por tabla en el demo; la gemela del vecino no debe entrar.
  for (const [, etiqueta] of [
    ["pedidos", "Pedidos"],
    ["stock_movimientos", "Movimientos de stock"],
    ["mercado_recorrido_pedidos", "Mercado · paradas"],
    ["mercado_punto_movimientos", "Mercado · puntos"],
  ])
    assert.equal(porNombre.get(etiqueta), 1, etiqueta);
  assert.equal(porNombre.get("Mercado · calificaciones"), 1);
  assert.equal(vista.catalogo, 1, "el catálogo se cuenta aparte");
  assert.equal(vista.clientesConCuenta, 0);
});

test("sin la palabra exacta no se toca nada", async () => {
  await assert.rejects(limpiarDatosDemoCore(JEFE, TENANT_ID, "sí"), /Escribí BORRAR/);
  await assert.rejects(limpiarDatosDemoCore(JEFE, TENANT_ID, "borrar todo"), /Escribí BORRAR/);
  await assert.rejects(limpiarDatosDemoCore(JEFE, TENANT_ID, ""), /Escribí BORRAR/);
  assert.equal(await contar(TENANT_ID), 1);
});

test("sólo un puesto de demostración se puede vaciar", async () => {
  await assert.rejects(limpiarDatosDemoCore(JEFE, OTRA, PALABRA_DE_BORRADO), /demostración/);
  assert.equal(await contar(OTRA), 1);
});

test("los roles que no tienen acceso quedan afuera", async () => {
  await assert.rejects(previewDatosDemoCore("soporte@example.test", TENANT_ID), /permiso/);
  await assert.rejects(limpiarDatosDemoCore("soporte@example.test", TENANT_ID, PALABRA_DE_BORRADO), /permiso/);
  await assert.rejects(previewDatosDemoCore("fantasma@example.test", TENANT_ID), /permiso/);
  assert.equal(await contar(TENANT_ID), 1);
});

test("el borrado vacía el puesto demo, hoja por hoja, y deja el resto en pie", async () => {
  const resultado = await limpiarDatosDemoCore(JEFE, TENANT_ID, PALABRA_DE_BORRADO);

  for (const [tabla, filtro] of VERIFICACION) {
    const restantes = await sql.query<{ n: number }>(
      `select count(*)::int as n from ${tabla} where ${filtro}`,
      filtro.includes("$1") ? [TENANT_ID] : [],
    );
    assert.equal(restantes[0]!.n, 0, `${tabla} quedó vacía`);
  }

  // El vecino no se toca.
  assert.equal(await contar(OTRA), 1);
  assert.equal((await sql.query(`select id from pedidos where id = 'pd2'`)).length, 1);
  assert.equal((await sql.query(`select id from mercado_recorridos where id = 'rec2'`)).length, 1);
  assert.equal((await sql.query(`select id from clientes where id = 'c2'`)).length, 1);

  // Catálogo intacto, con el stock del demo devuelto a su valor de antes de vender.
  assert.equal(
    (await sql<{ stock: string }>`select stock::text as stock from productos where id = 'p1'`)[0]!.stock,
    "10.000",
  );
  assert.equal(
    (await sql<{ stock: string }>`select stock::text as stock from productos where id = 'p2'`)[0]!.stock,
    "4.000",
  );
  assert.equal(resultado.stockRestaurado, 1);

  // El recorrido del demo se fue (se quedó sin paradas) y su cargador volvió a
  // contar sólo los puntos del recorrido ajeno.
  assert.equal((await sql.query(`select id from mercado_recorridos where id = 'rec1'`)).length, 0);
  const cargador = (
    await sql<{ puntos: number; score: string }>`select puntos, score::text as score from mercado_cargadores where id = 'mg1'`
  )[0]!;
  assert.equal(cargador.puntos, 7);
  assert.equal(cargador.score, "4.00");
  assert.equal(resultado.cargadoresAjustados, 1);

  // La numeración de tickets vuelve a cero y la auditoría deja constancia.
  assert.equal(
    (await sql<{ ultimo: number }>`select ultimo from ticket_seq where tenant_id = ${TENANT_ID}`)[0]!.ultimo,
    0,
  );
  const bitacora = await sql<{ action: string }>`
    select action from torre.saas_audit where actor_email = ${JEFE} order by created_at desc limit 1
  `;
  assert.equal(bitacora[0]!.action, "borrar_datos_de_prueba");
});
