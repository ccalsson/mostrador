import assert from "node:assert/strict";
import test from "node:test";
import {
  apareceEnMercado,
  permiteCuentaCorriente,
  resolverComision,
  textoCondicion,
  tierContratado,
} from "./condiciones.ts";

const presencia = {
  family: "mercado",
  tier: "presencia",
  lineStatus: "active",
  subscriptionStatus: "active",
};

test("sin línea de mercado el puesto no aparece aunque esté publicado", () => {
  assert.equal(tierContratado([]), null);
  assert.equal(apareceEnMercado(true, null), false);
  assert.equal(apareceEnMercado(false, "presencia"), false);
  assert.equal(apareceEnMercado(true, "presencia"), true);
});

test("pro pisa a presencia y una suscripción suspendida no publica", () => {
  assert.equal(
    tierContratado([
      presencia,
      { family: "mercado", tier: "pro", lineStatus: "active", subscriptionStatus: "active" },
    ]),
    "pro",
  );
  assert.equal(
    tierContratado([{ ...presencia, subscriptionStatus: "suspended" }]),
    null,
  );
  assert.equal(permiteCuentaCorriente("presencia"), false);
  assert.equal(permiteCuentaCorriente("pro"), true);
});

test("la comisión es la fila vigente y no un importe", () => {
  const override = resolverComision({
    overrideVigente: true,
    overridePercent: 0,
    policyMin: 10,
    policyMax: 15,
  });
  assert.equal(override.source, "override");
  assert.equal(override.percent, 0);
  assert.equal(override.percentMin, null);
  const banda = resolverComision({
    overrideVigente: false,
    overridePercent: null,
    policyMin: 10,
    policyMax: 15,
  });
  assert.equal(banda.percent, null);
  assert.equal(textoCondicion(banda), "Comisión: entre 10% y 15%");
  assert.equal(textoCondicion(override), "Comisión: 0%");
});
