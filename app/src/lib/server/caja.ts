import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit } from "@/lib/server/context";
import { esperadoEnEfectivo, round2 } from "@/lib/server/caja-reglas";
import type { FormaPago, Staff } from "@/lib/types";

type FilaFormaPago = { forma_pago: string; total: unknown; n: unknown };

type TotalForma = { formaPago: FormaPago; total: number; n: number };

function porForma(filas: FilaFormaPago[]): TotalForma[] {
  return filas.map((t) => ({
    formaPago: t.forma_pago as FormaPago,
    total: num(t.total),
    n: num(t.n),
  }));
}

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
  const totales = porForma(
    await sql<FilaFormaPago>`
    select forma_pago, coalesce(sum(monto),0) as total, count(*)::int as n
    from cobros
    where tenant_id = ${staff.tenantId} and anulado = false and created_at >= ${desde}::timestamptz
    group by forma_pago
  `,
  );
  const [egresoRow] = await sql<{ total: unknown; efectivo: unknown }>`
    select coalesce(sum(monto), 0) as total,
           coalesce(sum(monto) filter (where medio = 'efectivo'), 0) as efectivo
    from egresos_caja
    where tenant_id = ${staff.tenantId} and cierre_id = ${open[0].id}
  `;
  const egresos = num(egresoRow?.total ?? 0);
  const egresosEfectivo = num(egresoRow?.efectivo ?? 0);
  const esperado = esperadoEnEfectivo(totales, egresosEfectivo);
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
    egresos,
    egresosEfectivo,
    totales,
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
  const totales = porForma(
    await sql<FilaFormaPago>`
    select forma_pago, coalesce(sum(monto),0) as total, count(*)::int as n
    from cobros
    where tenant_id = ${staff.tenantId} and anulado = false and created_at >= ${open[0].abierto_at}::timestamptz
    group by forma_pago
  `,
  );
  const [egresoRow] = await sql<{ efectivo: unknown }>`
    select coalesce(sum(monto) filter (where medio = 'efectivo'), 0) as efectivo
    from egresos_caja
    where tenant_id = ${staff.tenantId} and cierre_id = ${open[0].id}
  `;
  const esperado = esperadoEnEfectivo(totales, num(egresoRow?.efectivo ?? 0));
  const diferencia = round2(input.real - esperado);
  await sql.query(
    `update cierres_caja
     set cerrado_at = now(), esperado = $1, real = $2, diferencia = $3, totales = $4::jsonb, notas = $5
     where id = $6 and tenant_id = $7`,
    [
      esperado,
      input.real,
      diferencia,
      JSON.stringify(totales),
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
