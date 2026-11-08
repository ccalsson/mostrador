import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filtrarStock,
  generarAlertas,
  calcularResumen,
  type StockItem,
  type MovimientoStock,
} from "./inventario-core.ts";

function stockItem(overrides: Partial<StockItem> & { id: string; productoNombre: string }): StockItem {
  return {
    tenantId: "t1",
    tenantNombre: "Negocio A",
    productoId: "p1",
    unidad: "kg",
    stock: 10,
    stockMinimo: 5,
    stockBajo: false,
    activo: true,
    ...overrides,
  };
}

function movimiento(overrides: Partial<MovimientoStock> & { id: string }): MovimientoStock {
  return {
    tenantId: "t1",
    tenantNombre: "Negocio A",
    productoId: "p1",
    productoNombre: "Producto 1",
    tipo: "venta",
    cantidad: -1,
    referencia: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const datos: StockItem[] = [
  stockItem({ id: "1", productoNombre: "Banana", tenantId: "t1", tenantNombre: "Negocio A", stock: 10, stockMinimo: 5, stockBajo: false }),
  stockItem({ id: "2", productoNombre: "Manzana", tenantId: "t1", tenantNombre: "Negocio A", stock: 3, stockMinimo: 5, stockBajo: true }),
  stockItem({ id: "3", productoNombre: "Leche", tenantId: "t2", tenantNombre: "Negocio B", stock: 20, stockMinimo: 10, stockBajo: false }),
  stockItem({ id: "4", productoNombre: "Pan", tenantId: "t2", tenantNombre: "Negocio B", stock: 0, stockMinimo: 5, stockBajo: true }),
  stockItem({ id: "5", productoNombre: "Arroz", tenantId: "t3", tenantNombre: "Negocio C", stock: -2, stockMinimo: 10, stockBajo: true }),
];

describe("filtrarStock", () => {
  it("sin filtros devuelve todos los items ordenados por tenant y nombre", () => {
    const result = filtrarStock(datos, {});
    assert.equal(result.length, 5);
    assert.equal(result[0].productoNombre, "Banana");
    assert.equal(result[1].productoNombre, "Manzana");
    assert.equal(result[2].productoNombre, "Leche");
    assert.equal(result[3].productoNombre, "Pan");
    assert.equal(result[4].productoNombre, "Arroz");
  });

  it("filtra por tenant", () => {
    const result = filtrarStock(datos, { tenantId: "t2" });
    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.tenantId === "t2"));
  });

  it("filtra por stock bajo", () => {
    const result = filtrarStock(datos, { stockBajo: true });
    assert.equal(result.length, 3);
    assert.ok(result.every((p) => p.stockBajo));
  });

  it("busca por nombre de producto (case-insensitive)", () => {
    const result = filtrarStock(datos, { busqueda: "ban" });
    assert.equal(result.length, 1);
    assert.equal(result[0].productoNombre, "Banana");
  });

  it("busca por nombre de tenant", () => {
    const result = filtrarStock(datos, { busqueda: "negocio b" });
    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.tenantNombre === "Negocio B"));
  });

  it("busqueda vacia no filtra", () => {
    const result = filtrarStock(datos, { busqueda: "" });
    assert.equal(result.length, 5);
  });

  it("busqueda sin resultados devuelve array vacio", () => {
    const result = filtrarStock(datos, { busqueda: "zzzzz" });
    assert.equal(result.length, 0);
  });

  it("combina filtros: tenant + stock bajo", () => {
    const result = filtrarStock(datos, { tenantId: "t2", stockBajo: true });
    assert.equal(result.length, 1);
    assert.equal(result[0].productoNombre, "Pan");
  });

  it("con array vacio devuelve vacio", () => {
    const result = filtrarStock([], {});
    assert.equal(result.length, 0);
  });
});

describe("generarAlertas", () => {
  it("detecta stock_bajo con severidad media cuando hay stock > 0", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "Manzana", stock: 3, stockMinimo: 5, stockBajo: true }),
    ];
    const movs = [movimiento({ id: "m1", productoId: "1", tenantId: "t1" })];
    const alertas = generarAlertas(items, movs);
    const stockBajo = alertas.filter((a) => a.tipo === "stock_bajo");
    assert.equal(stockBajo.length, 1);
    assert.equal(stockBajo[0].severidad, "media");
    assert.equal(stockBajo[0].productoNombre, "Manzana");
  });

  it("detecta stock_bajo con severidad alta cuando stock === 0", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "Pan", stock: 0, stockMinimo: 5, stockBajo: true }),
    ];
    const movs = [movimiento({ id: "m1", productoId: "1", tenantId: "t1" })];
    const alertas = generarAlertas(items, movs);
    const stockBajo = alertas.filter((a) => a.tipo === "stock_bajo");
    assert.equal(stockBajo.length, 1);
    assert.equal(stockBajo[0].severidad, "alta");
  });

  it("detecta stock_negativo con severidad alta", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "Arroz", stock: -2, stockMinimo: 10, stockBajo: true }),
    ];
    const movs = [movimiento({ id: "m1", productoId: "1", tenantId: "t1" })];
    const alertas = generarAlertas(items, movs);
    const neg = alertas.filter((a) => a.tipo === "stock_negativo");
    assert.equal(neg.length, 1);
    assert.equal(neg[0].severidad, "alta");
  });

  it("detecta sin_movimientos para items activos sin movimientos", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "Banana", stock: 50, stockMinimo: 10, stockBajo: false, activo: true }),
    ];
    // No movements for this product
    const movs: MovimientoStock[] = [];
    const alertas = generarAlertas(items, movs);
    const sinMov = alertas.filter((a) => a.tipo === "sin_movimientos");
    assert.equal(sinMov.length, 1);
    assert.equal(sinMov[0].severidad, "baja");
  });

  it("no genera sin_movimientos para items inactivos", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "Banana", stock: 50, stockMinimo: 10, stockBajo: false, activo: false }),
    ];
    const movs: MovimientoStock[] = [];
    const alertas = generarAlertas(items, movs);
    const sinMov = alertas.filter((a) => a.tipo === "sin_movimientos");
    assert.equal(sinMov.length, 0);
  });

  it("no genera sin_movimientos cuando hay movimientos recientes", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "Banana", productoId: "p1", stock: 50, stockMinimo: 10, stockBajo: false, activo: true }),
    ];
    const movs = [movimiento({ id: "m1", productoId: "p1", tenantId: "t1" })];
    const alertas = generarAlertas(items, movs);
    const sinMov = alertas.filter((a) => a.tipo === "sin_movimientos");
    assert.equal(sinMov.length, 0);
  });

  it("con arrays vacios no genera alertas", () => {
    const alertas = generarAlertas([], []);
    assert.equal(alertas.length, 0);
  });

  it("ordena por severidad: alta primero", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "A", stock: 3, stockMinimo: 5, stockBajo: true }),
      stockItem({ id: "2", productoNombre: "B", stock: 0, stockMinimo: 5, stockBajo: true }),
      stockItem({ id: "3", productoNombre: "C", stock: -1, stockMinimo: 5, stockBajo: true }),
    ];
    const movs = [
      movimiento({ id: "m1", productoId: "1", tenantId: "t1" }),
      movimiento({ id: "m2", productoId: "2", tenantId: "t1" }),
      movimiento({ id: "m3", productoId: "3", tenantId: "t1" }),
    ];
    const alertas = generarAlertas(items, movs);
    // All should be alta or media
    assert.equal(alertas[0].severidad, "alta");
  });
});

describe("calcularResumen", () => {
  it("calcula correctamente los totales", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "A", stock: 10, stockMinimo: 5, stockBajo: false }),
      stockItem({ id: "2", productoNombre: "B", stock: 3, stockMinimo: 5, stockBajo: true }),
      stockItem({ id: "3", productoNombre: "C", stock: 0, stockMinimo: 5, stockBajo: true }),
    ];
    const resumen = calcularResumen(items, 15);
    assert.equal(resumen.totalProductos, 3);
    assert.equal(resumen.productosStockBajo, 2);
    assert.equal(resumen.productosSinStock, 1);
    assert.equal(resumen.movimientosHoy, 15);
  });

  it("con arrays vacios devuelve ceros", () => {
    const resumen = calcularResumen([], 0);
    assert.equal(resumen.totalProductos, 0);
    assert.equal(resumen.productosStockBajo, 0);
    assert.equal(resumen.productosSinStock, 0);
    assert.equal(resumen.movimientosHoy, 0);
  });

  it("todos los items con stock bajo", () => {
    const items = [
      stockItem({ id: "1", productoNombre: "A", stock: 0, stockMinimo: 5, stockBajo: true }),
      stockItem({ id: "2", productoNombre: "B", stock: 1, stockMinimo: 5, stockBajo: true }),
    ];
    const resumen = calcularResumen(items, 0);
    assert.equal(resumen.productosStockBajo, 2);
    assert.equal(resumen.productosSinStock, 1);
  });
});
