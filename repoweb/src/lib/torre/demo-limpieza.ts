import { TENANT_ID, TENANT_NOMBRE } from "../catalog.ts";
import { getSql, withTransaction, type Sql } from "../db.ts";
import { auditar } from "./audit.ts";
import { exigirAccion } from "./roles.ts";

/**
 * Puestos de demostración. Esta herramienta sólo puede vaciar éstos: borrar
 * operaciones ajenos sería un daño real, así que la lista va hardcodeada y no
 * viene de un parámetro del cliente.
 */
const DEMOS = new Set([TENANT_ID, "puesto-prueba"]);

export const PALABRA_DE_BORRADO = "BORRAR";

export type FilaDemo = { tabla: string; filas: number };

export type VistaDemoLimpieza = {
  tenantId: string;
  nombre: string;
  detalle: FilaDemo[];
  total: number;
  catalogo: number;
  clientesConCuenta: number;
};

/**
 * Tablas que mira la limpieza. No todas viven en todos los esquemas: la web
 * tiene `caja_egresos` y en la base compartida también existe `egresos_caja`,
 * así que las listas de conteo y de borrado se filtran por lo que hay.
 */
const TABLAS = [
  "mercado_cruces",
  "mercado_calificaciones",
  "mercado_punto_movimientos",
  "mercado_recorridos",
  "mercado_recorrido_pedidos",
  "mercado_idempotencia",
  "creativos_variantes",
  "creativos_pedidos",
  "stock_movimientos",
  "cuenta_movimientos",
  "pedido_mensajes",
  "tickets",
  "cobros",
  "caja_egresos",
  "egresos_caja",
  "cierres_caja",
  "remitos",
  "facturas",
  "alertas",
  "pedido_items",
  "checklist_items",
  "pedidos",
  "auditoria",
  "clientes",
];

/**
 * Paradas del puesto. `mercado_recorrido_pedidos` no tiene columna de puesto:
 * se llega a él por el pedido, igual que hace el servicio de Mercado.
 */
const PARADAS_DEL_PUESTO =
  "select rp.recorrido_id from mercado_recorrido_pedidos rp" +
  " where exists (select 1 from pedidos p where p.id = rp.pedido_id and p.tenant_id = $1)";

/**
 * Lo que se va. Cada consulta cuenta con el mismo filtro que su DELETE, para
 * que lo que ve el operador sea exactamente lo que se borra. `pedido_items` y
 * `checklist_items` se van por cascada desde los pedidos, pero se cuentan igual.
 */
const CUENTAS: [string, string][] = [
  ["mercado_cruces", "select 'Mercado · cruces' as tabla, count(*)::int as filas from mercado_cruces where tenant_id = $1"],
  [
    "mercado_calificaciones",
    `select 'Mercado · calificaciones' as tabla, count(*)::int as filas from mercado_calificaciones where recorrido_id in (${PARADAS_DEL_PUESTO})`,
  ],
  [
    "mercado_punto_movimientos",
    `select 'Mercado · puntos' as tabla, count(*)::int as filas from mercado_punto_movimientos where referencia in (${PARADAS_DEL_PUESTO})`,
  ],
  [
    "mercado_recorridos",
    `select 'Mercado · recorridos' as tabla, count(*)::int as filas from mercado_recorridos r` +
      ` where r.id in (${PARADAS_DEL_PUESTO})` +
      ` and not exists (select 1 from mercado_recorrido_pedidos x where x.recorrido_id = r.id` +
      ` and not exists (select 1 from pedidos p where p.id = x.pedido_id and p.tenant_id = $1))`,
  ],
  [
    "mercado_recorrido_pedidos",
    `select 'Mercado · paradas' as tabla, count(*)::int as filas from mercado_recorrido_pedidos rp where exists (select 1 from pedidos p where p.id = rp.pedido_id and p.tenant_id = $1)`,
  ],
  [
    "mercado_idempotencia",
    "select 'Mercado · respuestas cacheadas' as tabla, count(*)::int as filas from mercado_idempotencia m where exists (select 1 from pedidos p where p.tenant_id = $1 and position(p.id in m.respuesta::text) > 0)",
  ],
  [
    "creativos_variantes",
    "select 'Creativos · variantes' as tabla, count(*)::int as filas from creativos_variantes v where exists (select 1 from creativos_pedidos c where c.id = v.pedido_id and c.tenant_id = $1)",
  ],
  ["creativos_pedidos", "select 'Creativos · pedidos' as tabla, count(*)::int as filas from creativos_pedidos where tenant_id = $1"],
  ["stock_movimientos", "select 'Movimientos de stock' as tabla, count(*)::int as filas from stock_movimientos where tenant_id = $1"],
  ["cuenta_movimientos", "select 'Cuenta corriente' as tabla, count(*)::int as filas from cuenta_movimientos where tenant_id = $1"],
  ["pedido_mensajes", "select 'Mensajes de pedidos' as tabla, count(*)::int as filas from pedido_mensajes where tenant_id = $1"],
  ["tickets", "select 'Tickets' as tabla, count(*)::int as filas from tickets where tenant_id = $1"],
  ["cobros", "select 'Cobros' as tabla, count(*)::int as filas from cobros where tenant_id = $1"],
  ["caja_egresos", "select 'Egresos de caja' as tabla, count(*)::int as filas from caja_egresos where tenant_id = $1"],
  ["egresos_caja", "select 'Egresos de caja (histórico)' as tabla, count(*)::int as filas from egresos_caja where tenant_id = $1"],
  ["cierres_caja", "select 'Cierres de caja' as tabla, count(*)::int as filas from cierres_caja where tenant_id = $1"],
  ["remitos", "select 'Remitos' as tabla, count(*)::int as filas from remitos where tenant_id = $1"],
  ["facturas", "select 'Facturas' as tabla, count(*)::int as filas from facturas where tenant_id = $1"],
  ["alertas", "select 'Alertas' as tabla, count(*)::int as filas from alertas where tenant_id = $1"],
  [
    "pedido_items",
    "select 'Ítems de pedidos' as tabla, count(*)::int as filas from pedido_items i where exists (select 1 from pedidos p where p.id = i.pedido_id and p.tenant_id = $1)",
  ],
  [
    "checklist_items",
    "select 'Checklist de entrega' as tabla, count(*)::int as filas from checklist_items i where exists (select 1 from pedidos p where p.id = i.pedido_id and p.tenant_id = $1)",
  ],
  ["pedidos", "select 'Pedidos' as tabla, count(*)::int as filas from pedidos where tenant_id = $1"],
  ["auditoria", "select 'Auditoría del puesto' as tabla, count(*)::int as filas from auditoria where tenant_id = $1"],
  ["clientes", "select 'Clientes' as tabla, count(*)::int as filas from clientes where tenant_id = $1"],
];

/** Los dos nombres con que aparece la tabla de egresos de caja. */
const TABLAS_EGRESOS = ["caja_egresos", "egresos_caja"];

/** Tablas de la lista que realmente existen en esta base. */
async function tablasPresentes(sql: Sql): Promise<Set<string>> {
  const filas = await sql.query<{ tablename: string }>(
    "select tablename from pg_catalog.pg_tables where schemaname = 'public'",
  );
  const hay = new Set(filas.map((f) => f.tablename));
  return new Set(TABLAS.filter((t) => hay.has(t)));
}

function exigirDemo(tenantId: string) {
  const id = (tenantId ?? "").trim();
  if (!DEMOS.has(id)) {
    throw new Error("Sólo se puede vaciar un puesto de demostración.");
  }
  return id;
}

export async function previewDatosDemoCore(email: string, tenantId: string): Promise<VistaDemoLimpieza> {
  await exigirAccion(email, "acceso");
  const id = exigirDemo(tenantId);
  const sql = await getSql();
  const presentes = await tablasPresentes(sql);
  const detalle = await sql.query<FilaDemo>(
    CUENTAS.filter(([tabla]) => presentes.has(tabla))
      .map(([, texto]) => texto)
      .join("\nunion all\n"),
    [id],
  );
  const extras = await sql<{ n: number; productos: number }>`
    select
      (select count(*)::int from clientes where tenant_id = ${id} and user_id is not null) as n,
      (select count(*)::int from productos where tenant_id = ${id}) as productos
  `;
  return {
    tenantId: id,
    nombre: id === TENANT_ID ? TENANT_NOMBRE : id,
    detalle: detalle.filter((f) => f.filas > 0),
    total: detalle.reduce((acc, f) => acc + f.filas, 0),
    catalogo: extras[0]?.productos ?? 0,
    clientesConCuenta: extras[0]?.n ?? 0,
  };
}

export type LimpiezaDemoResultado = { borrado: number; stockRestaurado: number; cargadoresAjustados: number };

/**
 * Vacía las operaciones de un puesto de demostración y deja el catálogo intacto.
 * Todo en una sola transacción: si una `delete` choca contra una FK, no se va
 * nada. El orden importa — primero las hojas del grafo de claves foráneas,
 * después los padres.
 */
export async function limpiarDatosDemoCore(
  email: string,
  tenantId: string,
  confirmacion: string,
): Promise<LimpiezaDemoResultado> {
  await exigirAccion(email, "acceso");
  const id = exigirDemo(tenantId);
  if ((confirmacion ?? "").trim().toUpperCase() !== PALABRA_DE_BORRADO) {
    throw new Error(`Escribí ${PALABRA_DE_BORRADO} para confirmar.`);
  }

  const vista = await previewDatosDemoCore(email, id);
  const presentes = await tablasPresentes(await getSql());

  const resultado = await withTransaction(async (tx) => {
    // Los recorridos que tocó este puesto: hay que conocerlos antes de borrar
    // las paradas, porque después ya no hay forma de saber cuáles eran suyas.
    const tocados = await tx<{ id: string }>`
      select distinct rp.recorrido_id as id from mercado_recorrido_pedidos rp
       where rp.recorrido_id is not null
         and exists (select 1 from pedidos p where p.id = rp.pedido_id and p.tenant_id = ${id})
    `;
    const recorridos = tocados.map((r) => r.id);

    const cargadores = await tx<{ id: string }>`
      select distinct cargador_id as id from mercado_punto_movimientos where referencia = any(${recorridos}::text[])
      union
      select distinct cargador_id as id from mercado_calificaciones where recorrido_id = any(${recorridos}::text[])
    `;
    const afectados = cargadores.map((c) => c.id).filter(Boolean);

    await tx`delete from mercado_cruces where tenant_id = ${id}`;
    await tx`delete from mercado_calificaciones where recorrido_id = any(${recorridos}::text[])`;
    // Los puntos se buscan por `referencia`: es la columna que comparten todos
    // los esquemas, mientras que `recorrido_id` sólo existe en la base compartida.
    await tx`delete from mercado_punto_movimientos where referencia = any(${recorridos}::text[])`;

    await tx`
      delete from creativos_variantes v
       where exists (select 1 from creativos_pedidos c where c.id = v.pedido_id and c.tenant_id = ${id})
    `;
    await tx`delete from creativos_pedidos where tenant_id = ${id}`;

    // Las respuestas cacheadas hablan de pedidos que ya no van a existir.
    await tx`
      delete from mercado_idempotencia m
       where exists (select 1 from pedidos p where p.tenant_id = ${id} and position(p.id in m.respuesta::text) > 0)
    `;

    await tx`
      delete from mercado_recorrido_pedidos rp
       where exists (select 1 from pedidos p where p.id = rp.pedido_id and p.tenant_id = ${id})
    `;
    await tx`
      delete from mercado_recorridos r
       where r.id = any(${recorridos}::text[])
         and not exists (select 1 from mercado_recorrido_pedidos x where x.recorrido_id = r.id)
    `;

    // Sin esto el catálogo amanece con el stock descontado dos veces: los
    // movimientos registrados son la resta que se hizo sobre el stock.
    const revertidas = await tx<{ id: string }>`
      with deltas as (
        select producto_id, sum(cantidad) as suma from stock_movimientos where tenant_id = ${id} group by producto_id
      )
      update productos p set stock = p.stock - d.suma
        from deltas d where p.id = d.producto_id and p.tenant_id = ${id}
        returning p.id as id
    `;
    await tx`delete from stock_movimientos where tenant_id = ${id}`;

    await tx`delete from cuenta_movimientos where tenant_id = ${id}`;
    await tx`delete from pedido_mensajes where tenant_id = ${id}`;
    await tx`delete from tickets where tenant_id = ${id}`;
    await tx`delete from cobros where tenant_id = ${id}`;
    // Egresos tiene dos nombres según el esquema: la web creó `caja_egresos` y
    // en la base compartida sobrevive `egresos_caja`. Se vacía cada una que existe.
    for (const tabla of TABLAS_EGRESOS) {
      if (presentes.has(tabla)) await tx.query(`delete from ${tabla} where tenant_id = $1`, [id]);
    }
    await tx`delete from cierres_caja where tenant_id = ${id}`;
    await tx`delete from remitos where tenant_id = ${id}`;
    await tx`delete from facturas where tenant_id = ${id}`;
    await tx`delete from alertas where tenant_id = ${id}`;
    await tx`delete from pedidos where tenant_id = ${id}`;
    await tx`delete from auditoria where tenant_id = ${id}`;
    await tx`delete from clientes where tenant_id = ${id}`;
    await tx`update ticket_seq set ultimo = 0 where tenant_id = ${id}`;

    // Los contadores de los cargadores son desnormalizados: se recalculan desde
    // sus propios libros, igual que hace el servicio de Mercado al calificar.
    if (afectados.length) {
      await tx`
        update mercado_cargadores c
           set puntos = round(coalesce((
                 select sum(m.puntos) from mercado_punto_movimientos m where m.cargador_id = c.id
               ), 0))::int,
               score = coalesce((
                 select avg(k.estrellas) from mercado_calificaciones k
                  where k.recorrido_id in (select r.id from mercado_recorridos r where r.cargador_id = c.id)
               ), 0)
         where c.id = any(${afectados}::text[])
      `;
    }

    return { stockRestaurado: revertidas.length, cargadoresAjustados: afectados.length };
  });

  await auditar(email, "borrar_datos_de_prueba", "tenant", id, {
    total: vista.total,
    detalle: vista.detalle,
    clientesConCuenta: vista.clientesConCuenta,
    ...resultado,
  });

  return { borrado: vista.total, ...resultado };
}
