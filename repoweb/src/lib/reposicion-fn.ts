import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { exigirPremium } from "@/lib/plan-puesto";
import { cantidadAReponer, diasACubrir, nombreDia, normalizarDias } from "@/lib/reposicion-calculo";
import { assertRole } from "@/lib/server/context";
import { ensureStaffForUser } from "@/lib/server/bootstrap";

function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

export const leerReposicion = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    await exigirPremium(staff.casaId);
    const sql = await getSql();
    const guardados = await sql<{ dias: unknown }>`
      select dias from reposicion_dias where tenant_id = ${staff.tenantId} limit 1
    `;
    let crudo = guardados[0]?.dias;
    if (typeof crudo === "string") {
      try {
        crudo = JSON.parse(crudo) as unknown;
      } catch {
        crudo = [];
      }
    }
    const lista = Array.isArray(crudo) ? crudo.map(Number) : [];
    const dias = normalizarDias(lista);
    const hoy = hoyIso();
    const cubrir = diasACubrir(hoy, dias);
    if (cubrir.length === 0) return { dias, hasta: "", filas: [] };
    const ventas = await sql<{ producto_id: string; fecha: string; cantidad: unknown }>`
      select i.producto_id, to_char(p.created_at::date, 'YYYY-MM-DD') as fecha, sum(i.cantidad) as cantidad
      from pedido_items i
      join pedidos p on p.id = i.pedido_id
      join cobros c on c.pedido_id = p.id and c.tenant_id = p.tenant_id and c.anulado = false
      where p.tenant_id = ${staff.tenantId}
        and p.estado in ('cobrado', 'entregado')
        and p.created_at::date >= current_date - 56
        and p.created_at::date < current_date
      group by i.producto_id, p.created_at::date
    `;
    const productos = await sql<{ id: string; nombre: string; stock: unknown; unidad_label: string }>`
      select id, nombre, stock, unidad_label
      from productos
      where tenant_id = ${staff.tenantId} and activo = true
      order by lower(nombre)
    `;
    const porProducto = new Map<string, { fecha: string; cantidad: number }[]>();
    for (const venta of ventas) {
      const lista = porProducto.get(venta.producto_id) ?? [];
      lista.push({ fecha: venta.fecha, cantidad: num(venta.cantidad) });
      porProducto.set(venta.producto_id, lista);
    }
    const filas = productos.flatMap((producto) => {
      const cantidad = cantidadAReponer({
        hoy,
        recepcion: dias,
        stock: num(producto.stock),
        ventas: porProducto.get(producto.id) ?? [],
      });
      if (cantidad == null || cantidad <= 0) return [];
      return [{ id: producto.id, nombre: producto.nombre, cantidad, unidad: producto.unidad_label }];
    });
    return { dias, hasta: cubrir.map(nombreDia).join(", "), filas };
  });

export const guardarDiasReposicion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((dias: number[]) => normalizarDias(dias))
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    await exigirPremium(staff.casaId);
    if (data.length === 0) throw new Error("Elegí al menos un día de recepción.");
    const sql = await getSql();
    await sql`
      insert into reposicion_dias (tenant_id, dias)
      values (${staff.tenantId}, ${JSON.stringify(data)}::jsonb)
      on conflict (tenant_id) do update
      set dias = ${JSON.stringify(data)}::jsonb, updated_at = now()
    `;
    return { dias: data };
  });
