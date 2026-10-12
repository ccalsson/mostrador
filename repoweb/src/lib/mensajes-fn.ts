import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { ensureBootstrapped, ensureStaffForUser } from "@/lib/server/bootstrap";
import type { PedidoEstado } from "@/lib/types";

const PAGINA = 30;

export type Mensaje = {
  id: string;
  emisor: "cliente" | "negocio";
  cuerpo: string;
  createdAt: string;
};

type Acceso = {
  lado: "cliente" | "negocio";
  tenantId: string;
  clienteId: string;
  staffId: string | null;
};

async function accesoPedido(userId: string, pedidoId: string): Promise<Acceso> {
  await ensureBootstrapped();
  const sql = await getSql();
  const pedido = await sql<{ cliente_id: string | null; tenant_id: string }>`
    select cliente_id, tenant_id from pedidos where id = ${pedidoId} limit 1
  `;
  const row = pedido[0];
  if (!row?.cliente_id) throw new Error("Este pedido no tiene conversación.");
  const ficha = await sql<{ id: string }>`
    select id from clientes where user_id = ${userId} and activo = true limit 1
  `;
  if (ficha[0]) {
    if (ficha[0].id !== row.cliente_id) throw new Error("Ese pedido no es tuyo.");
    return { lado: "cliente", tenantId: row.tenant_id, clienteId: ficha[0].id, staffId: null };
  }
  const staff = await ensureStaffForUser(userId);
  if (staff.rol !== "admin") throw new Error("No tenés permiso para esta acción.");
  if (staff.tenantId !== row.tenant_id) throw new Error("Ese pedido no es de este puesto.");
  return { lado: "negocio", tenantId: staff.tenantId, clienteId: row.cliente_id, staffId: staff.id };
}

function mapMensaje(r: { id: string; emisor: string; cuerpo: string; created_at: string }): Mensaje {
  return {
    id: r.id,
    emisor: r.emisor === "negocio" ? "negocio" : "cliente",
    cuerpo: r.cuerpo,
    createdAt: r.created_at,
  };
}

export const mensajesDelPedido = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { pedidoId: string; antes?: string | null }) => input)
  .handler(async ({ context, data }) => {
    const acceso = await accesoPedido(context.userId, data.pedidoId);
    const sql = await getSql();
    const ajeno = acceso.lado === "cliente" ? "negocio" : "cliente";
    await sql`
      update pedido_mensajes set leido = true
      where pedido_id = ${data.pedidoId} and emisor = ${ajeno} and leido = false
    `;
    const antes = data.antes?.trim() || null;
    const rows = antes
      ? await sql<{ id: string; emisor: string; cuerpo: string; created_at: string }>`
          select id, emisor, cuerpo, created_at::text as created_at
          from pedido_mensajes
          where pedido_id = ${data.pedidoId} and created_at < ${antes}::timestamptz
          order by created_at desc
          limit ${PAGINA + 1}
        `
      : await sql<{ id: string; emisor: string; cuerpo: string; created_at: string }>`
          select id, emisor, cuerpo, created_at::text as created_at
          from pedido_mensajes
          where pedido_id = ${data.pedidoId}
          order by created_at desc
          limit ${PAGINA + 1}
        `;
    const hayMas = rows.length > PAGINA;
    const pagina = rows.slice(0, PAGINA).map(mapMensaje).reverse();
    return { mensajes: pagina, hayMas };
  });

export const enviarMensajePedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { pedidoId: string; cuerpo: string }) => input)
  .handler(async ({ context, data }) => {
    const cuerpo = data.cuerpo.trim();
    if (!cuerpo) throw new Error("Escribí un mensaje.");
    if (cuerpo.length > 500) throw new Error("El mensaje es muy largo.");
    const acceso = await accesoPedido(context.userId, data.pedidoId);
    const sql = await getSql();
    await sql`
      insert into pedido_mensajes (id, tenant_id, pedido_id, cliente_id, emisor, staff_id, cuerpo, leido)
      values (
        ${newId("msg")}, ${acceso.tenantId}, ${data.pedidoId}, ${acceso.clienteId},
        ${acceso.lado}, ${acceso.staffId}, ${cuerpo}, ${false}
      )
    `;
    try {
      const { publicarMensaje } = await import("@/lib/server/mensajes-vivo");
      publicarMensaje({
        pedidoId: data.pedidoId,
        clienteId: acceso.clienteId,
        tenantId: acceso.tenantId,
      });
    } catch {
      /* el mensaje ya está guardado; sin socket se ve en el próximo sondeo */
    }
    return { ok: true };
  });

export const conversacionesNegocio = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin") throw new Error("No tenés permiso para esta acción.");
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
  });

export const misMensajesPendientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureBootstrapped();
    const sql = await getSql();
    const ficha = await sql<{ id: string }>`
      select id from clientes where user_id = ${context.userId} and activo = true limit 1
    `;
    if (!ficha[0]) return [];
    const rows = await sql<{ pedido_id: string; n: unknown }>`
      select pedido_id, count(*)::int as n
      from pedido_mensajes
      where cliente_id = ${ficha[0].id} and emisor = 'negocio' and leido = false
      group by pedido_id
    `;
    return rows.map((r) => ({ pedidoId: r.pedido_id, n: num(r.n) }));
  });
