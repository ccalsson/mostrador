import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { matchProduct } from "@/lib/server/match";
import { applyStock, hayReserva, reservarLineas, soltarReserva } from "@/lib/server/stock";
import { crearPedidoForStaff, listProductosForStaff, type PedidoLineaInput } from "@/lib/server/catalog-pedidos";
import {
  assertRole,
  audit,
  getTenant,
  loadItems,
  loadPedido,
  loadStaffByUserId,
  mapProducto,
} from "@/lib/server/context";
import { ensureBootstrapped, ensureStaffForUser, seedDemoAccounts } from "@/lib/server/bootstrap";
import type {
  Alerta,
  Cliente,
  FormaPago,
  Pedido,
  PedidoEstado,
  Producto,
  Rol,
  Staff,
} from "@/lib/types";
import { hashPassword } from "better-auth/crypto";

export const prepareDemo = createServerFn({ method: "POST" }).handler(async () => {
  return seedDemoAccounts();
});

export const getSessionStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    const tenant = await getTenant();
    return { staff, tenant };
  });

export const quienSoy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureBootstrapped();
    const tenant = await getTenant();
    const staff = await loadStaffByUserId(context.userId);
    if (staff) return { tipo: "staff" as const, staff, tenant };
    const sql = await getSql();
    const cliente = await sql<{ id: string }>`
      select id from clientes where user_id = ${context.userId} and activo = true limit 1
    `;
    if (cliente[0]) return { tipo: "cliente" as const, tenant };
    const creado = await ensureStaffForUser(context.userId);
    return { tipo: "staff" as const, staff: creado, tenant };
  });

export const listProductos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listProductosForStaff(staff);
  });

export const saveProducto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id?: string;
    nombre: string;
    unidad: Producto["unidad"];
    unidadLabel: string;
    precio: number;
    stockMinimo: number;
    alias: string[];
    activo: boolean;
    stockInicial?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const id = data.id ?? newId("p");
    if (data.id) {
      const prev = await sql<{ precio: unknown; nombre: string }>`
        select precio, nombre from productos where id = ${data.id} and tenant_id = ${staff.tenantId}
      `;
      await sql.query(
        `update productos
         set nombre=$1, unidad=$2, unidad_label=$3, precio=$4, stock_minimo=$5, alias=$6::jsonb, activo=$7, updated_at=now()
         where id=$8 and tenant_id=$9`,
        [
          data.nombre.trim(),
          data.unidad,
          data.unidadLabel.trim(),
          data.precio,
          data.stockMinimo,
          JSON.stringify(data.alias),
          data.activo,
          data.id,
          staff.tenantId,
        ],
      );
      if (prev[0] && num(prev[0].precio) !== data.precio) {
        await audit(staff.tenantId, staff, "cambio_precio", "producto", {
          producto: data.nombre,
          de: num(prev[0].precio),
          a: data.precio,
        });
      }
    } else {
      await sql.query(
        `insert into productos (id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo)
         values ($1,$2,$3,$4,$5,$6,0,$7,$8::jsonb,$9)`,
        [
          id,
          staff.tenantId,
          data.nombre.trim(),
          data.unidad,
          data.unidadLabel.trim(),
          data.precio,
          data.stockMinimo,
          JSON.stringify(data.alias),
          data.activo,
        ],
      );
      await audit(staff.tenantId, staff, "alta_producto", "producto", { id, nombre: data.nombre });
      const inicial = Number(data.stockInicial);
      if (Number.isFinite(inicial) && inicial > 0) {
        await applyStock({
          tenantId: staff.tenantId,
          productoId: id,
          tipo: "ajuste",
          cantidad: inicial,
          referencia: "alta en tablero",
          staff,
        });
      }
    }
    return { id };
  });

export const quitarProducto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const rows = await sql<{ nombre: string }>`
      update productos set activo = false, updated_at = now()
      where id = ${id} and tenant_id = ${staff.tenantId} and activo = true
      returning nombre
    `;
    if (rows[0]) await audit(staff.tenantId, staff, "baja_producto", "producto", { id, nombre: rows[0].nombre });
    return { ok: true };
  });

export const ordenarProductos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ids: string[]) => ids.filter((id) => typeof id === "string" && id.length > 0))
  .handler(async ({ context, data: ids }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    for (let i = 0; i < ids.length; i += 1) {
      await sql`
        update productos set orden = ${i}, updated_at = now()
        where id = ${ids[i]} and tenant_id = ${staff.tenantId}
      `;
    }
    return { ok: true };
  });

export const listClientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      nombre: string;
      telefono: string | null;
      cuenta_corriente: boolean;
    }>`
      select id, nombre, telefono, cuenta_corriente from clientes
      where tenant_id = ${staff.tenantId}
      order by lower(nombre)
    `;
    return rows.map(
      (r): Cliente => ({
        id: r.id,
        nombre: r.nombre,
        telefono: r.telefono,
        cuentaCorriente: r.cuenta_corriente,
      }),
    );
  });

export const createCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; telefono?: string; cuentaCorriente?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const id = newId("cli");
    await sql`
      insert into clientes (id, tenant_id, nombre, telefono, cuenta_corriente)
      values (${id}, ${staff.tenantId}, ${data.nombre.trim()}, ${data.telefono ?? null}, ${data.cuentaCorriente ?? false})
    `;
    return { id, nombre: data.nombre.trim() };
  });

export const crearPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientUuid: string;
    clienteId?: string | null;
    clienteNombre: string;
    nota?: string;
    items: PedidoLineaInput[];
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return crearPedidoForStaff(staff, data);
  });

export const listPedidos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { mine?: boolean; estados?: PedidoEstado[] }) => input ?? {})
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const estados = data.estados;
    let rows: { id: string }[] = [];
    if (data.mine) {
      rows = await sql<{ id: string }>`
        select id from pedidos
        where tenant_id = ${staff.tenantId} and vendedor_id = ${staff.id}
        order by created_at desc
        limit 40
      `;
    } else if (estados && estados.length) {
      rows = await sql.query<{ id: string }>(
        `select id from pedidos
         where tenant_id = $1 and estado = any($2::text[])
         order by created_at desc
         limit 60`,
        [staff.tenantId, estados],
      );
    } else {
      rows = await sql<{ id: string }>`
        select id from pedidos
        where tenant_id = ${staff.tenantId}
        order by created_at desc
        limit 40
      `;
    }
    const out: Pedido[] = [];
    for (const r of rows) {
      const p = await loadPedido(r.id, staff.tenantId);
      if (p) out.push(p);
    }
    return out;
  });

export const getPedido = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    return loadPedido(id, staff.tenantId);
  });

export const updatePedidoEstado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; estado: PedidoEstado }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    await sql`
      update pedidos set estado = ${data.estado}, updated_at = now()
      where id = ${data.id} and tenant_id = ${staff.tenantId}
    `;
    await audit(staff.tenantId, staff, "cambio_estado", "pedido", data);
    return loadPedido(data.id, staff.tenantId);
  });

export const marcarEntregado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero", "vendedor"]);
    const pedido = await loadPedido(id, staff.tenantId);
    if (!pedido) throw new Error("Pedido no encontrado.");
    if (pedido.estado !== "cobrado") throw new Error("Solo se entrega un pedido ya cobrado.");
    const sql = await getSql();
    await sql`
      update pedidos set estado = 'entregado', updated_at = now()
      where id = ${id} and tenant_id = ${staff.tenantId}
    `;
    await audit(staff.tenantId, staff, "entregar", "pedido", { id });
    return { ok: true };
  });

export const updatePedidoItems = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; items: PedidoLineaInput[] }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const pedido = await loadPedido(data.id, staff.tenantId);
    if (!pedido) throw new Error("Pedido no encontrado.");
    if (pedido.estado === "cobrado" || pedido.estado === "anulado") {
      throw new Error("Este pedido ya no se puede editar.");
    }
    const reservado = await hayReserva(staff.tenantId, data.id);
    if (reservado) await soltarReserva(staff.tenantId, data.id);
    await sql`delete from pedido_items where pedido_id = ${data.id}`;
    const productos = await sql<{
      id: string;
      nombre: string;
      unidad: Producto["unidad"];
      unidad_label: string;
      precio: unknown;
      stock: unknown;
      stock_minimo: unknown;
      alias: unknown;
      activo: boolean;
    }>`select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo from productos where tenant_id = ${staff.tenantId}`;
    const byId = new Map(productos.map((p) => [p.id, mapProducto(p)]));
    for (const line of data.items) {
      const prod = byId.get(line.productoId);
      if (!prod || line.cantidad <= 0) continue;
      await sql`
        insert into pedido_items (
          id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
        ) values (
          ${newId("itm")}, ${data.id}, ${prod.id}, ${prod.nombre}, ${line.cantidad},
          ${prod.precio}, ${prod.unidad}, ${prod.unidadLabel}
        )
      `;
    }
    await sql`update pedidos set updated_at = now() where id = ${data.id}`;
    if (reservado) {
      await reservarLineas(
        staff.tenantId,
        data.id,
        data.items.filter((line) => line.cantidad > 0),
      );
    }
    await audit(staff.tenantId, staff, "modificar_pedido", "pedido", { id: data.id });
    return loadPedido(data.id, staff.tenantId);
  });

export const cobrarPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    pedidoId: string;
    clientUuid: string;
    formaPago: FormaPago;
    montoRecibido?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const dup = await sql<{ id: string }>`
      select id from cobros where tenant_id = ${staff.tenantId} and client_uuid = ${data.clientUuid} limit 1
    `;
    if (dup[0]) {
      const t = await sql<{ id: string; numero: number }>`
        select id, numero from tickets where cobro_id = ${dup[0].id} limit 1
      `;
      return { cobroId: dup[0].id, ticketId: t[0]?.id, numero: t[0]?.numero };
    }
    const pedido = await loadPedido(data.pedidoId, staff.tenantId);
    if (!pedido) throw new Error("Pedido no encontrado.");
    if (pedido.estado === "anulado") throw new Error("El pedido está anulado.");
    if (pedido.estado === "cobrado") throw new Error("El pedido ya está cobrado.");
    if (pedido.items.length === 0) throw new Error("No hay ítems para cobrar.");
    if (data.formaPago === "cuenta_corriente") {
      if (!pedido.clienteId) throw new Error("La cuenta corriente es solo para un cliente cargado.");
      const ficha = await sql<{ cuenta_corriente: boolean }>`
        select cuenta_corriente from clientes
        where id = ${pedido.clienteId} and tenant_id = ${staff.tenantId}
        limit 1
      `;
      if (!ficha[0]?.cuenta_corriente) throw new Error("Este cliente no tiene cuenta corriente.");
    }

    const total = pedido.total;
    const recibido =
      data.formaPago === "efectivo" ? (data.montoRecibido ?? total) : total;
    if (data.formaPago === "efectivo" && recibido < total) {
      throw new Error("El monto recibido no cubre el total.");
    }
    const vuelto = data.formaPago === "efectivo" ? Math.round((recibido - total) * 100) / 100 : 0;
    const cobroId = newId("cob");
    await sql`
      insert into cobros (
        id, tenant_id, pedido_id, client_uuid, forma_pago, monto, monto_recibido, vuelto, usuario_id
      ) values (
        ${cobroId}, ${staff.tenantId}, ${pedido.id}, ${data.clientUuid}, ${data.formaPago},
        ${total}, ${recibido}, ${vuelto}, ${staff.id}
      )
    `;
    await sql`
      update pedidos set estado = 'cobrado', updated_at = now()
      where id = ${pedido.id} and tenant_id = ${staff.tenantId}
    `;
    for (const item of pedido.items) {
      const reservado = await hayReserva(staff.tenantId, pedido.id);
      if (!reservado) {
        await applyStock({
          tenantId: staff.tenantId,
          productoId: item.productoId,
          tipo: "venta",
          cantidad: -item.cantidad,
          referencia: cobroId,
          staff,
        });
      }
    }
    if (await hayReserva(staff.tenantId, pedido.id)) {
      await sql`
        delete from stock_movimientos
        where tenant_id = ${staff.tenantId} and referencia = ${pedido.id} and tipo = 'reserva'
      `;
    }
    if (data.formaPago === "cuenta_corriente" && pedido.clienteId) {
      await sql`
        insert into cuenta_movimientos (id, tenant_id, cliente_id, tipo, monto, referencia, nota)
        values (
          ${newId("ccm")}, ${staff.tenantId}, ${pedido.clienteId}, ${"cargo"},
          ${total}, ${cobroId}, ${"Venta en cuenta"}
        )
      `;
    }
    const seq = await sql<{ ultimo: number }>`
      update ticket_seq set ultimo = ultimo + 1 where tenant_id = ${staff.tenantId} returning ultimo
    `;
    const tenant = await getTenant();
    const numero = seq[0]?.ultimo ?? 1;
    const contenido = {
      puesto: tenant.nombre,
      numero,
      fecha: new Date().toISOString(),
      cliente: pedido.clienteNombre,
      items: pedido.items.map((it) => ({
        nombre: it.nombre,
        cantidad: it.cantidad,
        unidad: it.unidadLabel,
        precio: it.precioUnitario,
        subtotal: it.subtotal,
      })),
      total,
      formaPago: data.formaPago,
      recibido,
      vuelto,
      pie: tenant.pieTicket,
    };
    const ticketId = newId("tck");
    await sql.query(
      `insert into tickets (id, cobro_id, tenant_id, numero, contenido)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [ticketId, cobroId, staff.tenantId, numero, JSON.stringify(contenido)],
    );
    await audit(staff.tenantId, staff, "cobro", "cobro", {
      cobroId,
      pedidoId: pedido.id,
      total,
      formaPago: data.formaPago,
    });
    return { cobroId, ticketId, numero, vuelto, total };
  });

export const anularPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    if (!data.motivo.trim()) throw new Error("La anulación requiere un motivo.");
    const sql = await getSql();
    const pedido = await loadPedido(data.id, staff.tenantId);
    if (!pedido) throw new Error("Pedido no encontrado.");
    if (pedido.estado === "anulado") return pedido;
    const cobro = await sql<{ id: string; anulado: boolean }>`
      select id, anulado from cobros where pedido_id = ${pedido.id} and tenant_id = ${staff.tenantId} limit 1
    `;
    if (cobro[0] && !cobro[0].anulado) {
      const factura = await sql<{ id: string }>`
        select id from facturas
        where tenant_id = ${staff.tenantId}
          and cobro_id = ${cobro[0].id}
          and estado = 'autorizada'
          and cbte_tipo in (1, 6, 11)
        limit 1
      `;
      if (factura[0]) {
        throw new Error("Esta venta tiene factura electrónica. Emití la nota de crédito antes de anular.");
      }
      for (const item of pedido.items) {
        await applyStock({
          tenantId: staff.tenantId,
          productoId: item.productoId,
          tipo: "anulacion_venta",
          cantidad: item.cantidad,
          referencia: cobro[0].id,
          staff,
        });
      }
      await sql`
        update cobros set anulado = true
        where id = ${cobro[0].id} and tenant_id = ${staff.tenantId}
      `;
    } else if (await hayReserva(staff.tenantId, pedido.id)) {
      await soltarReserva(staff.tenantId, pedido.id);
    }
    await sql`
      update pedidos set estado = 'anulado', updated_at = now()
      where id = ${pedido.id} and tenant_id = ${staff.tenantId}
    `;
    await audit(staff.tenantId, staff, "anular_pedido", "pedido", {
      id: pedido.id,
      motivo: data.motivo.trim(),
    });
    return loadPedido(pedido.id, staff.tenantId);
  });

export const anularCobro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    if (!data.motivo.trim()) throw new Error("La anulación requiere un motivo.");
    const sql = await getSql();
    const cobro = await sql<{
      id: string;
      pedido_id: string;
      anulado: boolean;
      monto: unknown;
      forma_pago: string;
    }>`
      select id, pedido_id, anulado, monto, forma_pago from cobros
      where id = ${data.id} and tenant_id = ${staff.tenantId}
      limit 1
    `;
    if (!cobro[0]) throw new Error("Ticket no encontrado.");
    if (cobro[0].anulado) throw new Error("Esa venta ya está anulada.");
    const factura = await sql<{ id: string }>`
      select id from facturas
      where tenant_id = ${staff.tenantId}
        and cobro_id = ${cobro[0].id}
        and estado = 'autorizada'
        and cbte_tipo in (1, 6, 11)
      limit 1
    `;
    if (factura[0]) {
      throw new Error("Esta venta tiene factura electrónica. Emití la nota de crédito en ARCA antes de anular.");
    }
    const pedido = await loadPedido(cobro[0].pedido_id, staff.tenantId);
    if (!pedido) throw new Error("Pedido no encontrado.");
    for (const item of pedido.items) {
      await applyStock({
        tenantId: staff.tenantId,
        productoId: item.productoId,
        tipo: "anulacion_venta",
        cantidad: item.cantidad,
        referencia: cobro[0].id,
        staff,
      });
    }
    await sql`
      update cobros set anulado = true
      where id = ${cobro[0].id} and tenant_id = ${staff.tenantId}
    `;
    await sql`
      update pedidos set estado = 'anulado', updated_at = now()
      where id = ${pedido.id} and tenant_id = ${staff.tenantId}
    `;
    if (cobro[0].forma_pago === "cuenta_corriente" && pedido.clienteId) {
      await sql`
        insert into cuenta_movimientos (id, tenant_id, cliente_id, tipo, monto, referencia, nota)
        values (
          ${newId("ccm")}, ${staff.tenantId}, ${pedido.clienteId}, ${"reverso"},
          ${-num(cobro[0].monto)}, ${cobro[0].id}, ${"Anulación de venta"}
        )
      `;
    }
    await audit(staff.tenantId, staff, "anular_cobro", "cobro", {
      id: cobro[0].id,
      pedidoId: pedido.id,
      motivo: data.motivo.trim(),
    });
    return { ok: true };
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((cobroId: string) => cobroId)
  .handler(async ({ context, data: cobroId }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      numero: number;
      contenido: unknown;
      created_at: string;
    }>`
      select id, numero, contenido, created_at::text as created_at
      from tickets
      where cobro_id = ${cobroId} and tenant_id = ${staff.tenantId}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const contenido =
      typeof row.contenido === "string" ? JSON.parse(row.contenido) : row.contenido;
    return { id: row.id, numero: row.numero, contenido, createdAt: row.created_at };
  });

export const dashboardResumen = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { dias?: number } | undefined) => {
    const raw = input?.dias;
    const dias = raw === 1 || raw === 30 ? raw : 7;
    return { dias };
  })
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const dias = data.dias;
    const span = await sql.query<{ total: unknown; n: unknown; prev_total: unknown; prev_n: unknown }>(
      `select
         coalesce(sum(monto) filter (where created_at::date >= current_date - ($2::int - 1)), 0) as total,
         count(*) filter (where created_at::date >= current_date - ($2::int - 1))::int as n,
         coalesce(sum(monto) filter (
           where created_at::date < current_date - ($2::int - 1)
             and created_at::date >= current_date - ($2::int * 2 - 1)
         ), 0) as prev_total,
         count(*) filter (
           where created_at::date < current_date - ($2::int - 1)
             and created_at::date >= current_date - ($2::int * 2 - 1)
         )::int as prev_n
       from cobros
       where tenant_id = $1
         and anulado = false
         and created_at::date >= current_date - ($2::int * 2 - 1)`,
      [staff.tenantId, dias],
    );
    const colaCount = await sql<{ n: unknown }>`
      select count(*)::int as n from pedidos
      where tenant_id = ${staff.tenantId} and estado in ('enviado','en_preparacion','listo')
    `;
    const series =
      dias === 1
        ? await sql.query<{ dia: string; total: unknown; n: unknown }>(
            `select to_char(h, 'YYYY-MM-DD HH24') as dia,
                    coalesce((select sum(monto) from cobros c
                      where c.tenant_id = $1
                        and c.anulado = false
                        and to_char(c.created_at, 'YYYY-MM-DD HH24') = to_char(h, 'YYYY-MM-DD HH24')), 0) as total,
                    coalesce((select count(*) from cobros c
                      where c.tenant_id = $1
                        and c.anulado = false
                        and to_char(c.created_at, 'YYYY-MM-DD HH24') = to_char(h, 'YYYY-MM-DD HH24')), 0)::int as n
             from generate_series(
               current_date + time '06:00',
               current_date + time '20:00',
               interval '1 hour'
             ) as h`,
            [staff.tenantId],
          )
        : await sql.query<{ dia: string; total: unknown; n: unknown }>(
            `select to_char(d::date, 'YYYY-MM-DD') as dia,
                    coalesce((select sum(monto) from cobros c where c.tenant_id = $1 and c.anulado = false and c.created_at::date = d::date), 0) as total,
                    coalesce((select count(*) from cobros c where c.tenant_id = $1 and c.anulado = false and c.created_at::date = d::date), 0)::int as n
             from generate_series(current_date - ($2::int - 1), current_date, interval '1 day') as d`,
            [staff.tenantId, dias],
          );
    const top = await sql.query<{ nombre: string; cantidad: unknown; total: unknown }>(
      `select i.nombre_snapshot as nombre,
              sum(i.cantidad) as cantidad,
              sum(i.cantidad * i.precio_unitario) as total
       from pedido_items i
       join pedidos p on p.id = i.pedido_id
       where p.tenant_id = $1 and p.estado in ('cobrado', 'entregado')
         and p.created_at::date >= current_date - ($2::int - 1)
       group by i.nombre_snapshot
       order by sum(i.cantidad * i.precio_unitario) desc
       limit 8`,
      [staff.tenantId, dias],
    );
    const formas = await sql.query<{ forma_pago: string; total: unknown; n: unknown }>(
      `select forma_pago, coalesce(sum(monto),0) as total, count(*)::int as n
       from cobros
       where tenant_id = $1 and anulado = false and created_at::date >= current_date - ($2::int - 1)
       group by forma_pago
       order by sum(monto) desc`,
      [staff.tenantId, dias],
    );
    const movimientos = await sql.query<{
      id: string;
      monto: unknown;
      forma_pago: string;
      created_at: string;
      cliente: string;
      numero: number | null;
      productos: string;
    }>(
      `select c.id, c.monto, c.forma_pago, c.created_at::text as created_at,
              coalesce(p.cliente_nombre, 'Mostrador') as cliente, t.numero,
              coalesce((
                select string_agg(distinct i.nombre_snapshot, ', ')
                from pedido_items i
                where i.pedido_id = c.pedido_id
              ), '') as productos
       from cobros c
       left join pedidos p on p.id = c.pedido_id
       left join tickets t on t.cobro_id = c.id
       where c.tenant_id = $1 and c.anulado = false and c.created_at::date >= current_date - ($2::int - 1)
       order by c.created_at desc
       limit 40`,
      [staff.tenantId, dias],
    );
    const cola = await sql<{
      id: string;
      cliente: string;
      estado: string;
      created_at: string;
      total: unknown;
      vendedor: string | null;
    }>`
      select p.id, p.cliente_nombre as cliente, p.estado, p.created_at::text as created_at,
             coalesce((select sum(i.cantidad * i.precio_unitario) from pedido_items i where i.pedido_id = p.id), 0) as total,
             s.nombre as vendedor
      from pedidos p
      left join staff s on s.id = p.vendedor_id
      where p.tenant_id = ${staff.tenantId} and p.estado in ('enviado','en_preparacion','listo')
      order by p.created_at asc
      limit 8
    `;
    const ventas = num(span[0]?.total);
    const tickets = num(span[0]?.n);
    return {
      dias,
      ventas,
      ventasPrev: num(span[0]?.prev_total),
      tickets,
      ticketsPrev: num(span[0]?.prev_n),
      ticketPromedio: tickets ? Math.round(ventas / tickets) : 0,
      enCola: num(colaCount[0]?.n),
      series: series.map((s) => ({ dia: s.dia, total: num(s.total), n: num(s.n) })),
      top: top.map((t) => ({ nombre: t.nombre, cantidad: num(t.cantidad), total: num(t.total) })),
      formas: formas.map((f) => ({
        formaPago: f.forma_pago as FormaPago,
        total: num(f.total),
        n: num(f.n),
      })),
      movimientos: movimientos.map((m) => ({
        id: m.id,
        monto: num(m.monto),
        formaPago: m.forma_pago as FormaPago,
        createdAt: m.created_at,
        cliente: m.cliente,
        numero: m.numero == null ? null : num(m.numero),
        productos: m.productos,
      })),
      cola: cola.map((p) => ({
        id: p.id,
        cliente: p.cliente,
        estado: p.estado,
        createdAt: p.created_at,
        total: num(p.total),
        vendedor: p.vendedor,
      })),
    };
  });

export const listAlertas = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      tipo: string;
      mensaje: string;
      leida: boolean;
      created_at: string;
    }>`
      select id, tipo, mensaje, leida, created_at::text as created_at
      from alertas
      where tenant_id = ${staff.tenantId}
      order by leida asc, created_at desc
      limit 30
    `;
    return rows.map(
      (r): Alerta => ({
        id: r.id,
        tipo: r.tipo,
        mensaje: r.mensaje,
        leida: r.leida,
        createdAt: r.created_at,
      }),
    );
  });

export const marcarAlertaLeida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    await sql`update alertas set leida = true where id = ${id} and tenant_id = ${staff.tenantId}`;
    return { ok: true };
  });

export const listUsuarios = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    return sql<{
      id: string;
      nombre: string;
      email: string;
      rol: Rol;
      activo: boolean;
      ultimo_login: string | null;
    }>`
      select id, nombre, email, rol, activo, ultimo_login::text as ultimo_login
      from staff
      where tenant_id = ${staff.tenantId}
      order by nombre
    `;
  });

export const createUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; email: string; password: string; rol: Rol }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    const exists = await sql<{ id: string }>`select id from "user" where email = ${email} limit 1`;
    if (exists[0]) throw new Error("Ya existe un usuario con ese email.");
    const userId = newId("usr").replace("usr_", "");
    const now = new Date().toISOString();
    await sql`
      insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values (${userId}, ${data.nombre.trim()}, ${email}, ${true}, ${now}::timestamptz, ${now}::timestamptz)
    `;
    const hash = await hashPassword(data.password);
    await sql`
      insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${newId("acc").replace("acc_", "")}, ${email}, ${"credential"}, ${userId}, ${hash}, ${now}::timestamptz, ${now}::timestamptz)
    `;
    await sql`
      insert into staff (id, tenant_id, user_id, nombre, email, rol, activo)
      values (${newId("stf")}, ${staff.tenantId}, ${userId}, ${data.nombre.trim()}, ${email}, ${data.rol}, ${true})
    `;
    await audit(staff.tenantId, staff, "alta_usuario", "staff", { email, rol: data.rol });
    return { ok: true };
  });

export const toggleUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; activo: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    await sql`
      update staff set activo = ${data.activo}
      where id = ${data.id} and tenant_id = ${staff.tenantId}
    `;
    await audit(staff.tenantId, staff, "cambiar_usuario", "staff", data);
    return { ok: true };
  });

export const listAuditoria = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      usuario_nombre: string | null;
      accion: string;
      entidad: string;
      detalle: unknown;
      created_at: string;
    }>`
      select id, usuario_nombre, accion, entidad, detalle, created_at::text as created_at
      from auditoria
      where tenant_id = ${staff.tenantId}
      order by created_at desc
      limit 80
    `;
    return rows.map((r) => ({
      id: r.id,
      usuarioNombre: r.usuario_nombre,
      accion: r.accion,
      entidad: r.entidad,
      detalle:
        typeof r.detalle === "string" ? r.detalle : JSON.stringify(r.detalle ?? {}),
      createdAt: r.created_at,
    }));
  });

export const estadoCaja = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    let open = await sql<{
      id: string;
      abierto_at: string;
      usuario_id: string;
    }>`
      select id, abierto_at::text as abierto_at, usuario_id
      from cierres_caja
      where tenant_id = ${staff.tenantId} and cerrado_at is null
      order by abierto_at desc
      limit 1
    `;
    if (!open[0]) {
      const id = newId("cje");
      await sql`
        insert into cierres_caja (id, tenant_id, usuario_id, abierto_at)
        values (${id}, ${staff.tenantId}, ${staff.id}, now())
      `;
      open = await sql<{ id: string; abierto_at: string; usuario_id: string }>`
        select id, abierto_at::text as abierto_at, usuario_id from cierres_caja where id = ${id}
      `;
    }
    const desde = open[0].abierto_at;
    const totales = await sql<{ forma_pago: string; total: unknown; n: unknown }>`
      select forma_pago, coalesce(sum(monto),0) as total, count(*)::int as n
      from cobros
      where tenant_id = ${staff.tenantId} and anulado = false and created_at >= ${desde}::timestamptz
      group by forma_pago
    `;
    const esperado = totales.reduce((acc, t) => acc + num(t.total), 0);
    const ultimos = await sql<{
      id: string;
      monto: unknown;
      forma_pago: string;
      created_at: string;
      cliente: string;
      numero: number | null;
      factura_id: string | null;
      cae: string | null;
    }>`
      select c.id, c.monto, c.forma_pago, c.created_at::text as created_at,
             coalesce(p.cliente_nombre, 'Mostrador') as cliente, t.numero,
             f.id as factura_id, f.cae
      from cobros c
      left join pedidos p on p.id = c.pedido_id
      left join tickets t on t.cobro_id = c.id
      left join facturas f
        on f.cobro_id = c.id
       and f.tenant_id = c.tenant_id
       and f.estado = 'autorizada'
       and f.cbte_tipo in (1, 6, 11)
      where c.tenant_id = ${staff.tenantId} and c.anulado = false and c.created_at >= ${desde}::timestamptz
      order by c.created_at desc
      limit 12
    `;
    return {
      id: open[0].id,
      abiertoAt: open[0].abierto_at,
      esperado,
      totales: totales.map((t) => ({
        formaPago: t.forma_pago as FormaPago,
        total: num(t.total),
        n: num(t.n),
      })),
      ultimos: ultimos.map((u) => ({
        id: u.id,
        monto: num(u.monto),
        formaPago: u.forma_pago as FormaPago,
        createdAt: u.created_at,
        cliente: u.cliente,
        numero: u.numero == null ? null : num(u.numero),
        facturaId: u.factura_id,
        cae: u.cae,
      })),
    };
  });

export const cerrarCaja = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; real: number; notas?: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const open = await sql<{ id: string; abierto_at: string }>`
      select id, abierto_at::text as abierto_at
      from cierres_caja
      where id = ${data.id} and tenant_id = ${staff.tenantId} and cerrado_at is null
      limit 1
    `;
    if (!open[0]) throw new Error("No hay una caja abierta.");
    const totales = await sql<{ forma_pago: string; total: unknown; n: unknown }>`
      select forma_pago, coalesce(sum(monto),0) as total, count(*)::int as n
      from cobros
      where tenant_id = ${staff.tenantId} and anulado = false and created_at >= ${open[0].abierto_at}::timestamptz
      group by forma_pago
    `;
    const esperado = totales.reduce((acc, t) => acc + num(t.total), 0);
    const diferencia = Math.round((data.real - esperado) * 100) / 100;
    await sql.query(
      `update cierres_caja
       set cerrado_at = now(), esperado = $1, real = $2, diferencia = $3, totales = $4::jsonb, notas = $5
       where id = $6 and tenant_id = $7`,
      [
        esperado,
        data.real,
        diferencia,
        JSON.stringify(totales.map((t) => ({ formaPago: t.forma_pago, total: num(t.total), n: num(t.n) }))),
        data.notas ?? null,
        data.id,
        staff.tenantId,
      ],
    );
    if (diferencia !== 0) {
      await sql`
        insert into alertas (id, tenant_id, tipo, mensaje, leida)
        values (
          ${newId("alr")}, ${staff.tenantId}, ${"caja_diferencia"},
          ${`Cierre de caja con diferencia de ${diferencia}.`}, ${false}
        )
      `;
    }
    await audit(staff.tenantId, staff, "cierre_caja", "caja", {
      esperado,
      real: data.real,
      diferencia,
    });
    await sql`
      insert into cierres_caja (id, tenant_id, usuario_id, abierto_at)
      values (${newId("cje")}, ${staff.tenantId}, ${staff.id}, now())
    `;
    return { diferencia, esperado };
  });


export const ajustarStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { productoId: string; cantidad: number; tipo: "ajuste" | "merma"; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const signed = data.tipo === "merma" ? -Math.abs(data.cantidad) : data.cantidad;
    await applyStock({
      tenantId: staff.tenantId,
      productoId: data.productoId,
      tipo: data.tipo,
      cantidad: signed,
      referencia: data.motivo,
      staff,
    });
    await audit(staff.tenantId, staff, data.tipo, "stock", data);
    return { ok: true };
  });

export const crearRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    proveedor?: string;
    proveedorId?: string;
    fuente: "csv" | "foto" | "manual" | "pdf";
    archivoNombre?: string;
    lineas: { descripcion: string; cantidad: number; precio?: number }[];
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const id = newId("rem");
    let proveedor = data.proveedor?.trim() || null;
    let proveedorId: string | null = null;
    if (data.proveedorId) {
      const prov = await sql<{ nombre: string }>`
        select nombre from proveedores
        where id = ${data.proveedorId} and tenant_id = ${staff.tenantId} and activo = true
        limit 1
      `;
      if (!prov[0]) throw new Error("Elegí un proveedor activo.");
      proveedor = prov[0].nombre;
      proveedorId = data.proveedorId;
    }
    await sql`
      insert into remitos (id, tenant_id, proveedor, proveedor_id, fuente, estado, archivo_nombre)
      values (${id}, ${staff.tenantId}, ${proveedor}, ${proveedorId}, ${data.fuente}, ${"procesado"}, ${data.archivoNombre ?? null})
    `;
    const productosRows = await sql<{
      id: string;
      nombre: string;
      unidad: Producto["unidad"];
      unidad_label: string;
      precio: unknown;
      stock: unknown;
      stock_minimo: unknown;
      alias: unknown;
      activo: boolean;
    }>`select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo from productos where tenant_id = ${staff.tenantId} and activo = true`;
    const productos = productosRows.map(mapProducto);
    for (const line of data.lineas) {
      const match = matchProduct(line.descripcion, productos);
      await sql`
        insert into remito_items (
          id, remito_id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
        ) values (
          ${newId("rit")}, ${id}, ${line.descripcion}, ${match.producto?.id ?? null},
          ${line.cantidad}, ${line.precio ?? null}, ${match.score}, ${false}
        )
      `;
    }
    return { id };
  });

export const getRemito = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const rem = await sql<{
      id: string;
      proveedor: string | null;
      proveedor_id: string | null;
      fuente: string;
      estado: string;
      archivo_nombre: string | null;
      created_at: string;
    }>`
      select id, proveedor, proveedor_id, fuente, estado, archivo_nombre, created_at::text as created_at
      from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
    `;
    if (!rem[0]) return null;
    const items = await sql<{
      id: string;
      descripcion_original: string;
      producto_id: string | null;
      cantidad: unknown;
      precio: unknown;
      confianza_match: unknown;
      confirmado: boolean;
    }>`
      select id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
      from remito_items where remito_id = ${id} order by descripcion_original
    `;
    return {
      ...rem[0],
      items: items.map((it) => ({
        id: it.id,
        descripcionOriginal: it.descripcion_original,
        productoId: it.producto_id,
        cantidad: num(it.cantidad),
        precio: it.precio == null ? null : num(it.precio),
        confianza: num(it.confianza_match),
        confirmado: it.confirmado,
      })),
    };
  });

export const listRemitos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    return sql<{
      id: string;
      proveedor: string | null;
      fuente: string;
      estado: string;
      created_at: string;
    }>`
      select id, proveedor, fuente, estado, created_at::text as created_at
      from remitos where tenant_id = ${staff.tenantId}
      order by created_at desc
      limit 30
    `;
  });

export const actualizarRemitoItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; productoId: string | null; cantidad: number; confirmado: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    await sql`
      update remito_items
      set producto_id = ${data.productoId}, cantidad = ${data.cantidad}, confirmado = ${data.confirmado}
      where id = ${data.id}
    `;
    return { ok: true };
  });

export const confirmarRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const rem = await sql<{ estado: string }>`
      select estado from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
    `;
    if (!rem[0]) throw new Error("Remito no encontrado.");
    if (rem[0].estado === "confirmado") return { ok: true };
    const items = await sql<{ producto_id: string | null; cantidad: unknown; confirmado: boolean }>`
      select producto_id, cantidad, confirmado from remito_items where remito_id = ${id}
    `;
    const confirmed = items.filter((i) => i.confirmado && i.producto_id);
    if (confirmed.length === 0) throw new Error("Confirmá al menos una línea para ingresar stock.");
    for (const item of confirmed) {
      if (!item.producto_id) continue;
      await applyStock({
        tenantId: staff.tenantId,
        productoId: item.producto_id,
        tipo: "entrada_remito",
        cantidad: num(item.cantidad),
        referencia: id,
        staff,
      });
    }
    await sql`
      update remitos set estado = 'confirmado', confirmado_at = now(), confirmado_por = ${staff.id}
      where id = ${id}
    `;
    await audit(staff.tenantId, staff, "confirmar_remito", "remito", {
      id,
      lineas: confirmed.length,
    });
    return { ok: true, lineas: confirmed.length };
  });

export const parseRemitoVision = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { imageBase64: string; mimeType: string }) => input)
  .handler(async ({ context, data }) => {
    await ensureStaffForUser(context.userId);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "El lector de fotos no está disponible en este entorno." };
    }
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Extraé las líneas de este remito mayorista de frutas y verduras. Devolvé SOLO JSON: {"proveedor": string|null, "lineas":[{"descripcion":string,"cantidad":number,"precio":number|null}]}. Cantidad en bultos/cajones/kg según el papel. Sin markdown.',
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${data.mimeType};base64,${data.imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `No se pudo leer la foto (${res.status}).` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = body.choices[0]?.message.content ?? "";
    const jsonText = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(jsonText) as {
        proveedor?: string | null;
        lineas: { descripcion: string; cantidad: number; precio?: number | null }[];
      };
      return { ok: true as const, proveedor: parsed.proveedor ?? null, lineas: parsed.lineas ?? [] };
    } catch {
      return { ok: false as const, error: "No pude interpretar el remito. Cargalo a mano." };
    }
  });

