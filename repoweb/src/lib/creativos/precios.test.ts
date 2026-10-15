import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREDITOS_POR_FOTO, leerTanda } from "./precios.ts";

describe("créditos de creativos", () => {
  it("cobra cuatro créditos por la foto, no por cada texto", () => {
    assert.equal(CREDITOS_POR_FOTO, 4);
  });

  it("lee la foto y los textos que tira el modelo", () => {
    const tanda = leerTanda('{"imagen":"Cajón de tomate","textos":[{"titulo":"Hoy","texto":"El cajón."},{"titulo":"Puesto","texto":"Recién llegado."}]}');
    assert.equal(tanda?.textos.length, 2);
    assert.equal(leerTanda("sin json"), null);
  });
});
