import assert from "node:assert/strict";
import test from "node:test";
import { configSinMercado, cupoDeLineas, incluidasPorBase, slugDe } from "./sucursales-reglas.ts";

const linea = (over: Partial<Parameters<typeof cupoDeLineas>[0][number]>) => ({
  status: "active",
  kind: "base_product",
  slug: "mostrador-base",
  quantity: 1,
  ...over,
});

test("el cupo base nunca baja de 1 (la matriz)", () => {
  assert.deepEqual(cupoDeLineas([]), { incluidas: 1, extras: 0, cupo: 1 });
  assert.deepEqual(cupoDeLineas([linea({ status: "paused" })]), { incluidas: 1, extras: 0, cupo: 1 });
  assert.equal(incluidasPorBase([linea({ status: "ended" })]), 0);
});

test("cada base activa suma sus sucursales incluidas y los extras por línea", () => {
  assert.deepEqual(cupoDeLineas([linea({ includedBranches: 2 })]), { incluidas: 2, extras: 0, cupo: 2 });
  assert.deepEqual(
    cupoDeLineas([linea({}), linea({ kind: "branch", slug: "sucursal-extra", quantity: 2 })]),
    { incluidas: 1, extras: 2, cupo: 3 },
  );
  assert.deepEqual(
    cupoDeLineas([linea({}), linea({ kind: "addon", slug: "sucursal-extra", quantity: 1 })]),
    { incluidas: 1, extras: 1, cupo: 2 },
  );
  assert.deepEqual(
    cupoDeLineas([linea({}), linea({ kind: "addon", slug: "mercado-presencia", quantity: 9 })]),
    { incluidas: 1, extras: 0, cupo: 1 },
  );
});

test("el slug de la rama de Torre sale del nombre sin acentos y con sufijo del id", () => {
  assert.equal(slugDe("Sucursal Ñandú Centro", "suc_ab12cd34"), "sucursal-nandu-centro-cd34");
  assert.equal(slugDe("  **  ", "suc_ffff0000"), "sucursal-0000");
  assert.equal(
    slugDe("Depósito Central Norte de la Casa", "suc_1234abcd"),
    "deposito-central-norte-d-abcd",
  );
});

test("la configuración de una sucursal nunca hereda el canal Mercado", () => {
  assert.deepEqual(configSinMercado({ mercadoAlToque: true, pieTicket: "gracias" }), {
    mercadoAlToque: false,
    pieTicket: "gracias",
  });
  assert.deepEqual(configSinMercado(null), { mercadoAlToque: false });
});
