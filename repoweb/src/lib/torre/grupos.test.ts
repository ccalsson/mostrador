import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validarAsignacion,
  validarGrupo,
  calcularConsolidado,
} from "./grupos-core.ts";

describe("validarAsignacion", () => {
  it("rechaza clienteId vacio", () => {
    const result = validarAsignacion("", "grp_123");
    assert.equal(result, "El ID del cliente es obligatorio.");
  });

  it("rechaza grupoId vacio", () => {
    const result = validarAsignacion("cli_123", "");
    assert.equal(result, "El ID del grupo es obligatorio.");
  });

  it("rechaza clienteId solo espacios", () => {
    const result = validarAsignacion("   ", "grp_123");
    assert.equal(result, "El ID del cliente es obligatorio.");
  });

  it("rechaza grupoId solo espacios", () => {
    const result = validarAsignacion("cli_123", "   ");
    assert.equal(result, "El ID del grupo es obligatorio.");
  });

  it("acepta asignacion valida", () => {
    const result = validarAsignacion("cli_123", "grp_456");
    assert.equal(result, null);
  });
});

describe("validarGrupo", () => {
  it("rechaza nombre vacio", () => {
    const result = validarGrupo({ nombre: "" });
    assert.equal(result, "El nombre del grupo es obligatorio.");
  });

  it("rechaza nombre solo espacios", () => {
    const result = validarGrupo({ nombre: "   " });
    assert.equal(result, "El nombre del grupo es obligatorio.");
  });

  it("acepta nombre valido", () => {
    const result = validarGrupo({ nombre: "Grupo Test" });
    assert.equal(result, null);
  });
});

describe("calcularConsolidado", () => {
  it("suma revenue y tenants correctamente", () => {
    const result = calcularConsolidado([
      { revenue: 1000, tenantsCount: 2 },
      { revenue: 2500, tenantsCount: 3 },
      { revenue: 500, tenantsCount: 1 },
    ]);
    assert.equal(result.revenueTotal, 4000);
    assert.equal(result.tenantsTotal, 6);
    assert.equal(result.clientesCount, 3);
  });

  it("con array vacio devuelve todo en cero", () => {
    const result = calcularConsolidado([]);
    assert.equal(result.revenueTotal, 0);
    assert.equal(result.tenantsTotal, 0);
    assert.equal(result.clientesCount, 0);
  });

  it("cliente con cero tenants y cero revenue", () => {
    const result = calcularConsolidado([
      { revenue: 0, tenantsCount: 0 },
    ]);
    assert.equal(result.revenueTotal, 0);
    assert.equal(result.tenantsTotal, 0);
    assert.equal(result.clientesCount, 1);
  });

  it("mezcla de clientes con y sin datos", () => {
    const result = calcularConsolidado([
      { revenue: 5000, tenantsCount: 4 },
      { revenue: 0, tenantsCount: 0 },
      { revenue: 1500, tenantsCount: 2 },
    ]);
    assert.equal(result.revenueTotal, 6500);
    assert.equal(result.tenantsTotal, 6);
    assert.equal(result.clientesCount, 3);
  });

  it("grupo con un solo cliente", () => {
    const result = calcularConsolidado([
      { revenue: 999.99, tenantsCount: 1 },
    ]);
    assert.equal(result.revenueTotal, 999.99);
    assert.equal(result.tenantsTotal, 1);
    assert.equal(result.clientesCount, 1);
  });
});
