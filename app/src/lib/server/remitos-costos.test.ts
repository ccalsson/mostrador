import assert from "node:assert/strict";
import test from "node:test";

// --- Lógica pura extraída de tomarCostosDeRemitoForStaff (testeable sin DB) ---

/**
 * Filtra los items de un remito que aportan costo actualizable:
 * producto_id presente, precio no nulo y precio > 0.
 * Replica la lógica del caso de uso sin depender de la base de datos.
 */
function itemsConCostoActualizable(
  items: { producto_id: string | null; precio: number | null }[],
): { producto_id: string; costo: number }[] {
  return items
    .filter((i): i is { producto_id: string; precio: number } =>
      i.producto_id !== null && i.precio !== null && i.precio > 0,
    )
    .map((i) => ({ producto_id: i.producto_id, costo: i.precio }));
}

/**
 * Valida las precondiciones para tomar costos de un remito.
 * Devuelve null si todo OK, o un string con el motivo de rechazo.
 */
function validarPrecondiciones(
  remito: { estado: string } | null,
): string | null {
  if (!remito) return "Remito no encontrado.";
  if (remito.estado !== "confirmado") {
    return "El remito debe estar confirmado para tomar costos.";
  }
  return null;
}

// --- Tests de validarPrecondiciones ---

test("validarPrecondiciones: remito inexistente devuelve error", () => {
  assert.equal(validarPrecondiciones(null), "Remito no encontrado.");
});

test("validarPrecondiciones: remito no confirmado devuelve error", () => {
  assert.equal(
    validarPrecondiciones({ estado: "procesado" }),
    "El remito debe estar confirmado para tomar costos.",
  );
});

test("validarPrecondiciones: remito confirmado devuelve null (OK)", () => {
  assert.equal(validarPrecondiciones({ estado: "confirmado" }), null);
});

// --- Tests de itemsConCostoActualizable ---

test("itemsConCostoActualizable: filtra items sin producto_id", () => {
  const items = [
    { producto_id: null, precio: 100 },
    { producto_id: "prod_1", precio: 200 },
  ];
  const resultado = itemsConCostoActualizable(items);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].producto_id, "prod_1");
  assert.equal(resultado[0].costo, 200);
});

test("itemsConCostoActualizable: filtra items con precio nulo", () => {
  const items = [
    { producto_id: "prod_1", precio: null },
    { producto_id: "prod_2", precio: 50 },
  ];
  const resultado = itemsConCostoActualizable(items);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].producto_id, "prod_2");
});

test("itemsConCostoActualizable: filtra items con precio cero o negativo", () => {
  const items = [
    { producto_id: "prod_1", precio: 0 },
    { producto_id: "prod_2", precio: -10 },
    { producto_id: "prod_3", precio: 75 },
  ];
  const resultado = itemsConCostoActualizable(items);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].producto_id, "prod_3");
  assert.equal(resultado[0].costo, 75);
});

test("itemsConCostoActualizable: lista vacía devuelve vacío", () => {
  assert.equal(itemsConCostoActualizable([]).length, 0);
});

test("itemsConCostoActualizable: todos válidos devuelve todos", () => {
  const items = [
    { producto_id: "p1", precio: 10 },
    { producto_id: "p2", precio: 20 },
    { producto_id: "p3", precio: 30 },
  ];
  const resultado = itemsConCostoActualizable(items);
  assert.equal(resultado.length, 3);
});
