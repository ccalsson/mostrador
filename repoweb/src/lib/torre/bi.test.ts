import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcularTendencia,
  calcularTendenciaRevenue,
  predecirDemanda,
  calcularRiesgoChurn,
  proyectarFinanzas,
  type PuntoTiempo,
} from "./bi-core.ts";

// ─── calcularTendencia ─────────────────────────────────────────────

describe("calcularTendencia", () => {
  it("datos lineales perfectos devuelven pendiente exacta y R²=1", () => {
    const puntos: PuntoTiempo[] = [
      { fecha: "2026-01-01", valor: 100 },
      { fecha: "2026-01-02", valor: 110 },
      { fecha: "2026-01-03", valor: 120 },
      { fecha: "2026-01-04", valor: 130 },
      { fecha: "2026-01-05", valor: 140 },
    ];
    const result = calcularTendencia(puntos);
    assert.equal(result.pendiente, 10);
    assert.equal(result.intercepto, 100);
    assert.equal(result.rCuadrado, 1);
  });

  it("array vacio devuelve todo en 0", () => {
    const result = calcularTendencia([]);
    assert.equal(result.pendiente, 0);
    assert.equal(result.intercepto, 0);
    assert.equal(result.rCuadrado, 0);
  });

  it("un solo punto devuelve pendiente 0", () => {
    const result = calcularTendencia([{ fecha: "2026-01-01", valor: 50 }]);
    assert.equal(result.pendiente, 0);
    assert.equal(result.intercepto, 50);
    assert.equal(result.rCuadrado, 1);
  });

  it("todos los valores iguales devuelve pendiente 0 y R²=1", () => {
    const puntos: PuntoTiempo[] = [
      { fecha: "2026-01-01", valor: 100 },
      { fecha: "2026-01-02", valor: 100 },
      { fecha: "2026-01-03", valor: 100 },
    ];
    const result = calcularTendencia(puntos);
    assert.equal(result.pendiente, 0);
    assert.equal(result.rCuadrado, 1);
  });

  it("pendiente negativa devuelve valor negativo", () => {
    const puntos: PuntoTiempo[] = [
      { fecha: "2026-01-01", valor: 200 },
      { fecha: "2026-01-02", valor: 150 },
      { fecha: "2026-01-03", valor: 100 },
    ];
    const result = calcularTendencia(puntos);
    assert.ok(result.pendiente < 0);
    assert.equal(result.rCuadrado, 1);
  });
});

// ─── calcularTendenciaRevenue ──────────────────────────────────────

describe("calcularTendenciaRevenue", () => {
  it("forecast extiende la tendencia", () => {
    const historico: PuntoTiempo[] = [
      { fecha: "2026-01-01", valor: 100 },
      { fecha: "2026-01-02", valor: 110 },
      { fecha: "2026-01-03", valor: 120 },
    ];
    const result = calcularTendenciaRevenue(historico, 3);
    assert.equal(result.forecast.length, 3);
    assert.equal(result.historico.length, 3);
    // El forecast debe continuar la tendencia ascendente
    assert.ok(result.forecast[0].valor > 0);
    assert.ok(result.forecast[2].valor >= result.forecast[0].valor);
  });

  it("con historico vacio devuelve forecast vacio", () => {
    const result = calcularTendenciaRevenue([], 30);
    assert.equal(result.forecast.length, 0);
    assert.equal(result.historico.length, 0);
    assert.equal(result.pendiente, 0);
  });

  it("crecimientoPct es positivo para tendencia ascendente", () => {
    const historico: PuntoTiempo[] = [];
    for (let i = 0; i < 30; i++) {
      historico.push({
        fecha: new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
        valor: 100 + i * 5,
      });
    }
    const result = calcularTendenciaRevenue(historico, 7);
    assert.ok(result.crecimientoPct > 0);
    assert.ok(result.rCuadrado > 0.9);
  });
});

// ─── predecirDemanda ───────────────────────────────────────────────

describe("predecirDemanda", () => {
  it("identifica tendencia subiendo", () => {
    const movimientos = [];
    for (let i = 0; i < 14; i++) {
      movimientos.push({
        producto: "Manzana",
        tenantNombre: "Negocio A",
        cantidad: 5 + i * 2, // creciente
        fecha: `2026-01-${String(i + 1).padStart(2, "0")}`,
      });
    }
    const result = predecirDemanda(movimientos);
    assert.equal(result.length, 1);
    assert.equal(result[0].producto, "Manzana");
    assert.equal(result[0].tendencia, "subiendo");
    assert.ok(result[0].prediccion7Dias > 0);
  });

  it("identifica tendencia bajando", () => {
    const movimientos = [];
    for (let i = 0; i < 14; i++) {
      movimientos.push({
        producto: "Pera",
        tenantNombre: "Negocio A",
        cantidad: Math.max(1, 30 - i * 2), // decreciente
        fecha: `2026-01-${String(i + 1).padStart(2, "0")}`,
      });
    }
    const result = predecirDemanda(movimientos);
    assert.equal(result.length, 1);
    assert.equal(result[0].tendencia, "bajando");
  });

  it("identifica tendencia estable", () => {
    const movimientos = [];
    for (let i = 0; i < 14; i++) {
      movimientos.push({
        producto: "Uva",
        tenantNombre: "Negocio A",
        cantidad: 10,
        fecha: `2026-01-${String(i + 1).padStart(2, "0")}`,
      });
    }
    const result = predecirDemanda(movimientos);
    assert.equal(result.length, 1);
    assert.equal(result[0].tendencia, "estable");
  });

  it("con array vacio devuelve array vacio", () => {
    const result = predecirDemanda([]);
    assert.equal(result.length, 0);
  });

  it("agrupa por producto y tenant", () => {
    const movimientos = [
      { producto: "A", tenantNombre: "T1", cantidad: 5, fecha: "2026-01-01" },
      { producto: "A", tenantNombre: "T2", cantidad: 10, fecha: "2026-01-01" },
      { producto: "B", tenantNombre: "T1", cantidad: 3, fecha: "2026-01-01" },
    ];
    const result = predecirDemanda(movimientos);
    assert.equal(result.length, 3);
  });

  it("confianza esta entre 0 y 1", () => {
    const movimientos = [];
    for (let i = 0; i < 10; i++) {
      movimientos.push({
        producto: "X",
        tenantNombre: "T",
        cantidad: 5 + Math.random() * 10,
        fecha: `2026-01-${String(i + 1).padStart(2, "0")}`,
      });
    }
    const result = predecirDemanda(movimientos);
    assert.ok(result[0].confianza >= 0 && result[0].confianza <= 1);
  });
});

// ─── calcularRiesgoChurn ───────────────────────────────────────────

describe("calcularRiesgoChurn", () => {
  it("clientes inactivos tienen score mas alto", () => {
    const hace100Dias = new Date();
    hace100Dias.setDate(hace100Dias.getDate() - 100);
    const hace5Dias = new Date();
    hace5Dias.setDate(hace5Dias.getDate() - 5);

    const clientes = [
      {
        id: "c1", nombre: "Inactivo", email: "in@test.com",
        ultimaActividad: hace100Dias.toISOString().slice(0, 10),
        totalCompras: 2, promedioMes: 0.5, mesesActivo: 4,
      },
      {
        id: "c2", nombre: "Activo", email: "ac@test.com",
        ultimaActividad: hace5Dias.toISOString().slice(0, 10),
        totalCompras: 20, promedioMes: 5, mesesActivo: 4,
      },
    ];
    const result = calcularRiesgoChurn(clientes);
    assert.equal(result.length, 2);
    // El inactivo debe tener score mas alto
    assert.ok(result[0].score > result[1].score);
    assert.equal(result[0].clienteId, "c1");
  });

  it("con array vacio devuelve array vacio", () => {
    const result = calcularRiesgoChurn([]);
    assert.equal(result.length, 0);
  });

  it("score esta entre 0 y 100", () => {
    const clientes = [
      {
        id: "c1", nombre: "Test", email: "t@test.com",
        ultimaActividad: "2025-01-01",
        totalCompras: 1, promedioMes: 0.1, mesesActivo: 12,
      },
    ];
    const result = calcularRiesgoChurn(clientes);
    assert.ok(result[0].score >= 0 && result[0].score <= 100);
  });

  it("resultado ordenado por score descendente", () => {
    const clientes = [
      { id: "c1", nombre: "A", email: "a@test.com", ultimaActividad: "2026-01-01", totalCompras: 10, promedioMes: 5, mesesActivo: 2 },
      { id: "c2", nombre: "B", email: "b@test.com", ultimaActividad: "2025-01-01", totalCompras: 1, promedioMes: 0.1, mesesActivo: 12 },
      { id: "c3", nombre: "C", email: "c@test.com", ultimaActividad: "2026-06-01", totalCompras: 20, promedioMes: 10, mesesActivo: 2 },
    ];
    const result = calcularRiesgoChurn(clientes);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });

  it("factores no esta vacio", () => {
    const clientes = [
      {
        id: "c1", nombre: "Test", email: "t@test.com",
        ultimaActividad: "2026-01-01",
        totalCompras: 10, promedioMes: 5, mesesActivo: 2,
      },
    ];
    const result = calcularRiesgoChurn(clientes);
    assert.ok(result[0].factores.length > 0);
  });
});

// ─── proyectarFinanzas ─────────────────────────────────────────────

describe("proyectarFinanzas", () => {
  it("proyecciones siguen la tendencia", () => {
    const ingresos: PuntoTiempo[] = [];
    const gastos: PuntoTiempo[] = [];
    for (let m = 0; m < 4; m++) {
      const mes = `2026-${String(m + 1).padStart(2, "0")}`;
      ingresos.push({ fecha: `${mes}-15`, valor: 1000 + m * 200 });
      gastos.push({ fecha: `${mes}-15`, valor: 500 + m * 50 });
    }
    const result = proyectarFinanzas(ingresos, gastos, 3);
    // Debe tener 4 meses reales + 3 proyectados = 7
    assert.equal(result.length, 7);
    // Los proyectados deben tener ingresosReales=null
    assert.equal(result[4].ingresosReales, null);
    assert.equal(result[5].ingresosReales, null);
    assert.equal(result[6].ingresosReales, null);
    // Los proyectados deben ser positivos
    assert.ok(result[6].ingresosProyectados > 0);
  });

  it("con datos vacios devuelve meses proyectados en 0", () => {
    const result = proyectarFinanzas([], [], 3);
    assert.equal(result.length, 3);
    for (const p of result) {
      assert.equal(p.ingresosProyectados, 0);
      assert.equal(p.gastosProyectados, 0);
    }
  });

  it("meses reales tienen ingresosReales no nulo", () => {
    const ingresos: PuntoTiempo[] = [
      { fecha: "2026-01-15", valor: 1000 },
      { fecha: "2026-02-15", valor: 1200 },
    ];
    const gastos: PuntoTiempo[] = [
      { fecha: "2026-01-15", valor: 500 },
    ];
    const result = proyectarFinanzas(ingresos, gastos, 1);
    // Meses reales con datos
    const conReal = result.filter((r) => r.ingresosReales !== null);
    assert.ok(conReal.length >= 1);
  });

  it("resultadoProyectado es la diferencia", () => {
    const ingresos: PuntoTiempo[] = [
      { fecha: "2026-01-15", valor: 1000 },
      { fecha: "2026-02-15", valor: 1200 },
      { fecha: "2026-03-15", valor: 1400 },
    ];
    const gastos: PuntoTiempo[] = [
      { fecha: "2026-01-15", valor: 500 },
      { fecha: "2026-02-15", valor: 600 },
      { fecha: "2026-03-15", valor: 700 },
    ];
    const result = proyectarFinanzas(ingresos, gastos, 2);
    for (const p of result) {
      const esperado = Math.round((p.ingresosProyectados - p.gastosProyectados) * 100) / 100;
      assert.equal(p.resultadoProyectado, esperado);
    }
  });
});
