import { assertRole } from "@/lib/server/context";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import type { PedidoEstado, Staff } from "@/lib/types";

const PAGINA = 30;

export type Mensaje = {
  id: string;
  emisor: "cliente" | "negocio";
  cuerpo: string;
  createdAt: string;
};

async function accesoNegocio(staff: Staff, pedidoId: string) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const pedidos = await sql<{ cliente_id: string | null; tenant_id: string }>`
    select cliente_id, tenant_id from pedidos where id = ${pedidoId} limit 1
  `;
  const row = pedidos[0];
  if (!row?.cliente_id) throw new Error("Este pedido no tiene conversación.");
  if (row.tenant_id !== staff.tenantId) throw new Error("Ese pedido no es de este puesto.");
  return { tenantId: row.tenant_id, clienteId: row.cliente_id };
}

function mapMensaje(r: { id: string; emisor: string; cuerpo: string; created_at: string }): Mensaje {
  return {
    id: r.id,
    emisor: r.emisor === "negocio" ? "negocio" : "cliente",
    cuerpo: r.cuerpo,
    createdAt: r.created_at,
  };
}

export async function mensajesDelPedidoForStaff(staff: Staff, pedidoId: string, antes?: string) {
  await accesoNegocio(staff, pedidoId);
  const sql = await getSql();
  await sql`
    update pedido_mensajes set leido = true
    where pedido_id = ${pedidoId} and emisor = 'cliente' and leido = false
  `;
  const rows = antes
    ? await sql<{ id: string; emisor: string; cuerpo: string; created_at: string }>`
        select id, emisor, cuerpo, created_at::text as created_at
        from pedido_mensajes
        where pedido_id = ${pedidoId} and created_at < ${antes}::timestamptz
        order by created_at desc
        limit ${PAGINA + 1}
      `
    : await sql<{ id: string; emisor: string; cuerpo: string; created_at: string }>`
        select id, emisor, cuerpo, created_at::text as created_at
        from pedido_mensajes
        where pedido_id = ${pedidoId}
        order by created_at desc
        limit ${PAGINA + 1}
      `;
  const hayMas = rows.length > PAGINA;
  const mensajes = rows.slice(0, PAGINA).map(mapMensaje).reverse();
  return { mensajes, hayMas };
}

export async function enviarMensajePedidoForStaff(staff: Staff, pedidoId: string, cuerpo: string) {
  const texto = cuerpo.trim();
  if (!texto) throw new Error("Escribí un mensaje.");
  if (texto.length > 500) throw new Error("El mensaje es muy largo.");
  const acceso = await accesoNegocio(staff, pedidoId);
  const sql = await getSql();
  await sql`
    insert into pedido_mensajes (id, tenant_id, pedido_id, cliente_id, emisor, staff_id, cuerpo, leido)
    values (
      ${newId("msg")}, ${acceso.tenantId}, ${pedidoId}, ${acceso.clienteId},
      'negocio', ${staff.id}, ${texto}, ${false}
    )
  `;
  try {
    const { publicarMensaje } = await import("@/lib/server/mensajes-vivo");
    publicarMensaje({ pedidoId, clienteId: acceso.clienteId, tenantId: acceso.tenantId });
  } catch {
    /* el mensaje ya está guardado; sin socket se ve en el próximo sondeo */
  }
  return { ok: true };
}

type FichaCliente = { id: string; tenantId: string };

async function accesoCliente(ficha: FichaCliente, pedidoId: string) {
  const sql = await getSql();
  const pedidos = await sql<{ cliente_id: string | null; tenant_id: string }>`
    select cliente_id, tenant_id from pedidos where id = ${pedidoId} limit 1
  `;
  const row = pedidos[0];
  if (!row?.cliente_id) throw new Error("Este pedido no tiene conversación.");
  if (row.tenant_id !== ficha.tenantId || row.cliente_id !== ficha.id) {
    throw new Error("Ese pedido no es tuyo.");
  }
  return { tenantId: row.tenant_id, clienteId: row.cliente_id };
}

export async function mensajesDelPedidoForClient(ficha: FichaCliente, pedidoId: string, antes?: string) {
  await accesoCliente(ficha, pedidoId);
  const sql = await getSql();
  await sql`
    update pedido_mensajes set leido = true
    where pedido_id = ${pedidoId} and emisor = 'negocio' and leido = false
  `;
  const rows = antes
    ? await sql<{ id: string; emisor: string; cuerpo: string; created_at: string }>`
        select id, emisor, cuerpo, created_at::text as created_at
        from pedido_mensajes
        where pedido_id = ${pedidoId} and created_at < ${antes}::timestamptz
        order by created_at desc
        limit ${PAGINA + 1}
      `
    : await sql<{ id: string; emisor: string; cuerpo: string; created_at: string }>`
        select id, emisor, cuerpo, created_at::text as created_at
        from pedido_mensajes
        where pedido_id = ${pedidoId}
        order by created_at desc
        limit ${PAGINA + 1}
      `;
  const hayMas = rows.length > PAGINA;
  const mensajes = rows.slice(0, PAGINA).map(mapMensaje).reverse();
  return { mensajes, hayMas };
}

export async function enviarMensajePedidoForClient(ficha: FichaCliente, pedidoId: string, cuerpo: string) {
  const texto = cuerpo.trim();
  if (!texto) throw new Error("Escribí un mensaje.");
  if (texto.length > 500) throw new Error("El mensaje es muy largo.");
  const acceso = await accesoCliente(ficha, pedidoId);
  const sql = await getSql();
  await sql`
    insert into pedido_mensajes (id, tenant_id, pedido_id, cliente_id, emisor, staff_id, cuerpo, leido)
    values (
      ${newId("msg")}, ${acceso.tenantId}, ${pedidoId}, ${acceso.clienteId},
      'cliente', ${null}, ${texto}, ${false}
    )
  `;
  try {
    const { publicarMensaje } = await import("@/lib/server/mensajes-vivo");
    publicarMensaje({ pedidoId, clienteId: acceso.clienteId, tenantId: acceso.tenantId });
  } catch {
    /* el mensaje ya está guardado; sin socket se ve en el próximo sondeo */
  }
  return { ok: true };
}

export async function misMensajesPendientesForClient(ficha: FichaCliente) {
  const sql = await getSql();
  const rows = await sql<{ pedido_id: string; n: unknown }>`
    select pedido_id, count(*)::int as n
    from pedido_mensajes
    where cliente_id = ${ficha.id} and emisor = 'negocio' and leido = false
    group by pedido_id
  `;
  return rows.map((r) => ({ pedidoId: r.pedido_id, n: num(r.n) }));
}

export async function conversacionesNegocioForStaff(staff: Staff) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{
    pedido_id: string;
    cliente_nombre: string;
    estado: PedidoEstado;
    pedido_at: string;
    cuerpo: string;
    emisor: string;
    created_at: string;
    sin_leer: unknown;
  }>`
    select * from (
      select distinct on (m.pedido_id)
        m.pedido_id, p.cliente_nombre, p.estado, p.created_at::text as pedido_at,
        m.cuerpo, m.emisor, m.created_at::text as created_at,
        (
          select count(*)::int from pedido_mensajes u
          where u.pedido_id = m.pedido_id and u.emisor = 'cliente' and u.leido = false
        ) as sin_leer
      from pedido_mensajes m
      join pedidos p on p.id = m.pedido_id
      where m.tenant_id = ${staff.tenantId}
      order by m.pedido_id, m.created_at desc
    ) t
    order by created_at desc
    limit 40
  `;
  return rows.map((r) => ({
    pedidoId: r.pedido_id,
    clienteNombre: r.cliente_nombre,
    estado: r.estado,
    pedidoAt: r.pedido_at,
    ultimo: r.cuerpo,
    ultimoDe: r.emisor === "negocio" ? ("negocio" as const) : ("cliente" as const),
    ultimoAt: r.created_at,
    sinLeer: num(r.sin_leer),
  }));
}
