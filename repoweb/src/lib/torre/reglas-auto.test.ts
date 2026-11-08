import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluarCondicion,
  evaluarReglas,
  validarRegla,
  type Condicion,
  type Regla,
  type StockSnapshot,
  type PagosSnapshot,
  type CobrosSnapshot,
  type EgresosSnapshot,
} from "./reglas-auto-core.ts";

function dataVacia() {
  return { stock: [] as StockSnapshot, pagos: [] as PagosSnapshot, cobros: [] as CobrosSnapshot, egresos: [] as EgresosSnapshot };
}

describe("evaluarCondicion — stock_bajo", () => {
  it("se dispara cuando stock <= minimo * umbral/100", () => {
    const condicion: Condicion = { tipo: "stock_bajo", umbral: 100 };
    const stock: StockSnapshot = [
      { tenantId: "t1", tenantNombre: "Negocio A", productoNombre: "Manzana", stock: 3, stockMinimo: 5 },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), stock });
    assert.equal(result.disparada, true);
    assert.ok(result.detalle.includes("1 producto(s)"));
  });

  it("no se dispara cuando stock esta por encima del umbral", () => {
    const condicion: Condicion = { tipo: "stock_bajo", umbral: 50 };
    const stock: StockSnapshot = [
      { tenantId: "t1", tenantNombre: "Negocio A", productoNombre: "Manzana", stock: 10, stockMinimo: 5 },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), stock });
    assert.equal(result.disparada, false);
  });

  it("con umbral 100 y stock igual al minimo se dispara", () => {
    const condicion: Condicion = { tipo: "stock_bajo", umbral: 100 };
    const stock: StockSnapshot = [
      { tenantId: "t1", tenantNombre: "Negocio A", productoNombre: "Manzana", stock: 5, stockMinimo: 5 },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), stock });
    assert.equal(result.disparada, true);
  });
});

describe("evaluarCondicion — pago_vencido", () => {
  it("se dispara cuando hay pagos pendientes vencidos", () => {
    const condicion: Condicion = { tipo: "pago_vencido", umbral: 0, periodoDias: 7 };
    const hace10Dias = new Date();
    hace10Dias.setDate(hace10Dias.getDate() - 10);
    const pagos: PagosSnapshot = [
      { id: "p1", tenantId: "t1", amount: 100, paymentDate: hace10Dias.toISOString(), status: "pending" },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), pagos });
    assert.equal(result.disparada, true);
    assert.ok(result.detalle.includes("1 pago(s)"));
  });

  it("no se dispara cuando el pago es reciente", () => {
    const condicion: Condicion = { tipo: "pago_vencido", umbral: 0, periodoDias: 7 };
    const hace2Dias = new Date();
    hace2Dias.setDate(hace2Dias.getDate() - 2);
    const pagos: PagosSnapshot = [
      { id: "p1", tenantId: "t1", amount: 100, paymentDate: hace2Dias.toISOString(), status: "pending" },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), pagos });
    assert.equal(result.disparada, false);
  });

  it("no se dispara cuando el pago ya esta pagado", () => {
    const condicion: Condicion = { tipo: "pago_vencido", umbral: 0, periodoDias: 7 };
    const hace10Dias = new Date();
    hace10Dias.setDate(hace10Dias.getDate() - 10);
    const pagos: PagosSnapshot = [
      { id: "p1", tenantId: "t1", amount: 100, paymentDate: hace10Dias.toISOString(), status: "paid" },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), pagos });
    assert.equal(result.disparada, false);
  });
});

describe("evaluarCondicion — caja_negativa", () => {
  it("se dispara cuando egresos superan cobros para un tenant", () => {
    const condicion: Condicion = { tipo: "caja_negativa", umbral: 0, periodoDias: 30 };
    const hoy = new Date().toISOString();
    const cobros: CobrosSnapshot = [
      { tenantId: "t1", monto: 100, createdAt: hoy },
    ];
    const egresos: EgresosSnapshot = [
      { tenantId: "t1", monto: 200, createdAt: hoy },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), cobros, egresos });
    assert.equal(result.disparada, true);
    assert.ok(result.detalle.includes("1 tenant(s)"));
  });

  it("no se dispara cuando cobros superan egresos", () => {
    const condicion: Condicion = { tipo: "caja_negativa", umbral: 0, periodoDias: 30 };
    const hoy = new Date().toISOString();
    const cobros: CobrosSnapshot = [
      { tenantId: "t1", monto: 500, createdAt: hoy },
    ];
    const egresos: EgresosSnapshot = [
      { tenantId: "t1", monto: 200, createdAt: hoy },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), cobros, egresos });
    assert.equal(result.disparada, false);
  });
});

describe("evaluarCondicion — revenue_drop", () => {
  it("se dispara cuando la caida supera el umbral", () => {
    const condicion: Condicion = { tipo: "revenue_drop", umbral: 20, periodoDias: 30 };
    const ahora = new Date();
    const hace15Dias = new Date(ahora);
    hace15Dias.setDate(hace15Dias.getDate() - 15);
    const hace45Dias = new Date(ahora);
    hace45Dias.setDate(hace45Dias.getDate() - 45);

    const cobros: CobrosSnapshot = [
      { tenantId: "t1", monto: 100, createdAt: hace15Dias.toISOString() }, // periodo actual
      { tenantId: "t1", monto: 200, createdAt: hace45Dias.toISOString() }, // periodo anterior
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), cobros });
    assert.equal(result.disparada, true);
    assert.ok(result.detalle.includes("Caida"));
  });

  it("no se dispara cuando la caida es menor al umbral", () => {
    const condicion: Condicion = { tipo: "revenue_drop", umbral: 50, periodoDias: 30 };
    const ahora = new Date();
    const hace15Dias = new Date(ahora);
    hace15Dias.setDate(hace15Dias.getDate() - 15);
    const hace45Dias = new Date(ahora);
    hace45Dias.setDate(hace45Dias.getDate() - 45);

    const cobros: CobrosSnapshot = [
      { tenantId: "t1", monto: 100, createdAt: hace15Dias.toISOString() },
      { tenantId: "t1", monto: 110, createdAt: hace45Dias.toISOString() },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), cobros });
    assert.equal(result.disparada, false);
  });

  it("no se dispara cuando no hay datos del periodo anterior", () => {
    const condicion: Condicion = { tipo: "revenue_drop", umbral: 20, periodoDias: 30 };
    const hoy = new Date().toISOString();
    const cobros: CobrosSnapshot = [
      { tenantId: "t1", monto: 100, createdAt: hoy },
    ];
    const result = evaluarCondicion(condicion, { ...dataVacia(), cobros });
    assert.equal(result.disparada, false);
    assert.ok(result.detalle.includes("No hay datos"));
  });
});

describe("evaluarReglas", () => {
  it("evalua multiples reglas activas", () => {
    const reglas: Regla[] = [
      {
        id: "r1", nombre: "Stock bajo", descripcion: "", activo: true,
        condicion: { tipo: "stock_bajo", umbral: 100 },
        accion: { tipo: "alerta", destino: "global", mensaje: "Stock bajo" },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      {
        id: "r2", nombre: "Pago vencido", descripcion: "", activo: true,
        condicion: { tipo: "pago_vencido", umbral: 0, periodoDias: 7 },
        accion: { tipo: "notificacion", destino: "admin@test.com", mensaje: "Pago vencido" },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    ];
    const stock: StockSnapshot = [
      { tenantId: "t1", tenantNombre: "Negocio A", productoNombre: "Manzana", stock: 3, stockMinimo: 5 },
    ];
    const result = evaluarReglas(reglas, { ...dataVacia(), stock });
    assert.equal(result.length, 2);
    assert.equal(result[0].reglaId, "r1");
    assert.equal(result[0].disparada, true);
    assert.equal(result[1].reglaId, "r2");
    assert.equal(result[1].disparada, false);
  });

  it("saltea reglas inactivas", () => {
    const reglas: Regla[] = [
      {
        id: "r1", nombre: "Inactiva", descripcion: "", activo: false,
        condicion: { tipo: "stock_bajo", umbral: 100 },
        accion: { tipo: "alerta", destino: "global", mensaje: "Stock bajo" },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    ];
    const result = evaluarReglas(reglas, dataVacia());
    assert.equal(result.length, 0);
  });

  it("con array vacio devuelve vacio", () => {
    const result = evaluarReglas([], dataVacia());
    assert.equal(result.length, 0);
  });
});

describe("validarRegla", () => {
  it("rechaza nombre vacio", () => {
    const result = validarRegla({
      nombre: "",
      condicion: { tipo: "stock_bajo", umbral: 80 },
      accion: { tipo: "alerta", destino: "global", mensaje: "Stock bajo" },
    });
    assert.equal(result, "El nombre es obligatorio.");
  });

  it("rechaza tipo de condicion invalido", () => {
    const result = validarRegla({
      nombre: "Test",
      condicion: { tipo: "invalido" as "stock_bajo", umbral: 80 },
      accion: { tipo: "alerta", destino: "global", mensaje: "Stock bajo" },
    });
    assert.equal(result, "Tipo de condicion invalido.");
  });

  it("rechaza umbral negativo", () => {
    const result = validarRegla({
      nombre: "Test",
      condicion: { tipo: "stock_bajo", umbral: -10 },
      accion: { tipo: "alerta", destino: "global", mensaje: "Stock bajo" },
    });
    assert.equal(result, "El umbral debe ser un numero positivo.");
  });

  it("rechaza tipo de accion invalido", () => {
    const result = validarRegla({
      nombre: "Test",
      condicion: { tipo: "stock_bajo", umbral: 80 },
      accion: { tipo: "invalido" as "alerta", destino: "global", mensaje: "Stock bajo" },
    });
    assert.equal(result, "Tipo de accion invalido.");
  });

  it("rechaza destino vacio", () => {
    const result = validarRegla({
      nombre: "Test",
      condicion: { tipo: "stock_bajo", umbral: 80 },
      accion: { tipo: "alerta", destino: "", mensaje: "Stock bajo" },
    });
    assert.equal(result, "El destino de la accion es obligatorio.");
  });

  it("rechaza mensaje vacio", () => {
    const result = validarRegla({
      nombre: "Test",
      condicion: { tipo: "stock_bajo", umbral: 80 },
      accion: { tipo: "alerta", destino: "global", mensaje: "" },
    });
    assert.equal(result, "El mensaje de la accion es obligatorio.");
  });

  it("acepta regla valida", () => {
    const result = validarRegla({
      nombre: "Stock bajo",
      condicion: { tipo: "stock_bajo", umbral: 80 },
      accion: { tipo: "alerta", destino: "global", mensaje: "Revisar stock" },
    });
    assert.equal(result, null);
  });
});
