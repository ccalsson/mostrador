import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apareceEnMercado, permiteCuentaCorriente, tierContratado } from "../torre/condiciones.ts";
import { perfilCargador, puedeCruzar } from "./cruces.ts";

const presencia = {
  family: "mercado",
  tier: "presencia",
  lineStatus: "active",
  subscriptionStatus: "active",
};

describe("presencia mínima en Mercado al Toque", () => {
  it("el plan mínimo publica el catálogo y no habilita cuenta corriente", () => {
    assert.equal(tierContratado([presencia]), "presencia");
    assert.equal(apareceEnMercado(true, "presencia"), true);
    assert.equal(apareceEnMercado(false, "presencia"), false);
    assert.equal(permiteCuentaCorriente("presencia"), false);
    assert.equal(permiteCuentaCorriente("pro"), true);
  });

  it("las cuatro calificaciones esperan la entrega y no se repiten", () => {
    assert.equal(puedeCruzar("entregado", false), true);
    assert.equal(puedeCruzar("preparado", false), false);
    assert.equal(puedeCruzar("entregado", true), false);
  });

  it("el perfil del cargador no exige foto", () => {
    assert.deepEqual(perfilCargador({ nombre: "  Luis  ", telefono: "11", foto: "" }), {
      nombre: "Luis",
      telefono: "11",
      foto: null,
    });
    assert.equal(perfilCargador({ nombre: "Luis", telefono: "", foto: "data:image/jpeg;base64,abc" }).foto?.startsWith("data:"), true);
    assert.throws(() => perfilCargador({ nombre: " ", telefono: "" }), /nombre/);
  });
});
