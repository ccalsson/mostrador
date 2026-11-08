import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularPLConsolidado, construirFlujoCaja, conciliarMovimientos } from "./financiero-core.ts";
import type { NumeroFila } from "./numeros-fn.ts";
import type { Payment, Expense, Cobro, Order } from "./financiero-core.ts";

// ── Datos sinteticos para tests ──

const filasBase: NumeroFila[] = [
  { negocio: "Mostrador", sucursal: "Matriz", esMatriz: true, ventas: 1000, tickets: 10, egresos: 600, mercaderia: 300, resultado: 400 },
  { negocio: "Mercado", sucursal: "Matriz", esMatriz: true, ventas: 500, tickets: 5, egresos: 300, mercaderia: 100, resultado: 200 },
];

const pagosBase: Payment[] = [
  { id: "pay1", amount: 200, paymentDate: "2026-11-05", kind: "mensualidad", currency: "USD" },
  { id: "pay2", amount: 100, paymentDate: "2026-11-15", kind: "addon", currency: "ARS" },
];

const gastosBase: Expense[] = [
  { id: "exp1", amount: 50, expenseDate: "2026-11-03", category: "hosting" },
  { id: "exp2", amount: 30, expenseDate: "2026-11-10", category: "ai", appName: "Super al Toque" },
];

// ── calcularPLConsolidado ──

describe("calcularPLConsolidado", () => {
  it("suma ingresos y gastos de negocios y SaaS", () => {
    const pl = calcularPLConsolidado(filasBase, pagosBase, gastosBase);
    assert.ok(pl.apps.length >= 3);
    assert.ok(pl.totalIngresos > 0);
    assert.ok(pl.totalGastos > 0);
    assert.equal(pl.totalResultado, Math.round((pl.totalIngresos - pl.totalGastos) * 100) / 100);
  });

  it("con arrays vacios devuelve todo en 0", () => {
    const pl = calcularPLConsolidado([], [], []);
    assert.equal(pl.apps.length, 0);
    assert.equal(pl.totalIngresos, 0);
    assert.equal(pl.totalGastos, 0);
    assert.equal(pl.totalResultado, 0);
  });

  it("ordena apps por ingresos descendente", () => {
    const pl = calcularPLConsolidado(filasBase, pagosBase, gastosBase);
    for (let i = 1; i < pl.apps.length; i++) {
      assert.ok(pl.apps[i - 1].ingresos >= pl.apps[i].ingresos);
    }
  });

  it("mapea nombres de negocio a apps correctas", () => {
    const filas: NumeroFila[] = [
      { negocio: "Supermercado Al Toque", sucursal: "S1", esMatriz: true, ventas: 100, tickets: 1, egresos: 50, mercaderia: 20, resultado: 50 },
      { negocio: "Materiales del Sur", sucursal: "S2", esMatriz: false, ventas: 200, tickets: 2, egresos: 80, mercaderia: 30, resultado: 120 },
    ];
    const pl = calcularPLConsolidado(filas, [], []);
    const apps = pl.apps.map((a) => a.app);
    assert.ok(apps.includes("Super al Toque"));
    assert.ok(apps.includes("Materiales Ya"));
  });

  it("incluye el periodo actual", () => {
    const pl = calcularPLConsolidado([], [], []);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    assert.equal(pl.periodo, expected);
  });
});

// ── construirFlujoCaja ──

describe("construirFlujoCaja", () => {
  it("genera una entrada por cada dia del rango", () => {
    const flujo = construirFlujoCaja([], [], 7);
    assert.equal(flujo.length, 7);
  });

  it("calcula saldo acumulado correctamente", () => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyStr = hoy.toISOString().slice(0, 10);
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().slice(0, 10);

    const pagos: Payment[] = [
      { id: "p1", amount: 100, paymentDate: hoyStr, kind: "mensualidad", currency: "ARS" },
    ];
    const gastos: Expense[] = [
      { id: "g1", amount: 40, expenseDate: ayerStr, category: "hosting" },
    ];

    const flujo = construirFlujoCaja(pagos, gastos, 3);
    assert.equal(flujo.length, 3);

    const ayerEntry = flujo.find((e) => e.fecha === ayerStr);
    const hoyEntry = flujo.find((e) => e.fecha === hoyStr);
    assert.ok(ayerEntry);
    assert.ok(hoyEntry);
    assert.equal(ayerEntry.egresos, 40);
    assert.equal(hoyEntry.ingresos, 100);
    assert.equal(hoyEntry.saldo, 60);
  });

  it("con arrays vacios todos los valores son 0", () => {
    const flujo = construirFlujoCaja([], [], 7);
    for (const e of flujo) {
      assert.equal(e.ingresos, 0);
      assert.equal(e.egresos, 0);
      assert.equal(e.saldo, 0);
    }
  });

  it("ignora pagos fuera del rango de dias", () => {
    const pagos: Payment[] = [
      { id: "p1", amount: 500, paymentDate: "2020-01-01", kind: "mensualidad", currency: "ARS" },
    ];
    const flujo = construirFlujoCaja(pagos, [], 7);
    const totalIngresos = flujo.reduce((sum, e) => sum + e.ingresos, 0);
    assert.equal(totalIngresos, 0);
  });
});

// ── conciliarMovimientos ──

describe("conciliarMovimientos", () => {
  it("concilia cobros con pedidos por tenant, monto y fecha", () => {
    const cobros: Cobro[] = [
      { id: "c1", tenantId: "t1", monto: 100, createdAt: "2026-11-01T10:00:00Z" },
    ];
    const pedidos: Order[] = [
      { id: "p1", tenantId: "t1", total: 100, createdAt: "2026-11-01T12:00:00Z", estado: "cobrado" },
    ];
    const result = conciliarMovimientos(cobros, pedidos);
    assert.equal(result.conciliados, 1);
    assert.equal(result.pagosSinPedido.length, 0);
    assert.equal(result.pedidosSinPago.length, 0);
  });

  it("detecta pagos sin pedido", () => {
    const cobros: Cobro[] = [
      { id: "c1", tenantId: "t1", monto: 100, createdAt: "2026-11-01T10:00:00Z" },
    ];
    const result = conciliarMovimientos(cobros, []);
    assert.equal(result.conciliados, 0);
    assert.equal(result.pagosSinPedido.length, 1);
    assert.equal(result.pagosSinPedido[0].id, "c1");
  });

  it("detecta pedidos sin pago", () => {
    const pedidos: Order[] = [
      { id: "p1", tenantId: "t1", total: 100, createdAt: "2026-11-01T10:00:00Z", estado: "pendiente" },
    ];
    const result = conciliarMovimientos([], pedidos);
    assert.equal(result.conciliados, 0);
    assert.equal(result.pedidosSinPago.length, 1);
    assert.equal(result.pedidosSinPago[0].id, "p1");
  });

  it("no concilia si el tenant no coincide", () => {
    const cobros: Cobro[] = [
      { id: "c1", tenantId: "t1", monto: 100, createdAt: "2026-11-01T10:00:00Z" },
    ];
    const pedidos: Order[] = [
      { id: "p1", tenantId: "t2", total: 100, createdAt: "2026-11-01T10:00:00Z", estado: "cobrado" },
    ];
    const result = conciliarMovimientos(cobros, pedidos);
    assert.equal(result.conciliados, 0);
    assert.equal(result.pagosSinPedido.length, 1);
    assert.equal(result.pedidosSinPago.length, 1);
  });

  it("no concilia si la diferencia de tiempo supera 48h", () => {
    const cobros: Cobro[] = [
      { id: "c1", tenantId: "t1", monto: 100, createdAt: "2026-11-01T10:00:00Z" },
    ];
    const pedidos: Order[] = [
      { id: "p1", tenantId: "t1", total: 100, createdAt: "2026-11-04T10:00:00Z", estado: "cobrado" },
    ];
    const result = conciliarMovimientos(cobros, pedidos);
    assert.equal(result.conciliados, 0);
  });

  it("no concilia si el monto no coincide", () => {
    const cobros: Cobro[] = [
      { id: "c1", tenantId: "t1", monto: 100, createdAt: "2026-11-01T10:00:00Z" },
    ];
    const pedidos: Order[] = [
      { id: "p1", tenantId: "t1", total: 150, createdAt: "2026-11-01T10:00:00Z", estado: "cobrado" },
    ];
    const result = conciliarMovimientos(cobros, pedidos);
    assert.equal(result.conciliados, 0);
  });

  it("excluye pedidos anulados", () => {
    const cobros: Cobro[] = [
      { id: "c1", tenantId: "t1", monto: 100, createdAt: "2026-11-01T10:00:00Z" },
    ];
    const pedidos: Order[] = [
      { id: "p1", tenantId: "t1", total: 100, createdAt: "2026-11-01T10:00:00Z", estado: "anulado" },
    ];
    const result = conciliarMovimientos(cobros, pedidos);
    assert.equal(result.conciliados, 0);
    assert.equal(result.pedidosSinPago.length, 0);
    assert.equal(result.pagosSinPedido.length, 1);
  });

  it("con arrays vacios devuelve todo en 0", () => {
    const result = conciliarMovimientos([], []);
    assert.equal(result.conciliados, 0);
    assert.equal(result.pagosSinPedido.length, 0);
    assert.equal(result.pedidosSinPago.length, 0);
  });
});
