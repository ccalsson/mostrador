import assert from "node:assert/strict";
import test from "node:test";
import { esperadoEnEfectivo, round2, sumaMedio } from "./caja-reglas.ts";

const t = (formaPago: string, total: number) => ({ formaPago, total });

test("esperado: sólo cuenta el efectivo cobrado en el turno", () => {
  const totales = [t("efectivo", 1000), t("tarjeta", 500), t("transferencia", 300)];
  assert.equal(esperadoEnEfectivo(totales, 0), 1000);
});

test("esperado: sin un peso cobrado en efectivo la gaveta espera cero", () => {
  const totales = [t("tarjeta", 500), t("cuenta_corriente", 8000)];
  assert.equal(esperadoEnEfectivo(totales, 0), 0);
});

test("esperado: el egreso en efectivo sí sale de la gaveta", () => {
  assert.equal(esperadoEnEfectivo([t("efectivo", 1000)], 250), 750);
});

test("sumaMedio: ignora los medios que no coinciden", () => {
  const totales = [t("efectivo", 100), t("otro", 900)];
  assert.equal(sumaMedio(totales, "efectivo"), 100);
  assert.equal(sumaMedio(totales, "otro"), 900);
  assert.equal(sumaMedio([], "efectivo"), 0);
});

test("round2: el arqueo no acumula error de punto flotante", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(1234.567), 1234.57);
});
