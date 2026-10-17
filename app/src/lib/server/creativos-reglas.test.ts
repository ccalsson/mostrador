import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDITOS_POR_FOTO,
  PAQUETES,
  TEXTOS_POR_FOTO,
  briefDe,
  formatoDe,
  leerTanda,
  piezasDe,
} from "./creativos-reglas.ts";

test("una foto cuesta 4 créditos y trae cuatro lecturas", () => {
  assert.equal(CREDITOS_POR_FOTO, 4);
  assert.equal(TEXTOS_POR_FOTO, 4);
  assert.deepEqual(PAQUETES, [
    { id: "prod_creditos_50", creditos: 50, usd: 5.99 },
    { id: "prod_creditos_100", creditos: 100, usd: 9.99 },
  ]);
});

test("sólo se piden las piezas que conoce la API", () => {
  assert.equal(formatoDe("banner"), "banner");
  assert.equal(formatoDe("push"), "push");
  assert.throws(() => formatoDe("flyer"), /Esa pieza no se pide desde acá/);
  assert.throws(() => formatoDe(""), /Esa pieza no se pide desde acá/);
});

test("el brief se limpia y nunca pasa de 400 caracteres", () => {
  assert.equal(briefDe("  tomate perita  "), "tomate perita");
  assert.equal(briefDe("a".repeat(500)).length, 400);
  assert.equal(briefDe(undefined), "");
  assert.equal(briefDe(42), "");
});

test("las piezas habilitadas salen en el orden de la pantalla", () => {
  assert.deepEqual(piezasDe({ banner: false, push: false }), []);
  assert.deepEqual(piezasDe({ banner: true, push: false }), ["banner"]);
  assert.deepEqual(piezasDe({ banner: false, push: true }), ["push"]);
  assert.deepEqual(piezasDe({ banner: true, push: true }), ["banner", "push"]);
});

test("la tanda acepta el JSON envuelto en texto del modelo", () => {
  const raw =
    'acá va la respuesta {"imagen": "  cajón de tomates  ", "textos": ' +
    '[{"titulo":" Tomate perita ","texto":" Cajón de hoy a precio de puesto "},' +
    '{"titulo":"Segundo día","texto":"Se va el cajón"}]} gracias';
  const tanda = leerTanda(raw);
  assert.ok(tanda);
  assert.equal(tanda.imagen, "cajón de tomates");
  assert.equal(tanda.textos.length, 2);
  assert.deepEqual(tanda.textos[0], { titulo: "Tomate perita", texto: "Cajón de hoy a precio de puesto" });
});

test("la tanda acorta cada campo a lo que entra en la pieza", () => {
  const tanda = leerTanda(
    JSON.stringify({
      imagen: "i".repeat(900),
      textos: Array.from({ length: 7 }, () => ({ titulo: "t".repeat(120), texto: "x".repeat(300) })),
    }),
  );
  assert.ok(tanda);
  assert.equal(tanda.imagen.length, 700);
  assert.equal(tanda.textos.length, TEXTOS_POR_FOTO);
  assert.equal(tanda.textos[0].titulo.length, 80);
  assert.equal(tanda.textos[0].texto.length, 180);
});

test("sin foto o con una sola lectura la tanda no sirve", () => {
  assert.equal(leerTanda('{"textos":[{"titulo":"a","texto":"b"},{"titulo":"c","texto":"d"}]}'), null);
  assert.equal(leerTanda('{"imagen":"foto","textos":[{"titulo":"a","texto":"b"}]}'), null);
  assert.equal(leerTanda('{"imagen":"foto","textos":[{"titulo":"a","texto":"b"},{"titulo":"","texto":"d"}]}'), null);
  assert.equal(leerTanda('{"imagen":"foto","textos":[]}'), null);
});

test("una respuesta rota del modelo se descarta sin tirar el pedido", () => {
  assert.equal(leerTanda(""), null);
  assert.equal(leerTanda("no hay json acá"), null);
  assert.equal(leerTanda('{"imagen":"f","textos":[{"titulo":"a"'), null);
  assert.equal(leerTanda('{"imagen":123,"textos":[{"titulo":"a","texto":"b"},{"titulo":"c","texto":"d"}]}'), null);
});
