import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

export async function listEgresosForStaff(
  staff: Staff,
  input: { cierreId?: string },
) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();

  if (input.cierreId) {
    const rows = await sql<{
      id: string;
      monto: unknown;
      concepto: string;
      categoria: string;
      usuario_id: string;
      creado_at: string;
      usuario_nombre: string;
    }>`
      select e.id, e.monto, e.concepto, e.categoria, e.usuario_id, e.creado_at::text as creado_at,
             coalesce(s.nombre, 'Sin nombre') as usuario_nombre
      from egresos_caja e
      left join staff s on s.id = e.usuario_id
      where e.tenant_id = ${staff.tenantId} and e.cierre_id = ${input.cierreId}
      order by e.creado_at desc
    `;
    return rows.map((r) => ({
      id: r.id,
      monto: num(r.monto),
      concepto: r.concepto,
      categoria: r.categoria,
      usuarioId: r.usuario_id,
      usuarioNombre: r.usuario_nombre,
      creadoAt: r.creado_at,
    }));
  }

  const open = await sql<{ id: string }>`
    select id from cierres_caja
    where tenant_id = ${staff.tenantId} and cerrado_at is null
    order by abierto_at desc limit 1
  `;
  if (!open[0]) return [];

  const rows = await sql<{
    id: string;
    monto: unknown;
    concepto: string;
    categoria: string;
    usuario_id: string;
    creado_at: string;
    usuario_nombre: string;
  }>`
    select e.id, e.monto, e.concepto, e.categoria, e.usuario_id, e.creado_at::text as creado_at,
           coalesce(s.nombre, 'Sin nombre') as usuario_nombre
    from egresos_caja e
    left join staff s on s.id = e.usuario_id
    where e.tenant_id = ${staff.tenantId} and e.cierre_id = ${open[0].id}
    order by e.creado_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    monto: num(r.monto),
    concepto: r.concepto,
    categoria: r.categoria,
    usuarioId: r.usuario_id,
    usuarioNombre: r.usuario_nombre,
    creadoAt: r.creado_at,
  }));
}

export async function createEgresoForStaff(
  staff: Staff,
  input: { monto: number; concepto: string; categoria?: string },
) {
  assertRole(staff, ["admin", "cajero"]);
  if (input.monto <= 0) throw new Error("El monto debe ser mayor a cero.");
  const concepto = input.concepto.trim();
  if (!concepto) throw new Error("El concepto es obligatorio.");
  if (concepto.length > 200) throw new Error("El concepto es demasiado largo.");

  const sql = await getSql();
  const open = await sql<{ id: string }>`
    select id from cierres_caja
    where tenant_id = ${staff.tenantId} and cerrado_at is null
    order by abierto_at desc limit 1
  `;
  if (!open[0]) throw new Error("No hay una caja abierta.");

  const id = newId("egr");
  await sql`
    insert into egresos_caja (id, tenant_id, cierre_id, monto, concepto, categoria, usuario_id)
    values (${id}, ${staff.tenantId}, ${open[0].id}, ${input.monto}, ${concepto}, ${input.categoria ?? "gasto"}, ${staff.id})
  `;
  await audit(staff.tenantId, staff, "alta_egreso", "caja", {
    id,
    monto: input.monto,
    concepto,
  });
  return { id, ok: true as const };
}

export async function anularEgresoForStaff(
  staff: Staff,
  input: { id: string },
) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const rows = await sql<{ id: string; cierre_id: string; usuario_id: string }>`
    select e.id, e.cierre_id, e.usuario_id
    from egresos_caja e
    join cierres_caja c on c.id = e.cierre_id
    where e.id = ${input.id} and e.tenant_id = ${staff.tenantId}
      and c.cerrado_at is null
    limit 1
  `;
  if (!rows[0]) throw new Error("Egreso no encontrado o la caja ya está cerrada.");
  if (staff.rol !== "admin" && rows[0].usuario_id !== staff.id) {
    throw new Error("Solo podés anular tus propios egresos.");
  }
  await sql`delete from egresos_caja where id = ${input.id}`;
  await audit(staff.tenantId, staff, "anular_egreso", "caja", { id: input.id });
  return { ok: true as const };
}
