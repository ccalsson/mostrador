import assert from "node:assert/strict";
import test from "node:test";

// ── Lógica pura de verificación de checklist ─────────────────────────
// La verificación real usa SQL, pero la regla de negocio es simple y
// se puede testear sin base: si hay items, todos deben estar completados.

type ItemResumen = { completado: boolean };

function evaluarChecklist(items: ItemResumen[]): { ok: boolean; pendientes: number } {
  if (items.length === 0) return { ok: true, pendientes: 0 };
  const pendientes = items.filter((i) => !i.completado).length;
  return { ok: pendientes === 0, pendientes };
}

test("checklist vacío permite entregar", () => {
  const result = evaluarChecklist([]);
  assert.equal(result.ok, true);
  assert.equal(result.pendientes, 0);
});

test("checklist con todos completados permite entregar", () => {
  const result = evaluarChecklist([
    { completado: true },
    { completado: true },
    { completado: true },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.pendientes, 0);
});

test("checklist con items pendientes bloquea la entrega", () => {
  const result = evaluarChecklist([
    { completado: true },
    { completado: false },
    { completado: false },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.pendientes, 2);
});

test("checklist con un solo item pendiente bloquea", () => {
  const result = evaluarChecklist([{ completado: false }]);
  assert.equal(result.ok, false);
  assert.equal(result.pendientes, 1);
});

test("checklist con todos pendientes bloquea", () => {
  const result = evaluarChecklist([
    { completado: false },
    { completado: false },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.pendientes, 2);
});
