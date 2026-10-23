import assert from "node:assert/strict";
import test from "node:test";

// --- Lógica pura de margen (copiada de context.ts para testear sin DB) ---

function calcularMargen(precio: number, costo: number | null): number | null {
  if (precio > 0 && costo != null && costo > 0) {
    return ((precio - costo) / precio) * 100;
  }
  return null;
}

function validarCosto(value: unknown): { ok: true; costo: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, costo: null };
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return { ok: false, error: "costo debe ser un número." };
  if (n < 0) return { ok: false, error: "costo debe ser un número positivo." };
  return { ok: true, costo: n };
}

// --- Tests de margen ---

test("calcularMargen: precio y costo positivos devuelven el porcentaje correcto", () => {
  // precio=100, costo=60 → margen = ((100-60)/100)*100 = 40
  assert.equal(calcularMargen(100, 60), 40);
});

test("calcularMargen: precio=200, costo=150 → margen = 25%", () => {
  assert.equal(calcularMargen(200, 150), 25);
});

test("calcularMargen: costo igual a precio → margen = 0%", () => {
  assert.equal(calcularMargen(100, 100), 0);
});

test("calcularMargen: costo mayor a precio → margen negativo", () => {
  // precio=80, costo=100 → ((80-100)/80)*100 = -25
  assert.equal(calcularMargen(80, 100), -25);
});

test("calcularMargen: precio cero → null", () => {
  assert.equal(calcularMargen(0, 50), null);
});

test("calcularMargen: precio negativo → null", () => {
  assert.equal(calcularMargen(-10, 5), null);
});

test("calcularMargen: costo null → null", () => {
  assert.equal(calcularMargen(100, null), null);
});

test("calcularMargen: costo cero → null", () => {
  assert.equal(calcularMargen(100, 0), null);
});

test("calcularMargen: costo negativo → null", () => {
  assert.equal(calcularMargen(100, -5), null);
});

test("calcularMargen: ambos cero → null", () => {
  assert.equal(calcularMargen(0, 0), null);
});

test("calcularMargen: valores decimales precisos", () => {
  // precio=3.50, costo=1.75 → ((3.50-1.75)/3.50)*100 = 50
  assert.equal(calcularMargen(3.5, 1.75), 50);
});

test("calcularMargen: resultado con decimales", () => {
  // precio=100, costo=33 → ((100-33)/100)*100 = 67
  assert.equal(calcularMargen(100, 33), 67);
});

// --- Tests de validación de costo ---

test("validarCosto: undefined es válido y retorna null", () => {
  const r = validarCosto(undefined);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.costo, null);
});

test("validarCosto: null es válido y retorna null", () => {
  const r = validarCosto(null);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.costo, null);
});

test("validarCosto: número positivo es válido", () => {
  const r = validarCosto(42.5);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.costo, 42.5);
});

test("validarCosto: cero es válido", () => {
  const r = validarCosto(0);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.costo, 0);
});

test("validarCosto: número negativo retorna error", () => {
  const r = validarCosto(-10);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /positivo/);
});

test("validarCosto: string no numérico retorna error", () => {
  const r = validarCosto("abc");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /número/);
});

test("validarCosto: NaN retorna error", () => {
  const r = validarCosto(Number.NaN);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /número/);
});

test("validarCosto: Infinity retorna error", () => {
  const r = validarCosto(Infinity);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /número/);
});
