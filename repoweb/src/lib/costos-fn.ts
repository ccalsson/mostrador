import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { audit, assertRole } from "@/lib/server/context";
import { ensureStaffForUser } from "@/lib/server/bootstrap";
import { exigirPremium } from "@/lib/plan-puesto";

export function precioDesdeCosto(costo: number, margenPct: number) {
  return Math.round(costo * (1 + margenPct / 100) * 100) / 100;
}

function porcentajeValido(valor: number) {
  return Number.isFinite(valor) && valor >= 0 && valor <= 500;
}

export const guardarCosto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { productoId: string; costo: number; margenPct: number }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    await exigirPremium(staff.casaId);
    const costo = Math.round(Number(data.costo) * 100) / 100;
    const margen = Math.round(Number(data.margenPct) * 100) / 100;
    if (!(costo > 0)) throw new Error("El costo tiene que ser mayor a cero.");
    if (!porcentajeValido(margen)) throw new Error("El porcentaje va de 0 a 500.");
    const precio = precioDesdeCosto(costo, margen);
    const sql = await getSql();
    const rows = await sql<{ id: string; publicado_online: boolean }>`
      update productos
      set costo = ${costo}, margen_pct = ${margen}, precio = ${precio}, updated_at = now()
      where id = ${data.productoId} and tenant_id = ${staff.tenantId} and activo = true
      returning id, publicado_online
    `;
    if (!rows[0]) throw new Error("Ese producto no es de esta sucursal.");
    await audit(staff.tenantId, staff, "costo_producto", "producto", {
      id: data.productoId,
      costo,
      margen,
      precio,
    });
    return { precio, publicado: rows[0].publicado_online === true };
  });

export const aplicarMargen = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { margenPct: number; productoId?: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    await exigirPremium(staff.casaId);
    const margen = Math.round(Number(data.margenPct) * 100) / 100;
    if (!porcentajeValido(margen)) throw new Error("El porcentaje va de 0 a 500.");
    const sql = await getSql();
    const filas = await sql<{ id: string; costo: unknown }>`
      select id, costo from productos
      where tenant_id = ${staff.tenantId} and activo = true
        and (${data.productoId ?? null}::text is null or id = ${data.productoId ?? null})
    `;
    let actualizados = 0;
    let sinCosto = 0;
    for (const fila of filas) {
      if (fila.costo == null || !(num(fila.costo) > 0)) {
        await sql`update productos set margen_pct = ${margen}, updated_at = now() where id = ${fila.id}`;
        sinCosto += 1;
        continue;
      }
      const precio = precioDesdeCosto(num(fila.costo), margen);
      await sql`
        update productos
        set margen_pct = ${margen}, precio = ${precio}, updated_at = now()
        where id = ${fila.id}
      `;
      actualizados += 1;
    }
    await audit(staff.tenantId, staff, "margen_masivo", "producto", { margen, actualizados, sinCosto });
    return { actualizados, sinCosto };
  });

export const tomarCostosRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((remitoId: string) => remitoId)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    await exigirPremium(staff.casaId);
    const sql = await getSql();
    const remito = await sql<{ id: string; proveedor: string | null }>`
      select id, proveedor from remitos
      where id = ${data} and tenant_id = ${staff.tenantId} and estado = 'confirmado'
      limit 1
    `;
    if (!remito[0]) throw new Error("Confirmá el remito antes de tomar los costos.");
    const lineas = await sql<{ producto_id: string; cantidad: unknown; precio: unknown; margen_pct: unknown }>`
      select i.producto_id, i.cantidad, i.precio, p.margen_pct
      from remito_items i
      join productos p on p.id = i.producto_id and p.tenant_id = ${staff.tenantId}
      where i.remito_id = ${data} and i.confirmado = true and i.precio is not null and i.producto_id is not null
    `;
    if (lineas.length === 0) throw new Error("Esa factura no tiene precios de referencia.");
    let conPrecio = 0;
    let soloCosto = 0;
    let total = 0;
    for (const linea of lineas) {
      const costo = num(linea.precio);
      if (!(costo > 0)) continue;
      total += num(linea.cantidad) * costo;
      const margen = linea.margen_pct == null ? null : num(linea.margen_pct);
      if (margen == null) {
        await sql`update productos set costo = ${costo}, updated_at = now() where id = ${linea.producto_id}`;
        soloCosto += 1;
      } else {
        const precio = precioDesdeCosto(costo, margen);
        await sql`
          update productos set costo = ${costo}, precio = ${precio}, updated_at = now()
          where id = ${linea.producto_id}
        `;
        conPrecio += 1;
      }
    }
    const concepto = `Mercadería ${remito[0].proveedor || "factura"}`.slice(0, 120);
    const monto = Math.round(total * 100) / 100;
    if (monto > 0) {
      await sql`
        insert into caja_egresos (id, tenant_id, categoria, concepto, monto, medio, usuario_id, referencia)
        values (${newId("egr")}, ${staff.tenantId}, ${"mercaderia"}, ${concepto}, ${monto}, ${"otro"}, ${staff.id}, ${data})
        on conflict (tenant_id, referencia) where referencia is not null do nothing
      `;
    }
    return { conPrecio, soloCosto };
  });
