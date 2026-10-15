import assert from "node:assert/strict";
import test from "node:test";
import { claveAceptable, correoAceptable } from "./correo.ts";
import { cupo } from "./cupo.ts";

test("rechaza un correo que solo parece correo", () => {
  assert.equal(correoAceptable("hola").ok, false);
  assert.equal(correoAceptable("a@b").ok, false);
  assert.equal(correoAceptable("uno@mailinator.com").ok, false);
  assert.equal(correoAceptable("caja@puesto.com.ar").ok, true);
});

test("rechaza una clave floja", () => {
  assert.equal(claveAceptable("12345678", "a@puesto.com").ok, false);
  assert.equal(claveAceptable("puesto-norte-18", "a@puesto.com").ok, true);
});

test("corta una ráfaga", () => {
  const clave = `test-${Date.now()}`;
  assert.equal(cupo(clave, 2, 60_000).ok, true);
  assert.equal(cupo(clave, 2, 60_000).ok, true);
  assert.equal(cupo(clave, 2, 60_000).ok, false);
});
