import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consolidarUsuarios,
  filtrarUsuarios,
  type UsuarioUnificado,
} from "./usuarios-core.ts";

describe("consolidarUsuarios", () => {
  it("usuario con acceso solo a staff genera app Mostrador", () => {
    const users = [{ id: "u1", nombre: "Juan", email: "juan@test.com", telefono: null, createdAt: "2024-01-01" }];
    const staff = [{ userId: "u1", rol: "admin", tenantNombre: "Negocio A", activo: true, ultimoLogin: "2024-06-01" }];
    const result = consolidarUsuarios(users, staff, [], [], []);
    assert.equal(result.length, 1);
    assert.equal(result[0].apps.length, 1);
    assert.equal(result[0].apps[0].app, "Mostrador");
    assert.equal(result[0].apps[0].rol, "admin");
  });

  it("usuario con comprador y cargador genera app Mercado con ambos roles", () => {
    const users = [{ id: "u1", nombre: "Maria", email: "maria@test.com", telefono: null, createdAt: "2024-01-01" }];
    const compradores = [{ userId: "u1", nombre: "Maria", email: "maria@test.com", telefono: "123" }];
    const cargadores = [{ userId: "u1", nombre: "Maria", email: "maria@test.com", telefono: "123", activo: true }];
    const result = consolidarUsuarios(users, [], compradores, cargadores, []);
    assert.equal(result.length, 1);
    const mercado = result[0].apps.find((a) => a.app === "Mercado");
    assert.ok(mercado);
    assert.ok(mercado.rol.includes("comprador"));
    assert.ok(mercado.rol.includes("cargador"));
  });

  it("usuario con acceso a Torre genera app Torre", () => {
    const users = [{ id: "u1", nombre: "Pedro", email: "pedro@test.com", telefono: null, createdAt: "2024-01-01" }];
    const torre = [{ email: "pedro@test.com", role: "soporte" }];
    const result = consolidarUsuarios(users, [], [], [], torre);
    assert.equal(result.length, 1);
    assert.equal(result[0].apps.length, 1);
    assert.equal(result[0].apps[0].app, "Torre");
    assert.equal(result[0].apps[0].rol, "soporte");
  });

  it("usuario en multiples apps tiene todas las apps", () => {
    const users = [{ id: "u1", nombre: "Ana", email: "ana@test.com", telefono: null, createdAt: "2024-01-01" }];
    const staff = [{ userId: "u1", rol: "vendedor", tenantNombre: "Negocio A", activo: true, ultimoLogin: null }];
    const compradores = [{ userId: "u1", nombre: "Ana", email: "ana@test.com", telefono: null }];
    const torre = [{ email: "ana@test.com", role: "comercial" }];
    const result = consolidarUsuarios(users, staff, compradores, [], torre);
    assert.equal(result.length, 1);
    assert.equal(result[0].apps.length, 3);
    const apps = result[0].apps.map((a) => a.app);
    assert.ok(apps.includes("Mostrador"));
    assert.ok(apps.includes("Mercado"));
    assert.ok(apps.includes("Torre"));
  });

  it("entradas vacias generan resultado vacio", () => {
    const result = consolidarUsuarios([], [], [], [], []);
    assert.equal(result.length, 0);
  });

  it("activoGlobal es true si al menos una app esta activa", () => {
    const users = [{ id: "u1", nombre: "Juan", email: "juan@test.com", telefono: null, createdAt: "2024-01-01" }];
    const staff = [{ userId: "u1", rol: "admin", tenantNombre: "Negocio A", activo: true, ultimoLogin: null }];
    const result = consolidarUsuarios(users, staff, [], [], []);
    assert.equal(result[0].activoGlobal, true);
  });

  it("activoGlobal es false si todas las apps estan inactivas", () => {
    const users = [{ id: "u1", nombre: "Juan", email: "juan@test.com", telefono: null, createdAt: "2024-01-01" }];
    const staff = [{ userId: "u1", rol: "admin", tenantNombre: "Negocio A", activo: false, ultimoLogin: null }];
    const result = consolidarUsuarios(users, staff, [], [], []);
    assert.equal(result[0].activoGlobal, false);
  });
});

describe("filtrarUsuarios", () => {
  function usuario(overrides: Partial<UsuarioUnificado> & { id: string; nombre: string }): UsuarioUnificado {
    return {
      email: "test@test.com",
      telefono: null,
      apps: [],
      appsCount: 0,
      ultimoLogin: null,
      creado: "2024-01-01",
      activoGlobal: true,
      ...overrides,
    };
  }

  const datos: UsuarioUnificado[] = [
    usuario({ id: "1", nombre: "Ana", email: "ana@test.com", apps: [{ app: "Mostrador", rol: "admin", activo: true }], appsCount: 1, activoGlobal: true }),
    usuario({ id: "2", nombre: "Bruno", email: "bruno@test.com", apps: [{ app: "Mercado", rol: "comprador", activo: true }], appsCount: 1, activoGlobal: true }),
    usuario({ id: "3", nombre: "Carlos", email: "carlos@test.com", apps: [{ app: "Torre", rol: "soporte", activo: true }], appsCount: 1, activoGlobal: true }),
    usuario({ id: "4", nombre: "Dora", email: "dora@test.com", apps: [{ app: "Mostrador", rol: "vendedor", activo: false }], appsCount: 1, activoGlobal: false }),
  ];

  it("filtra por app", () => {
    const result = filtrarUsuarios(datos, { app: "Mostrador" });
    assert.equal(result.length, 2);
    assert.ok(result.every((u) => u.apps.some((a) => a.app === "Mostrador")));
  });

  it("filtra por rol", () => {
    const result = filtrarUsuarios(datos, { rol: "comprador" });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Bruno");
  });

  it("filtra por busqueda en nombre", () => {
    const result = filtrarUsuarios(datos, { busqueda: "ana" });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Ana");
  });

  it("filtra por busqueda en email", () => {
    const result = filtrarUsuarios(datos, { busqueda: "bruno@test" });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Bruno");
  });

  it("filtra por activo", () => {
    const result = filtrarUsuarios(datos, { activo: false });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Dora");
  });

  it("combina filtros: app + busqueda", () => {
    const result = filtrarUsuarios(datos, { app: "Mostrador", busqueda: "ana" });
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, "Ana");
  });

  it("ordena por nombre", () => {
    const result = filtrarUsuarios(datos, {});
    assert.equal(result[0].nombre, "Ana");
    assert.equal(result[1].nombre, "Bruno");
    assert.equal(result[2].nombre, "Carlos");
    assert.equal(result[3].nombre, "Dora");
  });

  it("con array vacio devuelve vacio", () => {
    const result = filtrarUsuarios([], {});
    assert.equal(result.length, 0);
  });
});
