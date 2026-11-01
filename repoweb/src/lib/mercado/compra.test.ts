import assert from "node:assert/strict";
import test from "node:test";
import { elegirOpcion, leerLista, type OpcionCompra } from "./compra-reglas.ts";

const banana: OpcionCompra = {
  id: "p1",
  tenantId: "t1",
  puesto: "Norte",
  nombre: "Banana Ecuador",
  alias: ["banana"],
  precio: 1200,
  stock: 20,
  unidad: "bulto",
  unidadLabel: "cajón",
};

const cara: OpcionCompra = { ...banana, id: "p2", tenantId: "t2", puesto: "Sur", precio: 1800 };

test("elige el puesto más barato que alcanza", () => {
  const elegida = elegirOpcion([cara, banana], "banana", 2);
  assert.equal(elegida?.id, "p1");
});

test("no elige si no hay stock", () => {
  assert.equal(elegirOpcion([{ ...banana, stock: 1 }], "banana", 4), null);
});

test("lee cantidad y nombre", () => {
  assert.deepEqual(leerLista("2 banana\nlechuga"), [
    { cantidad: 2, texto: "banana" },
    { cantidad: 1, texto: "lechuga" },
  ]);
});
