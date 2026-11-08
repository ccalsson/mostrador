/**
 * Logica pura del inventario cross-canal.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type StockItem = {
  id: string;
  tenantId: string;
  tenantNombre: string;
  productoId: string;
  productoNombre: string;
  unidad: string;
  stock: number;
  stockMinimo: number;
  stockBajo: boolean;
  activo: boolean;
};

export type MovimientoStock = {
  id: string;
  tenantId: string;
  tenantNombre: string;
  productoId: string;
  productoNombre: string;
  tipo: string;
  cantidad: number;
  referencia: string | null;
  createdAt: string;
};

export type AlertaInventario = {
  tipo: "stock_bajo" | "sin_movimientos" | "stock_negativo";
  severidad: "alta" | "media" | "baja";
  tenantNombre: string;
  productoNombre: string;
  detalle: string;
};

export type ResumenInventario = {
  totalProductos: number;
  productosStockBajo: number;
  productosSinStock: number;
  movimientosHoy: number;
};

/**
 * Filtra y ordena items de stock.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function filtrarStock(
  items: StockItem[],
  filtro: { tenantId?: string; stockBajo?: boolean; busqueda?: string },
): StockItem[] {
  let resultado = items;

  if (filtro.tenantId) {
    resultado = resultado.filter((p) => p.tenantId === filtro.tenantId);
  }

  if (filtro.stockBajo) {
    resultado = resultado.filter((p) => p.stockBajo);
  }

  if (filtro.busqueda && filtro.busqueda.trim()) {
    const q = filtro.busqueda.trim().toLowerCase();
    resultado = resultado.filter(
      (p) =>
        p.productoNombre.toLowerCase().includes(q) ||
        p.tenantNombre.toLowerCase().includes(q),
    );
  }

  return resultado.sort((a, b) => {
    const porTenant = a.tenantNombre.localeCompare(b.tenantNombre);
    if (porTenant !== 0) return porTenant;
    return a.productoNombre.localeCompare(b.productoNombre);
  });
}

/**
 * Genera alertas de inventario a partir de los datos de stock y movimientos.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function generarAlertas(
  items: StockItem[],
  movimientos: MovimientoStock[],
): AlertaInventario[] {
  const alertas: AlertaInventario[] = [];

  // Productos con movimientos en los ultimos 30 dias
  const productosConMovimientos = new Set<string>();
  for (const m of movimientos) {
    productosConMovimientos.add(`${m.tenantId}:${m.productoId}`);
  }

  for (const item of items) {
    // Stock negativo — severidad alta
    if (item.stock < 0) {
      alertas.push({
        tipo: "stock_negativo",
        severidad: "alta",
        tenantNombre: item.tenantNombre,
        productoNombre: item.productoNombre,
        detalle: `Stock negativo: ${item.stock} ${item.unidad}`,
      });
    }

    // Stock bajo (stock <= stockMinimo) — pero no negativo (ya reportado arriba)
    if (item.stock <= item.stockMinimo && item.stock >= 0) {
      alertas.push({
        tipo: "stock_bajo",
        severidad: item.stock === 0 ? "alta" : "media",
        tenantNombre: item.tenantNombre,
        productoNombre: item.productoNombre,
        detalle:
          item.stock === 0
            ? `Sin stock (minimo: ${item.stockMinimo} ${item.unidad})`
            : `Stock bajo: ${item.stock} ${item.unidad} (minimo: ${item.stockMinimo} ${item.unidad})`,
      });
    }

    // Sin movimientos en los ultimos 30 dias — solo activos
    if (item.activo && !productosConMovimientos.has(`${item.tenantId}:${item.productoId}`)) {
      alertas.push({
        tipo: "sin_movimientos",
        severidad: "baja",
        tenantNombre: item.tenantNombre,
        productoNombre: item.productoNombre,
        detalle: "Sin movimientos en los ultimos 30 dias",
      });
    }
  }

  // Ordenar: alta primero, luego media, luego baja
  const orden: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  return alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

/**
 * Calcula resumen del inventario.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function calcularResumen(
  items: StockItem[],
  movimientosHoy: number,
): ResumenInventario {
  return {
    totalProductos: items.length,
    productosStockBajo: items.filter((i) => i.stockBajo).length,
    productosSinStock: items.filter((i) => i.stock === 0).length,
    movimientosHoy,
  };
}
