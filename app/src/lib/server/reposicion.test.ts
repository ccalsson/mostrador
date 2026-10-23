import assert from "node:assert/strict";
import test from "node:test";

// --- Lógica pura de cálculo de reposición (sin DB) ---

type ReposicionInput = {
  cantidadTotal: number;
  dias: number;
  stockActual: number;
  stockMinimo: number;
};

type ReposicionOutput = {
  cantidadSugerida: number;
  promedioDiario: number;
  incluir: boolean;
};

function calcularReposicion(input: ReposicionInput): ReposicionOutput {
  const promedioDiario = input.cantidadTotal / input.dias;
  const necesarioSemana = promedioDiario * 7;
  const cantidadSugerida = necesarioSemana - input.stockActual;
  const redondeado = Math.round(cantidadSugerida * 100) / 100;
  return {
    cantidadSugerida: redondeado,
    promedioDiario: Math.round(promedioDiario * 100) / 100,
    incluir: redondeado > input.stockMinimo,
  };
}

// --- Tests de cálculo ---

test("calcularReposicion: producto con alta venta y poco stock → sugiere comprar", () => {
  // Vendió 70 en 7 días → promedio 10/día → necesario 70
  // Stock actual: 10, stock mínimo: 5
  // Sugerencia: 70 - 10 = 60 (> 5, incluir)
  const r = calcularReposicion({ cantidadTotal: 70, dias: 7, stockActual: 10, stockMinimo: 5 });
  assert.equal(r.cantidadSugerida, 60);
  assert.equal(r.promedioDiario, 10);
  assert.equal(r.incluir, true);
});

test("calcularReposicion: producto con stock suficiente → no sugiere", () => {
  // Vendió 14 en 7 días → promedio 2/día → necesario 14
  // Stock actual: 20, stock mínimo: 5
  // Sugerencia: 14 - 20 = -6 (no incluir)
  const r = calcularReposicion({ cantidadTotal: 14, dias: 7, stockActual: 20, stockMinimo: 5 });
  assert.equal(r.cantidadSugerida, -6);
  assert.equal(r.incluir, false);
});

test("calcularReposicion: stock igual al necesario pero bajo mínimo → no incluye", () => {
  // Vendió 35 en 7 días → promedio 5/día → necesario 35
  // Stock actual: 32, stock mínimo: 5
  // Sugerencia: 35 - 32 = 3 (<= 5, no incluir)
  const r = calcularReposicion({ cantidadTotal: 35, dias: 7, stockActual: 32, stockMinimo: 5 });
  assert.equal(r.cantidadSugerida, 3);
  assert.equal(r.incluir, false);
});

test("calcularReposicion: período de 30 días con venta baja", () => {
  // Vendió 30 en 30 días → promedio 1/día → necesario 7
  // Stock actual: 0, stock mínimo: 5
  // Sugerencia: 7 - 0 = 7 (> 5, incluir)
  const r = calcularReposicion({ cantidadTotal: 30, dias: 30, stockActual: 0, stockMinimo: 5 });
  assert.equal(r.cantidadSugerida, 7);
  assert.equal(r.promedioDiario, 1);
  assert.equal(r.incluir, true);
});

test("calcularReposicion: sin ventas → no sugiere", () => {
  const r = calcularReposicion({ cantidadTotal: 0, dias: 7, stockActual: 10, stockMinimo: 5 });
  assert.equal(r.cantidadSugerida, -10);
  assert.equal(r.incluir, false);
});

test("calcularReposicion: stock mínimo 0 → incluye cualquier sugerencia positiva", () => {
  // Vendió 10 en 7 días → promedio ~1.43/día → necesario ~10
  // Stock actual: 9, stock mínimo: 0
  // Sugerencia: 10 - 9 = 1 (> 0, incluir)
  const r = calcularReposicion({ cantidadTotal: 10, dias: 7, stockActual: 9, stockMinimo: 0 });
  assert.equal(r.incluir, true);
  assert.ok(r.cantidadSugerida > 0);
});

test("calcularReposicion: valores decimales precisos", () => {
  // Vendió 10 en 3 días → promedio 3.33/día → necesario 23.33
  // Stock actual: 5, stock mínimo: 2
  // Sugerencia: 23.33 - 5 = 18.33 (> 2, incluir)
  const r = calcularReposicion({ cantidadTotal: 10, dias: 3, stockActual: 5, stockMinimo: 2 });
  assert.equal(r.promedioDiario, 3.33);
  assert.equal(r.cantidadSugerida, 18.33);
  assert.equal(r.incluir, true);
});

test("calcularReposicion: producto crítico (sugerencia > 2x promedio)", () => {
  // Vendió 70 en 7 días → promedio 10/día → necesario 70
  // Stock actual: 0, stock mínimo: 5
  // Sugerencia: 70 (> 2 * 10 = 20 → crítico)
  const r = calcularReposicion({ cantidadTotal: 70, dias: 7, stockActual: 0, stockMinimo: 5 });
  assert.equal(r.cantidadSugerida, 70);
  assert.equal(r.promedioDiario, 10);
  assert.ok(r.cantidadSugerida > 2 * r.promedioDiario);
});

// --- Tests de validación de parámetros ---

test("validar días: valores fuera de rango deben ser rechazados", () => {
  const validarDias = (dias: number) => Number.isInteger(dias) && dias >= 1 && dias <= 365;
  assert.equal(validarDias(0), false);
  assert.equal(validarDias(1), true);
  assert.equal(validarDias(7), true);
  assert.equal(validarDias(365), true);
  assert.equal(validarDias(366), false);
  assert.equal(validarDias(1.5), false);
});

test("validar stockMinimo: solo números positivos", () => {
  const validarStockMinimo = (v: number) => Number.isFinite(v) && v >= 0;
  assert.equal(validarStockMinimo(-1), false);
  assert.equal(validarStockMinimo(0), true);
  assert.equal(validarStockMinimo(5), true);
  assert.equal(validarStockMinimo(Number.NaN), false);
  assert.equal(validarStockMinimo(Number.POSITIVE_INFINITY), false);
});

// --- Tests de ordenamiento ---

test("las sugerencias se ordenan por cantidadSugerida descendente", () => {
  const sugerencias = [
    { productoId: "a", cantidadSugerida: 10 },
    { productoId: "b", cantidadSugerida: 50 },
    { productoId: "c", cantidadSugerida: 25 },
  ];
  sugerencias.sort((a, b) => b.cantidadSugerida - a.cantidadSugerida);
  assert.equal(sugerencias[0].productoId, "b");
  assert.equal(sugerencias[1].productoId, "c");
  assert.equal(sugerencias[2].productoId, "a");
});
