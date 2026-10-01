import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit } from "@/lib/server/context";
import type { FormaPago, Staff } from "@/lib/types";

export async function estadoCajaForStaff(staff: Staff) {
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
}

export async function cerrarCajaForStaff(
  staff: Staff,
  input: { id: string; real: number; notas?: string },
) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const open = await sql<{ id: string; abierto_at: string }>`
    select id, abierto_at::text as abierto_at
    from cierres_caja
    where id = ${input.id} and tenant_id = ${staff.tenantId} and cerrado_at is null
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
  const diferencia = Math.round((input.real - esperado) * 100) / 100;
  await sql.query(
    `update cierres_caja
     set cerrado_at = now(), esperado = $1, real = $2, diferencia = $3, totales = $4::jsonb, notas = $5
     where id = $6 and tenant_id = $7`,
    [
      esperado,
      input.real,
      diferencia,
      JSON.stringify(totales.map((t) => ({ formaPago: t.forma_pago, total: num(t.total), n: num(t.n) }))),
      input.notas ?? null,
      input.id,
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
    real: input.real,
    diferencia,
  });
  await sql`
    insert into cierres_caja (id, tenant_id, usuario_id, abierto_at)
    values (${newId("cje")}, ${staff.tenantId}, ${staff.id}, now())
  `;
  return { diferencia, esperado };
}
