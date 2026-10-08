import assert from "node:assert/strict";
import test from "node:test";
import {
  aplicarPagoALinea,
  elegirManifest,
  extrasFacturables,
  hayActualizacion,
  incluidasPorBase,
  marcarIncluidas,
  precioSnapshot,
  releaseVisible,
  sumarPeriodo,
  totalMensual,
} from "./reglas.ts";

test("la primera sucursal no se factura y la segunda suma una", () => {
  assert.equal(extrasFacturables(1, 1), 0);
  assert.equal(extrasFacturables(3, 1), 2);
  assert.equal(incluidasPorBase([{ status: "active", kind: "base_product", includedBranches: 1 }]), 1);
  const marks = marcarIncluidas([{ id: "a" }, { id: "b" }], 1);
  assert.deepEqual(marks, [
    { id: "a", included: true },
    { id: "b", included: false },
  ]);
});

test("el mensual no cambia si cambia el catálogo: usa el precio guardado", () => {
  const contratado = precioSnapshot(
    { billing: "recurring", frequency: "monthly", setupUsd: 975, setupArs: null, recurringUsd: 100, recurringArs: null, onceUsd: null, onceArs: null },
    "USD",
    "recurring",
    1540,
  );
  assert.equal(contratado.unit, 100);
  const despues = totalMensual([
    { status: "active", frequency: "monthly", charge: "recurring", currency: "USD", subtotal: 100 },
    { status: "active", frequency: "monthly", charge: "recurring", currency: "USD", subtotal: 25 },
    { status: "active", frequency: "monthly", charge: "recurring", currency: "USD", subtotal: 32 },
    { status: "active", frequency: "once", charge: "setup", currency: "USD", subtotal: 975 },
  ]);
  assert.equal(despues.USD, 157);
  const pro = totalMensual([
    { status: "active", frequency: "monthly", charge: "recurring", currency: "USD", subtotal: 100 },
    { status: "active", frequency: "monthly", charge: "recurring", currency: "USD", subtotal: 25 },
    { status: "ended", frequency: "monthly", charge: "recurring", currency: "USD", subtotal: 32 },
    { status: "active", frequency: "monthly", charge: "recurring", currency: "USD", subtotal: 65 },
  ]);
  assert.equal(pro.USD, 190);
});

test("un pago mensual corre un mes, no 30 días ciegos", () => {
  assert.equal(sumarPeriodo("monthly", "2026-10-07"), "2026-11-07");
  assert.equal(sumarPeriodo("monthly", "2026-01-31"), "2026-02-28");
  assert.equal(sumarPeriodo("once", "2026-10-07"), null);
  const efecto = aplicarPagoALinea({ status: "paid", frequency: "monthly", paymentDate: "2026-10-07", nextDue: "2026-10-07" });
  assert.equal(efecto?.nextDue, "2026-11-07");
  assert.equal(aplicarPagoALinea({ status: "pending", frequency: "monthly", paymentDate: "2026-10-07", nextDue: "2026-10-07" }), null);
});

test("el manifest respeta audiencia y no toma un draft", () => {
  const rows = [
    { id: "1", version: "1.0.0", status: "published", publishedAt: "2026-10-01", targets: [{ scope: "all", tenantId: null, branchId: null, status: "approved" }] },
    { id: "2", version: "1.1.0", status: "published", publishedAt: "2026-10-07", targets: [{ scope: "beta", tenantId: "ten_a", branchId: null, status: "approved" }] },
    { id: "3", version: "9.0.0", status: "draft", publishedAt: null, targets: [] },
  ];
  assert.equal(elegirManifest(rows, {})?.version, "1.0.0");
  assert.equal(elegirManifest(rows, { tenantId: "ten_a" })?.version, "1.1.0");
  assert.equal(releaseVisible(rows[2], {}), false);
  assert.equal(hayActualizacion("1.0.0", "1.1.0"), true);
  assert.equal(hayActualizacion("1.1.0", "1.1.0"), false);
});

test("ARS se calcula con el tipo de cambio vigente y queda en el snapshot", () => {
  const snap = precioSnapshot(
    { billing: "recurring", frequency: "monthly", setupUsd: null, setupArs: null, recurringUsd: 25, recurringArs: null, onceUsd: null, onceArs: null },
    "ARS",
    "recurring",
    1540,
  );
  assert.equal(snap.unit, 38500);
  assert.equal(snap.fxUsed, 1540);
});
