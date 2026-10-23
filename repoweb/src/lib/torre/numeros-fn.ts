import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";

export const numerosDeNegocios = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { mes?: number; anio?: number } | undefined) => {
    const now = new Date();
    const mes = input?.mes ?? now.getMonth() + 1;
    const anio = input?.anio ?? now.getFullYear();
    if (mes < 1 || mes > 12) throw new Error("Mes invalido.");
    if (anio < 2020 || anio > 2100) throw new Error("Anio invalido.");
    return { mes, anio };
  })
  .handler(async ({ context, data }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const { mes, anio } = data;
    const inicio = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const rows = await sql<{
      negocio: string;
      sucursal: string;
      es_matriz: boolean;
      ventas: unknown;
      tickets: unknown;
      egresos: unknown;
      mercaderia: unknown;
    }>`
      select st.name as negocio,
             coalesce(s.nombre, tn.nombre) as sucursal,
             coalesce(s.es_matriz, true) as es_matriz,
             coalesce((
               select sum(c.monto) from cobros c
               where c.tenant_id = coalesce(s.libros_tenant_id, st.operational_tenant_ref)
                 and c.anulado = false
                 and c.created_at >= ${inicio}::date
                 and c.created_at < ${inicio}::date + interval '1 month'
             ), 0) as ventas,
             coalesce((
               select count(*) from cobros c
               where c.tenant_id = coalesce(s.libros_tenant_id, st.operational_tenant_ref)
                 and c.anulado = false
                 and c.created_at >= ${inicio}::date
                 and c.created_at < ${inicio}::date + interval '1 month'
             ), 0)::int as tickets,
             coalesce((
               select sum(e.monto) from egresos_caja e
               where e.tenant_id = coalesce(s.libros_tenant_id, st.operational_tenant_ref)
                 and e.creado_at >= ${inicio}::date
                 and e.creado_at < ${inicio}::date + interval '1 month'
             ), 0) as egresos,
             coalesce((
               select sum(e.monto) from egresos_caja e
               where e.tenant_id = coalesce(s.libros_tenant_id, st.operational_tenant_ref)
                 and e.categoria = 'mercaderia'
                 and e.creado_at >= ${inicio}::date
                 and e.creado_at < ${inicio}::date + interval '1 month'
             ), 0) as mercaderia
      from torre.saas_tenants st
      join tenants tn on tn.id = st.operational_tenant_ref
      left join sucursales s on s.tenant_id = st.operational_tenant_ref and s.activa = true
      where st.status = 'active' and st.operational_tenant_ref is not null
      order by st.name, s.es_matriz desc nulls first, sucursal
    `;
    return rows.map((row) => {
      const ventas = num(row.ventas);
      const egresos = num(row.egresos);
      return {
        negocio: row.negocio,
        sucursal: row.sucursal,
        esMatriz: row.es_matriz === true,
        ventas,
        tickets: num(row.tickets),
        egresos,
        mercaderia: num(row.mercaderia),
        resultado: Math.round((ventas - egresos) * 100) / 100,
      };
    });
  });
