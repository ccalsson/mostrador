import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole } from "@/lib/server/context";
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
  const sql = await getSql();
  const id = newId("cli");
  await sql`
    insert into clientes (id, tenant_id, nombre, telefono, cuenta_corriente)
    values (${id}, ${staff.tenantId}, ${input.nombre.trim()}, ${input.telefono ?? null}, ${input.cuentaCorriente ?? false})
  `;
  return { id, nombre: input.nombre.trim() };
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
