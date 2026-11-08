import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { esCondicion } from "@/lib/afip-calc";
import { exigirCuentaCorriente } from "@/lib/server/capabilities";
import { assertRole, audit } from "@/lib/server/context";
import type { Cliente, Staff } from "@/lib/types";

export async function listClientesForStaff(staff: Staff): Promise<Cliente[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    cuit: string | null;
    direccion: string | null;
    cuenta_corriente: boolean;
    condicion_iva: string | null;
    activo: boolean;
    user_id: string | null;
    saldo: unknown;
  }>`
    select c.id, c.nombre, c.telefono, c.email, c.cuit, c.direccion, c.cuenta_corriente,
           c.condicion_iva, c.activo, c.user_id,
           coalesce((select sum(monto) from cuenta_movimientos m where m.cliente_id = c.id), 0) as saldo
    from clientes c
    where c.tenant_id = ${staff.tenantId}
    order by lower(c.nombre)
  `;
  const propios: Cliente[] = rows.map(
    (r): Cliente => ({
      id: r.id,
      nombre: r.nombre,
      telefono: r.telefono,
      email: r.email,
      cuit: r.cuit,
      direccion: r.direccion,
      cuentaCorriente: r.cuenta_corriente,
      condicionIva: r.condicion_iva || "consumidor_final",
      activo: r.activo,
      userId: r.user_id,
      saldo: num(r.saldo),
      origen: "puesto",
    }),
  );

  // Compradores de Mercado que ya le compraron a este puesto. Son de solo
  // lectura: viven en mercado_compradores y se ven por sus pedidos
  // (origen='mercado_al_toque'), no en la tabla clientes. Se excluye al que ya
  // está dado de alta como cliente del puesto (mismo email) para no duplicar.
  const compradores = await sql<{ id: string; nombre: string; telefono: string; email: string }>`
    select mc.id, mc.nombre, mc.telefono, mc.email
    from mercado_compradores mc
    join pedidos p on p.comprador_mercado_id = mc.id
    where p.origen = 'mercado_al_toque' and p.tenant_id = ${staff.tenantId}
      and not exists (
        select 1 from clientes c
        where c.tenant_id = ${staff.tenantId}
          and c.email is not null and lower(c.email) = lower(mc.email)
      )
    group by mc.id, mc.nombre, mc.telefono, mc.email
    order by lower(mc.nombre)
  `;
  const deApp: Cliente[] = compradores.map((r): Cliente => ({
    id: `merc:${r.id}`,
    nombre: r.nombre,
    telefono: r.telefono,
    email: r.email,
    cuit: null,
    direccion: null,
    cuentaCorriente: false,
    condicionIva: "consumidor_final",
    activo: true,
    userId: null,
    saldo: 0,
    origen: "mercado",
  }));

  return [...propios, ...deApp].sort((a, b) => a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase()));
}

export async function createClienteForStaff(
  staff: Staff,
  input: { nombre: string; telefono?: string; cuentaCorriente?: boolean },
) {
  assertRole(staff, ["admin"]);
  if (input.cuentaCorriente) await exigirCuentaCorriente(staff);
  const sql = await getSql();
  const id = newId("cli");
  await sql`
    insert into clientes (id, tenant_id, nombre, telefono, cuenta_corriente)
    values (${id}, ${staff.tenantId}, ${input.nombre.trim()}, ${input.telefono ?? null}, ${input.cuentaCorriente ?? false})
  `;
  await audit(staff.tenantId, staff, "alta_cliente", "cliente", { id, cc: input.cuentaCorriente ?? false });
  return { id, nombre: input.nombre.trim() };
}

export async function updateClienteForStaff(
  staff: Staff,
  input: {
    id: string;
    nombre: string;
    telefono?: string;
    cuit?: string;
    direccion?: string;
    cuentaCorriente: boolean;
    condicionIva: string;
    activo: boolean;
  },
) {
  assertRole(staff, ["admin"]);
  if (!esCondicion(input.condicionIva)) throw new Error("Elegí la condición frente al IVA.");
  if (input.cuentaCorriente) await exigirCuentaCorriente(staff);
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update clientes
    set nombre = ${input.nombre.trim()},
        telefono = ${input.telefono?.trim() || null},
        cuit = ${input.cuit?.trim() || null},
        direccion = ${input.direccion?.trim() || null},
        cuenta_corriente = ${input.cuentaCorriente},
        condicion_iva = ${input.condicionIva},
        activo = ${input.activo}
    where id = ${input.id} and tenant_id = ${staff.tenantId}
    returning id
  `;
  if (!rows[0]) throw new Error("Cliente no encontrado.");
  await audit(staff.tenantId, staff, "editar_cliente", "cliente", { id: input.id });
  return { ok: true as const };
}

export async function anotarPagoCuentaForStaff(
  staff: Staff,
  input: { clienteId: string; monto: number; nota?: string },
) {
  assertRole(staff, ["admin"]);
  if (!(input.monto > 0)) throw new Error("El pago tiene que ser mayor a cero.");
  const sql = await getSql();
  const cliente = await sql<{ id: string }>`
    select id from clientes where id = ${input.clienteId} and tenant_id = ${staff.tenantId} limit 1
  `;
  if (!cliente[0]) throw new Error("Cliente no encontrado.");
  await sql`
    insert into cuenta_movimientos (id, tenant_id, cliente_id, tipo, monto, referencia, nota)
    values (
      ${newId("ccm")}, ${staff.tenantId}, ${input.clienteId}, ${"pago"},
      ${-Math.abs(input.monto)}, ${null}, ${input.nota?.trim() || "Pago en el puesto"}
    )
  `;
  await audit(staff.tenantId, staff, "pago_cuenta", "cliente", { id: input.clienteId, monto: input.monto });
  return { ok: true as const };
}

export async function cuentaClienteForStaff(staff: Staff, clienteId: string) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    tipo: string;
    monto: unknown;
    nota: string | null;
    created_at: string;
  }>`
    select id, tipo, monto, nota, created_at::text as created_at
    from cuenta_movimientos
    where tenant_id = ${staff.tenantId} and cliente_id = ${clienteId}
    order by created_at desc
    limit 30
  `;
  const total = await sql<{ saldo: unknown }>`
    select coalesce(sum(monto), 0) as saldo
    from cuenta_movimientos
    where tenant_id = ${staff.tenantId} and cliente_id = ${clienteId}
  `;
  return {
    saldo: num(total[0]?.saldo),
    movimientos: rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      monto: num(r.monto),
      nota: r.nota,
      createdAt: r.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Compradores de la app (Mercado al Toque) — solo admin
// ---------------------------------------------------------------------------

export type CompradorAppRow = {
  userId: string;
  email: string;
  nombre: string;
  telefono: string | null;
  identidad: string;
  clienteId: string | null;
  pedidos: number;
  enLista: boolean;
};

/**
 * Lista los compradores de Mercado al Toque que compraron en este puesto.
 * Devuelve datos enriquecidos desde mercado_compradores + user + clientes.
 */
export async function listarCompradoresAppForStaff(
  staff: Staff,
  busca?: string,
): Promise<{ compradores: CompradorAppRow[] }> {
  assertRole(staff, ["admin"]);
  const q = (busca ?? "").trim().toLowerCase().slice(0, 80);
  const like = `%${q}%`;
  const sql = await getSql();
  const rows = await sql<{
    user_id: string;
    email: string;
    nombre: string;
    telefono: string | null;
    identidad_estado: string;
    cliente_id: string | null;
    pedidos: number;
  }>`
    select u.id as user_id, u.email, c.nombre, c.telefono, c.identidad_estado,
           cl.id as cliente_id,
           (select count(*)::int from pedidos p
              where p.comprador_mercado_id = c.id
                and p.tenant_id = ${staff.tenantId}) as pedidos
    from mercado_compradores c
    join "user" u on u.id = c.user_id
    left join clientes cl on cl.user_id = u.id and cl.tenant_id = ${staff.tenantId}
    where ${q} = ''
       or lower(c.nombre) like ${like}
       or lower(u.email) like ${like}
       or coalesce(c.telefono, '') like ${like}
    order by lower(c.nombre)
    limit 80
  `;
  return {
    compradores: rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      nombre: row.nombre,
      telefono: row.telefono,
      identidad: row.identidad_estado,
      clienteId: row.cliente_id,
      pedidos: Number(row.pedidos),
      enLista: Boolean(row.cliente_id),
    })),
  };
}

export type EstadisticasComprador = {
  pedidos: number;
  total: number;
  cobrados: number;
  enCurso: number;
  anulados: number;
  ultimo: string | null;
  formas: { forma: string; cantidad: number; total: number }[];
};

/**
 * Estadísticas detalladas de un comprador de la app en este puesto.
 */
export async function estadisticasCompradorAppForStaff(
  staff: Staff,
  userId: string,
): Promise<EstadisticasComprador> {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const comprador = await sql<{ id: string }>`
    select id from mercado_compradores where user_id = ${userId} limit 1
  `;
  if (!comprador[0]) throw new Error("Ese comprador no está en la app.");
  const [tot] = await sql<{
    pedidos: unknown;
    total: unknown;
    cobrados: unknown;
    en_curso: unknown;
    anulados: unknown;
    ultimo: string | null;
  }>`
    select count(*)::int as pedidos,
           coalesce(sum(i.cantidad * i.precio_unitario), 0) as total,
           count(*) filter (where p.estado in ('cobrado', 'entregado', 'listo'))::int as cobrados,
           count(*) filter (where p.estado in ('enviado', 'en_preparacion'))::int as en_curso,
           count(*) filter (where p.estado = 'anulado')::int as anulados,
           max(p.created_at)::text as ultimo
    from pedidos p
    left join pedido_items i on i.pedido_id = p.id
    where p.tenant_id = ${staff.tenantId} and p.comprador_mercado_id = ${comprador[0].id}
  `;
  const formas = await sql<{ forma: string; cantidad: unknown; total: unknown }>`
    select coalesce(p.forma_pago, 'sin_pago') as forma, count(*)::int as cantidad,
           coalesce(sum(i.cantidad * i.precio_unitario), 0) as total
    from pedidos p
    left join pedido_items i on i.pedido_id = p.id
    where p.tenant_id = ${staff.tenantId} and p.comprador_mercado_id = ${comprador[0].id}
    group by p.forma_pago
    order by total desc
  `;
  return {
    pedidos: Number(tot?.pedidos ?? 0),
    total: num(tot?.total),
    cobrados: Number(tot?.cobrados ?? 0),
    enCurso: Number(tot?.en_curso ?? 0),
    anulados: Number(tot?.anulados ?? 0),
    ultimo: tot?.ultimo ?? null,
    formas: formas.map((row) => ({
      forma: row.forma,
      cantidad: Number(row.cantidad),
      total: num(row.total),
    })),
  };
}

/**
 * Agrega un comprador de la app a la lista de clientes del puesto.
 * Si ya existe un cliente con ese userId, devuelve el id existente.
 */
export async function sumarCompradorAppForStaff(
  staff: Staff,
  userId: string,
): Promise<{ id: string }> {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{ nombre: string; telefono: string | null; email: string }>`
    select c.nombre, c.telefono, u.email
    from mercado_compradores c
    join "user" u on u.id = c.user_id
    where c.user_id = ${userId}
    limit 1
  `;
  const comprador = rows[0];
  if (!comprador) throw new Error("Ese comprador no está en la app.");
  // Si ya existe un cliente del puesto vinculado a este userId, devolverlo.
  const ya = await sql<{ id: string }>`
    select id from clientes where tenant_id = ${staff.tenantId} and user_id = ${userId} limit 1
  `;
  if (ya[0]) return { id: ya[0].id };
  const id = newId("cli");
  await sql`
    insert into clientes (id, tenant_id, nombre, telefono, email, cuenta_corriente, activo, user_id)
    values (${id}, ${staff.tenantId}, ${comprador.nombre}, ${comprador.telefono}, ${comprador.email}, ${false}, ${true}, ${userId})
  `;
  await audit(staff.tenantId, staff, "alta_cliente_app", "cliente", { id, userId });
  return { id };
}

/**
 * Actualiza los datos editables de un comprador de la app vinculado al puesto.
 * Solo se puede editar si el comprador tiene una ficha de cliente en el puesto.
 */
export async function updateCompradorAppForStaff(
  staff: Staff,
  userId: string,
  input: { nombre: string; telefono?: string; direccion?: string },
): Promise<{ ok: true }> {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  // Verificar que el comprador está vinculado al puesto.
  const cliente = await sql<{ id: string }>`
    select id from clientes
    where tenant_id = ${staff.tenantId} and user_id = ${userId}
    limit 1
  `;
  if (!cliente[0]) throw new Error("Este comprador no está vinculado al puesto.");
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre es obligatorio.");
  await sql`
    update clientes
    set nombre = ${nombre},
        telefono = ${input.telefono?.trim() || null},
        direccion = ${input.direccion?.trim() || null}
    where id = ${cliente[0].id} and tenant_id = ${staff.tenantId}
  `;
  await audit(staff.tenantId, staff, "editar_cliente_app", "cliente", { id: cliente[0].id });
  return { ok: true };
}
