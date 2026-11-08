import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import {
  filtrarStock,
  generarAlertas,
  calcularResumen,
  type StockItem,
  type MovimientoStock,
  type AlertaInventario,
  type ResumenInventario,
} from "./inventario-core";

export type { StockItem, MovimientoStock, AlertaInventario, ResumenInventario } from "./inventario-core";

export async function inventarioStockCore(
  email: string,
  filtro: { tenantId?: string; stockBajo?: boolean; busqueda?: string },
): Promise<StockItem[]> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    producto_nombre: string;
    unidad: string;
    stock: unknown;
    stock_minimo: unknown;
    activo: boolean;
  }>`
    select p.id, p.tenant_id, t.nombre as tenant_nombre, p.nombre as producto_nombre,
           p.unidad, p.stock, p.stock_minimo, p.activo
    from productos p
    join tenants t on t.id = p.tenant_id
    join torre.saas_tenants st on st.operational_tenant_ref = t.id
    where st.status = 'active' and p.activo = true
    order by t.nombre, p.nombre
  `;

  const items: StockItem[] = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    productoId: r.id,
    productoNombre: r.producto_nombre,
    unidad: r.unidad,
    stock: num(r.stock),
    stockMinimo: num(r.stock_minimo),
    stockBajo: num(r.stock) <= num(r.stock_minimo),
    activo: r.activo,
  }));

  return filtrarStock(items, filtro);
}

export async function inventarioMovimientosCore(
  email: string,
  filtro: { dias: number },
): Promise<MovimientoStock[]> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();
  const dias = filtro.dias || 7;

  const rows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    producto_id: string;
    producto_nombre: string;
    tipo: string;
    cantidad: unknown;
    referencia: string | null;
    created_at: string;
  }>`
    select m.id, m.tenant_id, t.nombre as tenant_nombre, m.producto_id,
           p.nombre as producto_nombre, m.tipo, m.cantidad, m.referencia,
           m.created_at::text as created_at
    from stock_movimientos m
    join productos p on p.id = m.producto_id
    join tenants t on t.id = m.tenant_id
    where m.created_at >= current_date - (${dias}::int - 1)
    order by m.created_at desc
    limit 200
  `;

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    productoId: r.producto_id,
    productoNombre: r.producto_nombre,
    tipo: r.tipo,
    cantidad: num(r.cantidad),
    referencia: r.referencia,
    createdAt: r.created_at,
  }));
}

export async function inventarioAlertasCore(
  email: string,
): Promise<AlertaInventario[]> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  // Obtener todos los productos activos
  const stockRows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    producto_nombre: string;
    unidad: string;
    stock: unknown;
    stock_minimo: unknown;
    activo: boolean;
  }>`
    select p.id, p.tenant_id, t.nombre as tenant_nombre, p.nombre as producto_nombre,
           p.unidad, p.stock, p.stock_minimo, p.activo
    from productos p
    join tenants t on t.id = p.tenant_id
    join torre.saas_tenants st on st.operational_tenant_ref = t.id
    where st.status = 'active' and p.activo = true
  `;

  const items: StockItem[] = stockRows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    productoId: r.id,
    productoNombre: r.producto_nombre,
    unidad: r.unidad,
    stock: num(r.stock),
    stockMinimo: num(r.stock_minimo),
    stockBajo: num(r.stock) <= num(r.stock_minimo),
    activo: r.activo,
  }));

  // Obtener movimientos de los ultimos 30 dias
  const movRows = await sql<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    producto_id: string;
    producto_nombre: string;
    tipo: string;
    cantidad: unknown;
    referencia: string | null;
    created_at: string;
  }>`
    select m.id, m.tenant_id, t.nombre as tenant_nombre, m.producto_id,
           p.nombre as producto_nombre, m.tipo, m.cantidad, m.referencia,
           m.created_at::text as created_at
    from stock_movimientos m
    join productos p on p.id = m.producto_id
    join tenants t on t.id = m.tenant_id
    where m.created_at >= current_date - 29
    order by m.created_at desc
  `;

  const movimientos: MovimientoStock[] = movRows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    productoId: r.producto_id,
    productoNombre: r.producto_nombre,
    tipo: r.tipo,
    cantidad: num(r.cantidad),
    referencia: r.referencia,
    createdAt: r.created_at,
  }));

  return generarAlertas(items, movimientos);
}

export async function inventarioResumenCore(
  email: string,
): Promise<ResumenInventario> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  const stockRows = await sql<{
    stock: unknown;
    stock_minimo: unknown;
  }>`
    select p.stock, p.stock_minimo
    from productos p
    join tenants t on t.id = p.tenant_id
    join torre.saas_tenants st on st.operational_tenant_ref = t.id
    where st.status = 'active' and p.activo = true
  `;

  const items: StockItem[] = stockRows.map((r) => ({
    id: "",
    tenantId: "",
    tenantNombre: "",
    productoId: "",
    productoNombre: "",
    unidad: "",
    stock: num(r.stock),
    stockMinimo: num(r.stock_minimo),
    stockBajo: num(r.stock) <= num(r.stock_minimo),
    activo: true,
  }));

  const movRows = await sql<{ total: string }>`
    select count(*)::text as total from stock_movimientos
    where created_at >= current_date
  `;

  const movimientosHoy = Number(movRows[0]?.total ?? 0);

  return calcularResumen(items, movimientosHoy);
}

// --- Server function wrappers ---

export const inventarioStock = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { tenantId?: string; stockBajo?: boolean; busqueda?: string } | undefined) => input ?? {})
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return inventarioStockCore(email, data);
  });

export const inventarioMovimientos = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { dias: number } | undefined) => ({ dias: input?.dias ?? 7 }))
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return inventarioMovimientosCore(email, data);
  });

export const inventarioAlertas = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return inventarioAlertasCore(email);
  });

export const inventarioResumen = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return inventarioResumenCore(email);
  });

export const listarTenantsInventario = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "lectura");
    const sql = await getSql();
    const rows = await sql<{ id: string; nombre: string }>`
      select t.id, t.nombre from tenants t
      join torre.saas_tenants st on st.operational_tenant_ref = t.id
      where st.status = 'active'
      order by t.nombre
    `;
    return rows;
  });
