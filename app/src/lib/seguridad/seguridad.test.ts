import assert from "node:assert/strict";
import test from "node:test";
import { claveAceptable, correoAceptable } from "./correo.ts";
import { cupo, ipDe } from "./cupo.ts";

test("rechaza un correo que solo parece correo", () => {
  assert.equal(correoAceptable("hola").ok, false);
  assert.equal(correoAceptable("a@b").ok, false);
  assert.equal(correoAceptable("uno@mailinator.com").ok, false);
  assert.equal(correoAceptable("uno@example.com").ok, false);
  assert.equal(correoAceptable("uno@puesto.local").ok, false);
  assert.equal(correoAceptable("caja@puesto.com.ar").ok, true);
});

test("normaliza el correo aceptado", () => {
  const correo = correoAceptable("  Caja@Puesto.com.AR ");
  assert.deepEqual(correo, { ok: true, email: "caja@puesto.com.ar" });
});

test("rechaza una clave floja", () => {
  assert.equal(claveAceptable("12345678", "a@puesto.com").ok, false);
  assert.equal(claveAceptable("mercado1", "a@puesto.com").ok, false);
  assert.equal(claveAceptable("A@puesto.com", "a@puesto.com").ok, false);
  assert.equal(claveAceptable("corta", "a@puesto.com").ok, false);
  assert.equal(claveAceptable("x".repeat(73), "a@puesto.com").ok, false);
  assert.equal(claveAceptable("puesto-norte-18", "a@puesto.com").ok, true);
});

test("corta una ráfaga", () => {
  const clave = `test-${Date.now()}`;
  assert.equal(cupo(clave, 2, 60_000).ok, true);
  assert.equal(cupo(clave, 2, 60_000).ok, true);
  assert.equal(cupo(clave, 2, 60_000).ok, false);
});

test("la IP sale de x-real-ip o del primer x-forwarded-for, cortada a 64", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://127.0.0.1:8080/api/v1/session", { headers });
  assert.equal(ipDe(req({ "x-real-ip": "200.1.2.3" })), "200.1.2.3");
  assert.equal(ipDe(req({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" })), "200.1.2.3");
  assert.equal(ipDe(req({ "x-real-ip": "9".repeat(80) })), "9".repeat(64));
  assert.equal(ipDe(req({})), "sin-ip");
});
