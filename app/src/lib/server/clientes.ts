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
