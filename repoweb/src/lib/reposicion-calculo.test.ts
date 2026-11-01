import assert from "node:assert/strict";
import test from "node:test";
import { cantidadAReponer, diasACubrir } from "./reposicion-calculo.ts";

test("de miércoles cubre hasta el jueves", () => {
  assert.deepEqual(diasACubrir("2026-10-21", [4, 0]), [3]);
});

test("el viernes y el sábado cubren hasta el domingo", () => {
  assert.deepEqual(diasACubrir("2026-10-23", [4, 0]), [5, 6]);
});

test("sin días de recepción no calcula", () => {
  assert.equal(cantidadAReponer({ hoy: "2026-10-21", recepcion: [], stock: 0, ventas: [] }), null);
});

test("resta el stock al promedio de ese día", () => {
  const ventas = [
    { fecha: "2026-10-14", cantidad: 10 },
    { fecha: "2026-10-07", cantidad: 8 },
  ];
  assert.equal(cantidadAReponer({ hoy: "2026-10-21", recepcion: [4], stock: 6, ventas }), 3);
});
