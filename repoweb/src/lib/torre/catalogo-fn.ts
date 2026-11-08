import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import { filtrarCatalogo, type ProductoUnificado, type FiltroCatalogo } from "./catalogo-core";

export type { ProductoUnificado, FiltroCatalogo } from "./catalogo-core";

export async function catalogoUnificadoCore(
  email: string,
  filtro: FiltroCatalogo,
): Promise<ProductoUnificado[]> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    nombre: string;
    unidad: string;
    precio: unknown;
    moneda: string;
    stock: unknown;
    stock_minimo: unknown;
    activo: boolean;
    publicado_online: boolean;
    foto_id: string | null;
  }>`
    select p.id, p.tenant_id, t.nombre as tenant_nombre, p.nombre, p.unidad,
           p.precio, p.moneda, p.stock, p.stock_minimo, p.activo,
           p.publicado_online, p.foto_id
    from productos p
    join tenants t on t.id = p.tenant_id
    join torre.saas_tenants st on st.operational_tenant_ref = t.id
    where st.status = 'active'
    order by t.nombre, p.nombre
  `;

  const productos: ProductoUnificado[] = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    nombre: r.nombre,
    unidad: r.unidad,
    precio: num(r.precio),
    moneda: r.moneda,
    stock: num(r.stock),
    stockMinimo: num(r.stock_minimo),
    stockBajo: num(r.stock) <= num(r.stock_minimo),
    activo: r.activo,
    publicadoOnline: r.publicado_online,
    canalMostrador: r.activo,
    canalMercado: r.publicado_online,
    fotoId: r.foto_id,
  }));

  return filtrarCatalogo(productos, filtro);
}

export const catalogoUnificado = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: FiltroCatalogo | undefined) => input ?? {})
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return catalogoUnificadoCore(email, data);
  });

export async function listarTenantsCatalogoCore(
  email: string,
): Promise<{ id: string; nombre: string }[]> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();
  const rows = await sql<{ id: string; nombre: string }>`
    select t.id, t.nombre from tenants t
    join torre.saas_tenants st on st.operational_tenant_ref = t.id
    where st.status = 'active'
    order by t.nombre
  `;
  return rows;
}

export const listarTenantsCatalogo = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarTenantsCatalogoCore(email);
  });
