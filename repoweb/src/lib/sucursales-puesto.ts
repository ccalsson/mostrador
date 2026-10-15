import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole } from "@/lib/server/context";
import { ensureStaffForUser } from "@/lib/server/bootstrap";
import type { Staff } from "@/lib/types";
import { incluidasPorBase } from "@/lib/torre/reglas";

type Sql = Awaited<ReturnType<typeof getSql>>;

async function cupoDe(sql: Sql, casaId: string) {
  const lineas = await sql<{ status: string; kind: string; config: unknown; slug: string; quantity: number }>`
    select l.status, p.kind, p.config, p.slug, l.quantity::int as quantity
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_tenants t on t.id = s.tenant_id
    join torre.saas_products p on p.id = l.product_id
    where t.operational_tenant_ref = ${casaId} and t.status = 'active' and l.status = 'active'
  `;
  const incluidas = Math.max(
    1,
    incluidasPorBase(
      lineas.map((linea) => ({
        status: linea.status,
        kind: linea.kind,
        includedBranches: Number((linea.config as { includedBranches?: number } | null)?.includedBranches ?? 1),
      })),
    ),
  );
  const extras = lineas
    .filter((linea) => linea.slug === "sucursal-extra" || linea.kind === "branch")
    .reduce((suma, linea) => suma + linea.quantity, 0);
  return { incluidas, extras, cupo: incluidas + extras };
}

async function asegurarMatriz(sql: Sql, casaId: string) {
  const ya = await sql<{ id: string }>`
    select id from sucursales where tenant_id = ${casaId} and es_matriz = true limit 1
  `;
  if (ya[0]) return ya[0].id;
  const casa = await sql<{ nombre: string }>`select nombre from tenants where id = ${casaId} limit 1`;
  const id = newId("suc");
  const nombre = casa[0]?.nombre || "Casa matriz";
  await sql`
    insert into sucursales (id, tenant_id, libros_tenant_id, nombre, referencia, es_matriz, activa)
    values (${id}, ${casaId}, ${casaId}, ${nombre}, ${""}, ${true}, ${true})
  `;
  const torre = await sql<{ id: string }>`
    select id from torre.saas_tenants where operational_tenant_ref = ${casaId} and status = 'active' limit 1
  `;
  if (torre[0]) {
    const ramas = await sql<{ n: number }>`
      select count(*)::int as n from torre.saas_branches where tenant_id = ${torre[0].id}
    `;
    if ((ramas[0]?.n ?? 0) === 0) {
      const torreId = newId("br");
      await sql`
        insert into torre.saas_branches (id, tenant_id, name, slug, address, status, included, opened_on)
        values (${torreId}, ${torre[0].id}, ${nombre}, ${"matriz"}, ${""}, ${"active"}, ${true}, current_date)
      `;
      await sql`update sucursales set torre_branch_id = ${torreId} where id = ${id}`;
    }
  }
  return id;
}

function slugDe(nombre: string, id: string) {
  const base = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${base || "sucursal"}-${id.slice(-4)}`;
}

function configSinMercado(raw: unknown) {
  const base = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  base.mercadoAlToque = false;
  return base;
}

export const sucursalesDelPuesto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero", "vendedor"]);
    const sql = await getSql();
    await asegurarMatriz(sql, staff.casaId);
    const filas = await sql<{
      id: string;
      nombre: string;
      referencia: string;
      es_matriz: boolean;
      activa: boolean;
    }>`
      select id, nombre, referencia, es_matriz, activa
      from sucursales
      where tenant_id = ${staff.casaId}
      order by es_matriz desc, created_at
    `;
    let cupo = { incluidas: 1, extras: 0, cupo: 1 };
    try {
      cupo = await cupoDe(sql, staff.casaId);
    } catch {
      cupo = { incluidas: 1, extras: 0, cupo: 1 };
    }
    const activas = filas.filter((fila) => fila.activa).length;
    const cruce = staff.rol === "admin" ? await cruceDe(sql, staff.casaId) : [];
    const productos = staff.rol === "admin"
      ? await sql<{ id: string; nombre: string; stock: unknown }>`
          select id, nombre, stock from productos
          where tenant_id = ${staff.casaId} and activo = true
          order by lower(nombre)
        `
      : [];
    return {
      ...cupo,
      usadas: activas,
      puedeCrear: staff.rol === "admin" && activas < cupo.cupo,
      esDueno: staff.rol === "admin",
      sucursales: filas.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        referencia: fila.referencia,
        esMatriz: fila.es_matriz,
        activa: fila.activa,
        esActual: staff.sucursalId ? staff.sucursalId === fila.id : fila.es_matriz && staff.tenantId === staff.casaId,
      })),
      cruce,
      productos: productos.map((item) => ({ id: item.id, nombre: item.nombre, stock: num(item.stock) })),
    };
  });

async function cruceDe(sql: Sql, casaId: string) {
  const rows = await sql<{ id: string; nombre: string; ventas: unknown; tickets: unknown; stock_bajo: unknown }>`
    select s.id, s.nombre,
           coalesce((
             select sum(c.monto) from cobros c
             where c.tenant_id = s.libros_tenant_id and c.anulado = false
               and c.created_at::date >= current_date - 6
           ), 0) as ventas,
           coalesce((
             select count(*) from cobros c
             where c.tenant_id = s.libros_tenant_id and c.anulado = false
               and c.created_at::date >= current_date - 6
           ), 0)::int as tickets,
           coalesce((
             select count(*) from productos p
             where p.tenant_id = s.libros_tenant_id and p.activo = true and p.stock <= p.stock_minimo
           ), 0)::int as stock_bajo
    from sucursales s
    where s.tenant_id = ${casaId} and s.activa = true
    order by s.es_matriz desc, s.nombre
  `;
  return rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    ventas: num(row.ventas),
    tickets: num(row.tickets),
    stockBajo: num(row.stock_bajo),
  }));
}

export const crearSucursalPuesto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; referencia: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const nombre = data.nombre.trim().slice(0, 80);
    const referencia = data.referencia.trim().slice(0, 160);
    if (nombre.length < 2) throw new Error("La sucursal necesita un nombre.");
    const sql = await getSql();
    await asegurarMatriz(sql, staff.casaId);
    const cupo = await cupoDe(sql, staff.casaId).catch(() => ({ incluidas: 1, extras: 0, cupo: 1 }));
    const abiertas = await sql<{ n: number }>`
      select count(*)::int as n from sucursales where tenant_id = ${staff.casaId} and activa = true
    `;
    if ((abiertas[0]?.n ?? 1) >= cupo.cupo) throw new Error("No hay lugar. Torre tiene que habilitar otra sucursal.");
    const libros = newId("ten");
    const sucursalId = newId("suc");
    const casa = await sql<{ config: unknown }>`select config from tenants where id = ${staff.casaId} limit 1`;
    await sql`
      insert into tenants (id, nombre, config)
      values (${libros}, ${nombre}, ${JSON.stringify(configSinMercado(casa[0]?.config))}::jsonb)
    `;
    await sql`
      insert into ticket_seq (tenant_id, ultimo) values (${libros}, ${0})
      on conflict (tenant_id) do nothing
    `;
    const torreId = await anotarEnTorre(sql, staff, sucursalId, nombre, referencia, cupo.incluidas);
    await sql`
      insert into sucursales (id, tenant_id, libros_tenant_id, nombre, referencia, es_matriz, torre_branch_id, activa)
      values (${sucursalId}, ${staff.casaId}, ${libros}, ${nombre}, ${referencia}, ${false}, ${torreId}, ${true})
    `;
    const productos = await sql<{
      id: string;
      nombre: string;
      unidad: string;
      unidad_label: string;
      precio: unknown;
      stock_minimo: unknown;
      alias: unknown;
      orden: number | null;
    }>`
      select id, nombre, unidad, unidad_label, precio, stock_minimo, alias, orden
      from productos
      where tenant_id = ${staff.casaId} and activo = true
    `;
    for (const producto of productos) {
      const copia = newId("p");
      const alias = typeof producto.alias === "string" ? producto.alias : JSON.stringify(producto.alias ?? []);
      await sql`
        insert into productos (
          id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, orden, publicado_online
        ) values (
          ${copia}, ${libros}, ${producto.nombre}, ${producto.unidad}, ${producto.unidad_label},
          ${num(producto.precio)}, ${0}, ${num(producto.stock_minimo)}, ${alias}::jsonb,
          ${true}, ${producto.orden}, ${false}
        )
      `;
      await sql`
        insert into sucursal_producto (sucursal_id, origen_id, producto_id)
        values (${sucursalId}, ${producto.id}, ${copia})
      `;
    }
    return { id: sucursalId, productos: productos.length };
  });

async function anotarEnTorre(sql: Sql, staff: Staff, sucursalId: string, nombre: string, referencia: string, incluidas: number) {
  const tenants = await sql<{ id: string }>`
    select id from torre.saas_tenants
    where operational_tenant_ref = ${staff.casaId} and status = 'active'
    limit 1
  `;
  if (!tenants[0]) return null;
  const abiertas = await sql<{ n: number }>`
    select count(*)::int as n from torre.saas_branches where tenant_id = ${tenants[0].id} and status = 'active'
  `;
  const id = newId("br");
  await sql`
    insert into torre.saas_branches (id, tenant_id, name, slug, address, status, included, opened_on)
    values (
      ${id}, ${tenants[0].id}, ${nombre}, ${slugDe(nombre, sucursalId)}, ${referencia},
      ${"active"}, ${(abiertas[0]?.n ?? 0) < incluidas}, current_date
    )
  `;
  return id;
}

export const usarSucursal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((sucursalId: string) => sucursalId)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (!staff.puedeCambiar) throw new Error("El dueño no te habilitó para cambiar de sucursal.");
    const sql = await getSql();
    const fila = await sql<{ id: string; es_matriz: boolean }>`
      select id, es_matriz from sucursales
      where id = ${data} and tenant_id = ${staff.casaId} and activa = true
      limit 1
    `;
    if (!fila[0]) throw new Error("Esa sucursal no es de este puesto.");
    await sql`
      update staff
      set sucursal_actual_id = ${fila[0].es_matriz ? null : fila[0].id}
      where id = ${staff.id}
    `;
    return { id: fila[0].id };
  });

export const transferirStockSucursal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { destinoId: string; productoId: string; cantidad: number }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const cantidad = Number(data.cantidad);
    if (!(cantidad > 0)) throw new Error("La cantidad tiene que ser mayor a cero.");
    const sql = await getSql();
    const destino = await sql<{ id: string; libros_tenant_id: string; es_matriz: boolean }>`
      select id, libros_tenant_id, es_matriz from sucursales
      where id = ${data.destinoId} and tenant_id = ${staff.casaId} and activa = true
      limit 1
    `;
    if (!destino[0] || destino[0].es_matriz) throw new Error("Elegí la sucursal que recibe.");
    const origen = await sql<{ id: string; stock: unknown }>`
      select id, stock from productos
      where id = ${data.productoId} and tenant_id = ${staff.casaId} and activo = true
      limit 1
    `;
    if (!origen[0]) throw new Error("Ese producto es de la casa matriz.");
    if (num(origen[0].stock) < cantidad) throw new Error("En la matriz no alcanza el stock.");
    const copia = await sql<{ producto_id: string }>`
      select producto_id from sucursal_producto
      where sucursal_id = ${destino[0].id} and origen_id = ${origen[0].id}
      limit 1
    `;
    if (!copia[0]) throw new Error("Ese producto no está en la sucursal.");
    const bajo = await sql<{ id: string }>`
      update productos set stock = stock - ${cantidad}, updated_at = now()
      where id = ${origen[0].id} and tenant_id = ${staff.casaId} and stock >= ${cantidad}
      returning id
    `;
    if (!bajo[0]) throw new Error("En la matriz no alcanza el stock.");
    await sql`
      update productos set stock = stock + ${cantidad}, updated_at = now()
      where id = ${copia[0].producto_id} and tenant_id = ${destino[0].libros_tenant_id}
    `;
    await sql`
      insert into stock_movimientos (id, tenant_id, producto_id, tipo, cantidad, referencia)
      values (${newId("sm")}, ${staff.casaId}, ${origen[0].id}, ${"ajuste"}, ${-cantidad}, ${"transferencia"})
    `;
    await sql`
      insert into stock_movimientos (id, tenant_id, producto_id, tipo, cantidad, referencia)
      values (${newId("sm")}, ${destino[0].libros_tenant_id}, ${copia[0].producto_id}, ${"ajuste"}, ${cantidad}, ${"transferencia"})
    `;
    return { ok: true };
  });

export const importarClientesSucursal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((destinoId: string) => destinoId)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const destino = await sql<{ libros_tenant_id: string; es_matriz: boolean }>`
      select libros_tenant_id, es_matriz from sucursales
      where id = ${data} and tenant_id = ${staff.casaId} and activa = true
      limit 1
    `;
    if (!destino[0] || destino[0].es_matriz) throw new Error("Elegí la sucursal que recibe las fichas.");
    const fichas = await sql<{ nombre: string; telefono: string | null; cuenta_corriente: boolean }>`
      select nombre, telefono, cuenta_corriente from clientes
      where tenant_id = ${staff.casaId} and activo = true
    `;
    let copiados = 0;
    for (const ficha of fichas) {
      const ya = await sql<{ id: string }>`
        select id from clientes
        where tenant_id = ${destino[0].libros_tenant_id} and lower(nombre) = lower(${ficha.nombre})
        limit 1
      `;
      if (ya[0]) continue;
      await sql`
        insert into clientes (id, tenant_id, nombre, telefono, cuenta_corriente)
        values (${newId("cli")}, ${destino[0].libros_tenant_id}, ${ficha.nombre}, ${ficha.telefono}, ${ficha.cuenta_corriente})
      `;
      copiados += 1;
    }
    return { copiados };
  });

export const habilitarCambioSucursal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { staffId: string; puedeCambiar: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update staff set puede_cambiar = ${data.puedeCambiar}
      where id = ${data.staffId} and tenant_id = ${staff.casaId} and rol <> 'admin'
      returning id
    `;
    if (!rows[0]) throw new Error("Ese usuario no es de este puesto.");
    return { ok: true };
  });
