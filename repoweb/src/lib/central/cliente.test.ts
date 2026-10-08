import assert from "node:assert/strict";
import test from "node:test";
import { bloqueoSinRed, etiquetaCargo, rutaPermitida, textoImporte } from "./reglas.ts";

test("mercado no pide la suscripción ni los add-ons del puesto", () => {
  assert.equal(rutaPermitida("mercado", "subscription"), false);
  assert.equal(rutaPermitida("mercado", "addons"), false);
  assert.equal(rutaPermitida("mercado", "contracts/pending"), true);
  assert.equal(rutaPermitida("mercado", "contracts/ver_1/accept"), true);
  assert.equal(rutaPermitida("mercado", "capabilities"), false);
  assert.equal(rutaPermitida("mostrador", "subscription"), true);
});

test("sin red no se acepta y el importe se muestra como vino", () => {
  assert.match(bloqueoSinRed("POST", false) ?? "", /sin conexión/i);
  assert.equal(bloqueoSinRed("GET", false), null);
  assert.equal(bloqueoSinRed("POST", true), null);
  assert.equal(textoImporte("USD", 32), "USD 32,00");
  assert.equal(etiquetaCargo("setup", "once"), "Implementación");
  assert.equal(etiquetaCargo("recurring", "monthly"), "Abono");
  assert.equal(etiquetaCargo("recurring", "once"), "Cargo puntual");
});
