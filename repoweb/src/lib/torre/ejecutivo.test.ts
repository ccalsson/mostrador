import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consolidarDashboard } from "./ejecutivo-core.ts";
import { rolPermite } from "./roles.ts";

describe("dashboard ejecutivo cross-app", () => {
  const base = {
    revenueMostrador: 1000,
    revenueMercado: 500,
    revenueSuper: 300,
    revenueMateriales: 200,
    staffOnline: 5,
    clientesActivos: 120,
    compradoresOnline: 30,
    cargadoresOnline: 8,
    pedidosEnviados: 3,
    pedidosEnPreparacion: 7,
    pedidosListos: 2,
    topProductos: [
      { nombre: "Banana", cantidad: 50, total: 5000 },
      { nombre: "Manzana", cantidad: 30, total: 3000 },
      { nombre: "Leche", cantidad: 20, total: 2000 },
    ],
    alertas: [
      { tipo: "stock", texto: "Stock bajo: Banana (Puesto 1) — 2 < 5 minimo." },
      { tipo: "pago", texto: "Pago pendiente: pedido abc12345 desde 2026-10-20." },
    ],
  };

  it("suma correctamente el revenue de las 4 apps", () => {
    const result = consolidarDashboard(1, base);
    assert.equal(result.revenueTotal, 2000);
    assert.equal(result.revenue.mostrador, 1000);
    assert.equal(result.revenue.mercado, 500);
    assert.equal(result.revenue.superAlToque, 300);
    assert.equal(result.revenue.materialesYa, 200);
  });

  it("consolida usuarios activos de todas las apps", () => {
    const result = consolidarDashboard(7, base);
    assert.equal(result.usuariosActivos.total, 163);
    assert.equal(result.usuariosActivos.staff, 5);
    assert.equal(result.usuariosActivos.clientes, 120);
    assert.equal(result.usuariosActivos.compradores, 30);
    assert.equal(result.usuariosActivos.cargadores, 8);
  });

  it("consolida pedidos en curso por estado", () => {
    const result = consolidarDashboard(30, base);
    assert.equal(result.pedidosEnCurso.total, 12);
    assert.equal(result.pedidosEnCurso.enviados, 3);
    assert.equal(result.pedidosEnCurso.enPreparacion, 7);
    assert.equal(result.pedidosEnCurso.listos, 2);
  });

  it("ordena top productos por total descendente y limita a 10", () => {
    const muchos = Array.from({ length: 15 }, (_, i) => ({
      nombre: `Producto ${i}`,
      cantidad: 10 - i,
      total: (15 - i) * 1000,
    }));
    const result = consolidarDashboard(1, { ...base, topProductos: muchos });
    assert.equal(result.topProductos.length, 10);
    assert.equal(result.topProductos[0].nombre, "Producto 0");
    assert.equal(result.topProductos[0].total, 15000);
    // Verifica que esta ordenado descendente por total
    for (let i = 1; i < result.topProductos.length; i++) {
      assert.ok(result.topProductos[i - 1].total >= result.topProductos[i].total);
    }
  });

  it("preserva las alertas de stock bajo y pagos pendientes", () => {
    const result = consolidarDashboard(1, base);
    assert.equal(result.alertas.length, 2);
    assert.equal(result.alertas[0].tipo, "stock");
    assert.equal(result.alertas[1].tipo, "pago");
  });

  it("genera dashboard vacio cuando no hay datos", () => {
    const vacio = {
      revenueMostrador: 0,
      revenueMercado: 0,
      revenueSuper: 0,
      revenueMateriales: 0,
      staffOnline: 0,
      clientesActivos: 0,
      compradoresOnline: 0,
      cargadoresOnline: 0,
      pedidosEnviados: 0,
      pedidosEnPreparacion: 0,
      pedidosListos: 0,
      topProductos: [],
      alertas: [],
    };
    const result = consolidarDashboard(1, vacio);
    assert.equal(result.revenueTotal, 0);
    assert.equal(result.usuariosActivos.total, 0);
    assert.equal(result.pedidosEnCurso.total, 0);
    assert.equal(result.topProductos.length, 0);
    assert.equal(result.alertas.length, 0);
  });

  it("respeta el periodo seleccionado", () => {
    assert.equal(consolidarDashboard(1, base).dias, 1);
    assert.equal(consolidarDashboard(7, base).dias, 7);
    assert.equal(consolidarDashboard(30, base).dias, 30);
  });

  it("convierte valores bigint/string en numeros via num()", () => {
    const conBigInt = {
      ...base,
      topProductos: [
        { nombre: "Test", cantidad: BigInt(42), total: "1234.56" },
      ],
    };
    const result = consolidarDashboard(1, conBigInt);
    assert.equal(result.topProductos[0].cantidad, 42);
    assert.equal(result.topProductos[0].total, 1234.56);
  });
});

describe("permisos del dashboard ejecutivo", () => {
  it("solo el rol administracion puede acceder", () => {
    assert.equal(rolPermite("administracion", "lectura"), true);
    // El dashboard ejecutivo requiere "administracion", que incluye todas las acciones.
    // Verificamos que otros roles NO tienen el nivel de administracion completo:
    for (const rol of ["comercial", "legal", "soporte", "auditoria", "", "rol_inexistente"]) {
      // Ningun rol excepto administracion tiene todas las acciones
      const tieneComercial = rolPermite(rol, "comercial");
      const tieneAcceso = rolPermite(rol, "acceso");
      // Solo administracion tiene acceso completo
      if (rol !== "administracion") {
        // Al menos una de estas debe ser false para roles no-admin
        assert.equal(
          tieneComercial && tieneAcceso,
          false,
          `${rol || "(vacio)"} no deberia tener acceso completo`,
        );
      }
    }
  });
});
