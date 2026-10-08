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
