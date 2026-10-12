import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarBanner, leerBanners, ponerBanner, validarBanner } from "./plantillas.ts";

describe("plantillas de banner", () => {
  it("acepta las cuatro y rechaza una inventada", () => {
    assert.equal(validarBanner({ plantilla: "puesto", frase: "  Fruta de estación  " }).frase, "Fruta de estación");
    assert.equal(validarBanner({ plantilla: "oferta", productoId: "p1" }).productoId, "p1");
    assert.throws(() => validarBanner({ plantilla: "push" }), /no existe/);
    assert.throws(() => validarBanner({ plantilla: "puesto", frase: "  " }), /texto/);
  });

  it("reemplaza el banner del mismo espacio", () => {
    const primero = { adId: "ad1", plantilla: "puesto" as const, productoId: null, frase: "Hoy" };
    const siguiente = { ...primero, frase: "Mañana" };
    const lista = ponerBanner([primero, { adId: "ad2", plantilla: "oferta", productoId: "p", frase: "" }], siguiente);
    assert.equal(lista.length, 2);
    assert.equal(lista.find((item) => item.adId === "ad1")?.frase, "Mañana");
  });

  it("arma el texto y no inventa un precio", () => {
    assert.deepEqual(armarBanner({ plantilla: "precio", puesto: "Román", producto: { nombre: "Banana", unidadLabel: "kg" }, frase: "" }), {
      titulo: "Banana",
      detalle: "kg",
    });
    assert.equal(armarBanner({ plantilla: "precio", puesto: "Román", producto: null, frase: "" }), null);
    assert.deepEqual(leerBanners({ banners: [{ adId: "a", plantilla: "puesto", frase: "Hola" }] }), [
      { adId: "a", plantilla: "puesto", productoId: null, frase: "Hola" },
    ]);
  });
});
