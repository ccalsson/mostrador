import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filtrarCatalogo, type ProductoUnificado } from "./catalogo-core.ts";

function producto(overrides: Partial<ProductoUnificado> & { id: string; nombre: string }): ProductoUnificado {
  return {
    tenantId: "t1",
    tenantNombre: "Negocio A",
    unidad: "kg",
    precio: 100,
    moneda: "ARS",
    stock: 10,
    stockMinimo: 5,
    stockBajo: false,
    activo: true,
    publicadoOnline: false,
    canalMostrador: true,
    canalMercado: false,
    fotoId: null,
    ...overrides,
  };
}

const datos: ProductoUnificado[] = [
  producto({ id: "1", nombre: "Banana", tenantId: "t1", tenantNombre: "Negocio A", precio: 100, stock: 10, stockMinimo: 5, stockBajo: false, publicadoOnline: true, canalMercado: true }),
  producto({ id: "2", nombre: "Manzana", tenantId: "t1", tenantNombre: "Negocio A", precio: 200, stock: 3, stockMinimo: 5, stockBajo: true, publicadoOnline: false, canalMercado: false }),
  producto({ id: "3", nombre: "Leche", tenantId: "t2", tenantNombre: "Negocio B", precio: 150, stock: 20, stockMinimo: 10, stockBajo: false, publicadoOnline: true, canalMercado: true }),
  producto({ id: "4", nombre: "Pan", tenantId: "t2", tenantNombre: "Negocio B", precio: 80, stock: 2, stockMinimo: 5, stockBajo: true, publicadoOnline: false, canalMercado: false }),
  producto({ id: "5", nombre: "Arroz", tenantId: "t3", tenantNombre: "Negocio C", precio: 120, stock: 50, stockMinimo: 10, stockBajo: false, activo: false, publicadoOnline: false, canalMostrador: false, canalMercado: false }),
];

describe("filtrarCatalogo", () => {
  it("sin filtros devuelve todos los productos ordenados por tenant y nombre", () => {
    const result = filtrarCatalogo(datos, {});
    assert.equal(result.length, 5);
    // Orden: Negocio A (Banana, Manzana), Negocio B (Leche, Pan), Negocio C (Arroz)
    assert.equal(result[0].nombre, "Banana");
    assert.equal(result[1].nombre, "Manzana");
    assert.equal(result[2].nombre, "Leche");
    assert.equal(result[3].nombre, "Pan");
    assert.equal(result[4].nombre, "Arroz");
  });

  it("filtra por tenant", () => {
    const result = filtrarCatalogo(datos, { tenantId: "t2" });
    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.tenantId === "t2"));
  });

  it("filtra por publicado online = true", () => {
    const result = filtrarCatalogo(datos, { publicadoOnline: true });
    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.publicadoOnline === true));
  });

  it("filtra por publicado online = false", () => {
    const result = filtrarCatalogo(datos, { publicadoOnline: false });
    assert.equal(result.length, 3);
    assert.ok(result.every((p) => p.publicadoOnline === false));
  });

  it("filtra por stock bajo", () => {
    const result = filtrarCatalogo(datos, { stockBajo: true });
    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.stockBajo === true));
    assert.equal(result[0].nombre, "Manzana");
    assert.equal(result[1].nombre, "Pan");
  });

  it("busca por nombre (case-insensitive)", () => {
    const result = filtrarCatalogo(datos, { busqueda: "ban" });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Banana");
  });

  it("busca por nombre con acentos y mayusculas", () => {
    const result = filtrarCatalogo(datos, { busqueda: "MANZANA" });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Manzana");
  });

  it("busqueda vacia no filtra", () => {
    const result = filtrarCatalogo(datos, { busqueda: "" });
    assert.equal(result.length, 5);
  });

  it("busqueda sin resultados devuelve array vacio", () => {
    const result = filtrarCatalogo(datos, { busqueda: "zzzzz" });
    assert.equal(result.length, 0);
  });

  it("combina filtros: tenant + stock bajo", () => {
    const result = filtrarCatalogo(datos, { tenantId: "t2", stockBajo: true });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Pan");
  });

  it("combina filtros: publicado + busqueda", () => {
    const result = filtrarCatalogo(datos, { publicadoOnline: true, busqueda: "le" });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Leche");
  });

  it("combina todos los filtros", () => {
    const result = filtrarCatalogo(datos, {
      tenantId: "t1",
      publicadoOnline: true,
      stockBajo: false,
      busqueda: "ban",
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Banana");
  });

  it("filtros excluyentes devuelven solo los que coinciden", () => {
    const result = filtrarCatalogo(datos, { tenantId: "t1", publicadoOnline: false });
    // Manzana: t1, publicadoOnline=false => pasa ambos filtros
    // Banana: t1, publicadoOnline=true => no pasa publicadoOnline=false
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Manzana");
  });

  it("con array vacio devuelve vacio", () => {
    const result = filtrarCatalogo([], {});
    assert.equal(result.length, 0);
  });

  it("ordena por tenant y luego por nombre", () => {
    const result = filtrarCatalogo(datos, {});
    for (let i = 1; i < result.length; i++) {
      const cmpTenant = result[i - 1].tenantNombre.localeCompare(result[i].tenantNombre);
      if (cmpTenant < 0) continue;
      if (cmpTenant === 0) {
        assert.ok(result[i - 1].nombre.localeCompare(result[i].nombre) <= 0);
      }
    }
  });
});
