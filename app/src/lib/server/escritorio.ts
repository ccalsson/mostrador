import { getSql } from "@/lib/db";
import { assertRole } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (v && typeof v === "object" && "toFloat" in v) return Number((v as { toFloat: () => number }).toFloat());
  return Number(v) || 0;
}

async function puedeAparecer(casaId: string, config: unknown): Promise<{ visible: boolean }> {
  if (!config || typeof config !== "object") return { visible: false };
  const cfg = config as Record<string, unknown>;
  const mercado = cfg.mercado as Record<string, unknown> | undefined;
  if (!mercado) return { visible: false };
  return { visible: Boolean(mercado.visible) };
}

export async function escritorioDuenoForStaff(staff: Staff) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();

  const [marca] = await sql<{ config: unknown }>`
    select config from tenants where id = ${staff.casaId} limit 1
  `;
  const presencia = await puedeAparecer(staff.casaId, marca?.config);

  const cobros = await sql<{ dia: string; total: unknown }>`
    select to_char(d::date, 'YYYY-MM-DD') as dia, coalesce(sum(c.monto), 0) as total
    from generate_series(current_date - 13, current_date, interval '1 day') as d
    left join cobros c
      on c.tenant_id = ${staff.tenantId}
     and c.anulado = false
     and c.created_at::date = d::date
    group by d::date
    order by d::date
  `;

  const costos = await sql<{ dia: string; total: unknown }>`
    select to_char(r.confirmado_at::date, 'YYYY-MM-DD') as dia,
           coalesce(sum(i.cantidad * i.precio), 0) as total
    from remitos r
    join remito_items i on i.remito_id = r.id and i.confirmado and i.precio is not null
    where r.tenant_id = ${staff.tenantId}
      and r.estado = 'confirmado'
      and r.confirmado_at::date >= current_date - 13
    group by r.confirmado_at::date
  `;

  const [huecos] = await sql<{ n: unknown }>`
    select count(*)::int as n
    from remitos r
    join remito_items i on i.remito_id = r.id and i.confirmado and i.precio is null
    where r.tenant_id = ${staff.tenantId}
      and r.estado = 'confirmado'
      and r.confirmado_at::date >= current_date - 13
  `;

  const entradas = await sql<{ id: string; proveedor: string | null; cuando: string; costo: unknown; lineas: unknown }>`
    select r.id, r.proveedor, r.confirmado_at::text as cuando,
           coalesce(sum(i.cantidad * i.precio) filter (where i.precio is not null), 0) as costo,
           count(i.id)::int as lineas
    from remitos r
    join remito_items i on i.remito_id = r.id and i.confirmado
    where r.tenant_id = ${staff.tenantId} and r.estado = 'confirmado'
    group by r.id, r.proveedor, r.confirmado_at
    order by r.confirmado_at desc
    limit 8
  `;

  const deudas = await sql<{ id: string; nombre: string; saldo: unknown }>`
    select c.id, c.nombre, coalesce(sum(m.monto), 0) as saldo
    from clientes c
    left join cuenta_movimientos m on m.cliente_id = c.id and m.tenant_id = c.tenant_id
    where c.tenant_id = ${staff.tenantId} and c.activo = true
    group by c.id, c.nombre
    having coalesce(sum(m.monto), 0) > 0
    order by saldo desc
    limit 40
  `;

  const cierres = await sql<{
    id: string;
    abierto_at: string;
    cerrado_at: string;
    esperado: unknown;
    real: unknown;
    diferencia: unknown;
    notas: string | null;
    nombre: string | null;
  }>`
    select c.id, c.abierto_at::text as abierto_at, c.cerrado_at::text as cerrado_at,
           c.esperado, c.real, c.diferencia, c.notas, s.nombre
    from cierres_caja c
    left join staff s on s.id = c.usuario_id
    where c.tenant_id = ${staff.tenantId} and c.cerrado_at is not null
    order by c.cerrado_at desc
    limit 30
  `;

  const publicados = await sql<{ id: string; nombre: string; precio: unknown; stock: unknown; unidad_label: string }>`
    select id, nombre, precio, stock, unidad_label
    from productos
    where tenant_id = ${staff.tenantId} and activo = true and publicado_online = true
    order by lower(nombre)
  `;

  const [ocultos] = await sql<{ n: unknown }>`
    select count(*)::int as n
    from productos
    where tenant_id = ${staff.tenantId} and activo = true and publicado_online = false
  `;

  const costoPorDia = new Map(costos.map((row) => [String(row.dia).slice(0, 10), num(row.total)]));
  const serie = cobros.map((row) => {
    const dia = String(row.dia).slice(0, 10);
    return { dia, cobrado: num(row.total), costo: costoPorDia.get(dia) ?? 0 };
  });
  const ultimos = serie.slice(-7);
  const cobrado = ultimos.reduce((acc, row) => acc + row.cobrado, 0);
  const costo = ultimos.reduce((acc, row) => acc + row.costo, 0);

  return {
    puestoVisible: presencia.visible,
    margen: {
      cobrado,
      costo,
      diferencia: cobrado - costo,
      sinPrecio: num(huecos?.n),
      serie,
      entradas: entradas.map((row) => ({
        id: row.id,
        proveedor: row.proveedor || "Sin proveedor",
        cuando: row.cuando,
        costo: num(row.costo),
        lineas: num(row.lineas),
      })),
    },
    deudas: deudas.map((row) => ({ id: row.id, nombre: row.nombre, saldo: num(row.saldo) })),
    cierres: cierres.map((row) => ({
      id: row.id,
      abiertoAt: row.abierto_at,
      cerradoAt: row.cerrado_at,
      esperado: num(row.esperado),
      real: num(row.real),
      diferencia: num(row.diferencia),
      notas: row.notas ?? "",
      quien: row.nombre ?? "Sin nombre",
    })),
    lista: {
      ocultos: num(ocultos?.n),
      productos: publicados.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        precio: num(row.precio),
        stock: num(row.stock),
        unidad: row.unidad_label,
      })),
    },
  };
}
