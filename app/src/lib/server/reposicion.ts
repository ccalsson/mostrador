import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { assertRole } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

export type ReposicionSugerencia = {
  productoId: string;
  nombre: string;
  cantidadSugerida: number;
  stockActual: number;
  promedioDiario: number;
};

export type ReposicionResultado = {
  dias: number;
  sugerencias: ReposicionSugerencia[];
};

/**
 * Calcula sugerencias de reposición según el historial de ventas del puesto.
 *
 * Lógica:
 * 1. Obtener ventas de los últimos N días agrupadas por producto.
 * 2. Calcular promedio diario de ventas por producto.
 * 3. Multiplicar por 7 (para tener stock de una semana).
 * 4. Restar stock actual.
 * 5. Filtrar solo productos donde resultado > stock_minimo.
 * 6. Ordenar por cantidad sugerida descendente.
 */
export async function reposicionForStaff(
  staff: Staff,
  opciones: { dias?: number; stockMinimo?: number } = {},
): Promise<ReposicionResultado> {
  assertRole(staff, ["admin"]);

  const dias = opciones.dias ?? 7;
  const stockMinimo = opciones.stockMinimo ?? 5;

  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    throw new Error("dias debe ser un entero entre 1 y 365.");
  }
  if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
    throw new Error("stockMinimo debe ser un número positivo.");
  }

  const sql = await getSql();

  // Ventas agrupadas por producto en los últimos N días
  const ventas = await sql.query<{
    producto_id: string;
    nombre: string;
    total_cantidad: unknown;
  }>(
    `select i.producto_id,
            max(i.nombre_snapshot) as nombre,
            sum(i.cantidad) as total_cantidad
     from pedido_items i
     join pedidos p on p.id = i.pedido_id
     where p.tenant_id = $1
       and p.estado in ('cobrado', 'entregado')
       and p.created_at::date >= current_date - ($2::int - 1)
     group by i.producto_id`,
    [staff.tenantId, dias],
  );

  if (ventas.length === 0) {
    return { dias, sugerencias: [] };
  }

  // Stock actual de esos productos
  const productoIds = ventas.map((v) => v.producto_id);
  const stocks = await sql.query<{
    id: string;
    stock: unknown;
  }>(
    `select id, stock from productos
     where id = any($1::text[]) and tenant_id = $2`,
    [productoIds, staff.tenantId],
  );

  const stockPorProducto = new Map<string, number>();
  for (const row of stocks) {
    stockPorProducto.set(row.id, num(row.stock));
  }

  const sugerencias: ReposicionSugerencia[] = [];

  for (const venta of ventas) {
    const cantidadTotal = num(venta.total_cantidad);
    const promedioDiario = cantidadTotal / dias;
    // Stock necesario para cubrir una semana de ventas
    const necesarioSemana = promedioDiario * 7;
    const stockActual = stockPorProducto.get(venta.producto_id) ?? 0;
    const cantidadSugerida = necesarioSemana - stockActual;

    // Solo sugerir si la cantidad a comprar supera el stock mínimo
    if (cantidadSugerida > stockMinimo) {
      sugerencias.push({
        productoId: venta.producto_id,
        nombre: venta.nombre,
        cantidadSugerida: Math.round(cantidadSugerida * 100) / 100,
        stockActual,
        promedioDiario: Math.round(promedioDiario * 100) / 100,
      });
    }
  }

  // Ordenar por cantidad sugerida descendente
  sugerencias.sort((a, b) => b.cantidadSugerida - a.cantidadSugerida);

  return { dias, sugerencias };
}
