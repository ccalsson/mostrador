import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { consolidarClientes } from "./cliente-360-core.ts";

describe("consolidarClientes", () => {
  it("consolida clientes por email", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Juan", email: "juan@example.com", telefono: "123", tenantId: "t1" },
    ];
    const clientesMercado = [
      { id: "m1", nombre: "Juan Pérez", email: "juan@example.com", telefono: "123", userId: "u1" },
    ];
    const comprasMostrador = [{ clienteId: "c1", monto: 100, createdAt: "2026-01-01" }];
    const comprasMercado = [{ clienteId: "m1", monto: 200, createdAt: "2026-01-02" }];

    const resultado = consolidarClientes(
      clientesMostrador,
      clientesMercado,
      comprasMostrador,
      comprasMercado,
      [],
      [],
    );

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].email, "juan@example.com");
    assert.equal(resultado[0].lifetimeValue, 300);
    assert.equal(resultado[0].totalCompras, 2);
    assert.equal(resultado[0].apps.length, 2);
    assert.equal(resultado[0].ticketPromedio, 150);
  });

  it("calcula ticket promedio correctamente", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Ana", email: "ana@example.com", telefono: "456", tenantId: "t1" },
    ];
    const comprasMostrador = [
      { clienteId: "c1", monto: 100, createdAt: "2026-01-01" },
      { clienteId: "c1", monto: 200, createdAt: "2026-01-02" },
      { clienteId: "c1", monto: 300, createdAt: "2026-01-03" },
    ];

    const resultado = consolidarClientes(clientesMostrador, [], comprasMostrador, [], [], []);

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].lifetimeValue, 600);
    assert.equal(resultado[0].totalCompras, 3);
    assert.equal(resultado[0].ticketPromedio, 200);
  });

  it("identifica app preferida por monto total", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Luis", email: "luis@example.com", telefono: "789", tenantId: "t1" },
    ];
    const clientesMercado = [
      { id: "m1", nombre: "Luis", email: "luis@example.com", telefono: "789", userId: "u1" },
    ];
    const comprasMostrador = [{ clienteId: "c1", monto: 50, createdAt: "2026-01-01" }];
    const comprasMercado = [
      { clienteId: "m1", monto: 500, createdAt: "2026-01-02" },
      { clienteId: "m1", monto: 300, createdAt: "2026-01-03" },
    ];

    const resultado = consolidarClientes(
      clientesMostrador,
      clientesMercado,
      comprasMostrador,
      comprasMercado,
      [],
      [],
    );

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].appPreferida, "Mercado");
    assert.equal(resultado[0].lifetimeValue, 850);
  });

  it("maneja clientes sin email (usa telefono como clave)", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Pedro", email: null, telefono: "1112223333", tenantId: "t1" },
    ];
    const clientesMercado = [
      { id: "m1", nombre: "Pedro Gómez", email: null, telefono: "1112223333", userId: null },
    ];
    const comprasMostrador = [{ clienteId: "c1", monto: 100, createdAt: "2026-01-01" }];
    const comprasMercado = [{ clienteId: "m1", monto: 200, createdAt: "2026-01-02" }];

    const resultado = consolidarClientes(
      clientesMostrador,
      clientesMercado,
      comprasMostrador,
      comprasMercado,
      [],
      [],
    );

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].email, null);
    assert.equal(resultado[0].telefono, "1112223333");
    assert.equal(resultado[0].lifetimeValue, 300);
    assert.equal(resultado[0].totalCompras, 2);
    assert.equal(resultado[0].apps.length, 2);
  });

  it("no consolida clientes sin email ni telefono", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Sin Datos", email: null, telefono: null, tenantId: "t1" },
    ];

    const resultado = consolidarClientes(clientesMostrador, [], [], [], [], []);

    assert.equal(resultado.length, 0);
  });

  it("mantiene clientes separados por email distinto", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Ana", email: "ana@example.com", telefono: "111", tenantId: "t1" },
      { id: "c2", nombre: "Luis", email: "luis@example.com", telefono: "222", tenantId: "t1" },
    ];
    const comprasMostrador = [
      { clienteId: "c1", monto: 100, createdAt: "2026-01-01" },
      { clienteId: "c2", monto: 200, createdAt: "2026-01-02" },
    ];

    const resultado = consolidarClientes(clientesMostrador, [], comprasMostrador, [], [], []);

    assert.equal(resultado.length, 2);
  });

  it("calcula ultima actividad como la fecha mas reciente", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Maria", email: "maria@example.com", telefono: "333", tenantId: "t1" },
    ];
    const comprasMostrador = [
      { clienteId: "c1", monto: 100, createdAt: "2026-01-01" },
      { clienteId: "c1", monto: 200, createdAt: "2026-06-15" },
      { clienteId: "c1", monto: 50, createdAt: "2026-03-10" },
    ];

    const resultado = consolidarClientes(clientesMostrador, [], comprasMostrador, [], [], []);

    assert.equal(resultado[0].ultimaActividad, "2026-06-15");
  });

  it("cliente con cero compras tiene ticket promedio cero", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Nuevo", email: "nuevo@example.com", telefono: "444", tenantId: "t1" },
    ];

    const resultado = consolidarClientes(clientesMostrador, [], [], [], [], []);

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].lifetimeValue, 0);
    assert.equal(resultado[0].totalCompras, 0);
    assert.equal(resultado[0].ticketPromedio, 0);
    assert.equal(resultado[0].appPreferida, null);
  });

  it("Super al Toque se agrega como app cuando hay compras", () => {
    const clientesMercado = [
      { id: "m1", nombre: "Carlos", email: "carlos@example.com", telefono: "555", userId: "u1" },
    ];
    const comprasSuper = [{ clienteId: "m1", monto: 400, createdAt: "2026-02-01" }];

    const resultado = consolidarClientes(
      [],
      clientesMercado,
      [],
      [],
      comprasSuper,
      [],
    );

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].apps.length, 2);
    assert.ok(resultado[0].apps.some((a) => a.nombre === "Mercado"));
    assert.ok(resultado[0].apps.some((a) => a.nombre === "Super"));
    assert.equal(resultado[0].lifetimeValue, 400);
    assert.equal(resultado[0].appPreferida, "Super");
  });

  it("ignora compras con clienteId que no corresponde a ningun cliente", () => {
    const clientesMostrador = [
      { id: "c1", nombre: "Juan", email: "juan@example.com", telefono: "123", tenantId: "t1" },
    ];
    const comprasMostrador = [
      { clienteId: "c1", monto: 100, createdAt: "2026-01-01" },
      { clienteId: "c999", monto: 5000, createdAt: "2026-01-02" },
    ];

    const resultado = consolidarClientes(clientesMostrador, [], comprasMostrador, [], [], []);

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].lifetimeValue, 100);
    assert.equal(resultado[0].totalCompras, 1);
  });
});
