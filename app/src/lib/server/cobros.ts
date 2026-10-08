import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit, getTenant, loadPedido } from "@/lib/server/context";
import { exigirCuentaCorriente } from "@/lib/server/capabilities";
import { applyStock, hayReserva, soltarReserva } from "@/lib/server/stock";
import type { FormaPago, Staff } from "@/lib/types";

export type CobrarPedidoInput = {
  pedidoId: string;
  clientUuid: string;
  formaPago: FormaPago;
  montoRecibido?: number;
};

export async function cobrarPedidoForStaff(staff: Staff, input: CobrarPedidoInput) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const dup = await sql<{
    id: string;
    monto: unknown;
    vuelto: unknown;
    ticket_id: string | null;
    numero: number | null;
  }>`
    select c.id, c.monto, c.vuelto, t.id as ticket_id, t.numero
    from cobros c
    left join tickets t on t.cobro_id = c.id
    where c.tenant_id = ${staff.tenantId} and c.client_uuid = ${input.clientUuid}
    limit 1
  `;
  if (dup[0]) {
    return {
      cobroId: dup[0].id,
      ticketId: dup[0].ticket_id ?? undefined,
      numero: dup[0].numero ?? 0,
      vuelto: num(dup[0].vuelto),
      total: num(dup[0].monto),
    };
  }
  const pedido = await loadPedido(input.pedidoId, staff.tenantId);
  if (!pedido) throw new Error("Pedido no encontrado.");
  if (pedido.estado === "anulado") throw new Error("El pedido está anulado.");
  if (pedido.estado === "cobrado") throw new Error("El pedido ya está cobrado.");
  if (pedido.items.length === 0) throw new Error("No hay ítems para cobrar.");
  if (input.formaPago === "cuenta_corriente") {
    await exigirCuentaCorriente(staff);
    if (!pedido.clienteId) throw new Error("La cuenta corriente es solo para un cliente cargado.");
    const ficha = await sql<{ cuenta_corriente: boolean }>`
      select cuenta_corriente from clientes
      where id = ${pedido.clienteId} and tenant_id = ${staff.tenantId}
      limit 1
    `;
    if (!ficha[0]?.cuenta_corriente) throw new Error("Este cliente no tiene cuenta corriente.");
  }

  const total = pedido.total;
  const recibido = input.formaPago === "efectivo" ? (input.montoRecibido ?? total) : total;
  if (input.formaPago === "efectivo" && recibido < total) {
    throw new Error("El monto recibido no cubre el total.");
  }
  const vuelto = input.formaPago === "efectivo" ? Math.round((recibido - total) * 100) / 100 : 0;
  const cobroId = newId("cob");
  await sql`
    insert into cobros (
      id, tenant_id, pedido_id, client_uuid, forma_pago, monto, monto_recibido, vuelto, usuario_id
    ) values (
      ${cobroId}, ${staff.tenantId}, ${pedido.id}, ${input.clientUuid}, ${input.formaPago},
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
  if (input.formaPago === "cuenta_corriente" && pedido.clienteId) {
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
    formaPago: input.formaPago,
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
    formaPago: input.formaPago,
  });
  return { cobroId, ticketId, numero, vuelto, total };
}

export async function anularPedidoForStaff(staff: Staff, input: { id: string; motivo: string }) {
  assertRole(staff, ["admin", "cajero"]);
  if (!input.motivo.trim()) throw new Error("La anulación requiere un motivo.");
  const sql = await getSql();
  const pedido = await loadPedido(input.id, staff.tenantId);
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
    motivo: input.motivo.trim(),
  });
  return loadPedido(pedido.id, staff.tenantId);
}

export async function anularCobroForStaff(staff: Staff, input: { id: string; motivo: string }) {
  assertRole(staff, ["admin", "cajero"]);
  if (!input.motivo.trim()) throw new Error("La anulación requiere un motivo.");
  const sql = await getSql();
  const cobro = await sql<{
    id: string;
    pedido_id: string;
    anulado: boolean;
    monto: unknown;
    forma_pago: string;
  }>`
    select id, pedido_id, anulado, monto, forma_pago from cobros
    where id = ${input.id} and tenant_id = ${staff.tenantId}
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
    motivo: input.motivo.trim(),
  });
  return { ok: true as const };
}

export async function getTicketForStaff(staff: Staff, cobroId: string) {
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
}
