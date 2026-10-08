import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agruparPorPuesto,
  alcanzaStock,
  calcularScore,
  claveDePedido,
  contarBultos,
  estadoParaComprador,
  exigirTransicion,
  minutosEntre,
  nivelPara,
  puedeCalificar,
} from "./reglas.ts";

describe("carrito de varios puestos", () => {
  it("arma un pedido por tenant y no los mezcla", () => {
    const grupos = agruparPorPuesto([
      { tenantId: "roman", productoId: "p1", cantidad: 1 },
      { tenantId: "puesto7", productoId: "p2", cantidad: 2 },
      { tenantId: "roman", productoId: "p3", cantidad: 1 },
    ]);
    assert.equal(grupos.length, 2);
    assert.deepEqual(
      grupos.find((g) => g.tenantId === "roman")?.items.map((i) => i.productoId),
      ["p1", "p3"],
    );
  });
});

describe("stock e idempotencia", () => {
  it("rechaza cantidad de más y acepta la que entra", () => {
    assert.equal(alcanzaStock(3, 4), false);
    assert.equal(alcanzaStock(3, 2), true);
    assert.equal(alcanzaStock(3, 0), false);
  });

  it("la misma clave y el mismo puesto apuntan a un solo pedido", () => {
    assert.equal(claveDePedido("k1", "roman"), claveDePedido("k1", "roman"));
    assert.notEqual(claveDePedido("k1", "roman"), claveDePedido("k1", "puesto7"));
  });
});

describe("estados", () => {
  it("listo de Mostrador se muestra como preparado", () => {
    assert.equal(estadoParaComprador("listo", null), "preparado");
    assert.equal(estadoParaComprador("en_preparacion", "aceptado"), "en_preparacion");
    assert.equal(estadoParaComprador("listo", "retirado"), "retirado");
  });

  it("rechaza una transición inválida del cargador", () => {
    assert.throws(() => exigirTransicion("asignado", "entregado"), /No se puede pasar/);
    exigirTransicion("asignado", "aceptado");
    exigirTransicion("aceptado", "retirado");
    exigirTransicion("retirado", "entregado");
  });
});

describe("tiempos, ranking y calificación", () => {
  it("calcula minutos sin guardarlos como columna", () => {
    assert.equal(minutosEntre("2026-10-06T12:00:00.000Z", "2026-10-06T12:20:00.000Z"), 20);
    assert.equal(minutosEntre(null, "2026-10-06T12:20:00.000Z"), null);
  });

  it("el score no depende solo de las estrellas", () => {
    const conEstrellas = calcularScore({
      calificacionSuma: 5,
      calificacionCantidad: 1,
      recorridosCompletados: 0,
      entregasATiempo: 0,
      cancelaciones: 0,
    });
    const conTrabajo = calcularScore({
      calificacionSuma: 4,
      calificacionCantidad: 1,
      recorridosCompletados: 10,
      entregasATiempo: 8,
      cancelaciones: 0,
    });
    assert.ok(conTrabajo > conEstrellas);
  });

  it("suma solo los bultos y deja afuera los kilos", () => {
    assert.equal(
      contarBultos([
        { cantidad: 20, unidad: "bulto" },
        { cantidad: 30, unidad: "bulto" },
        { cantidad: 4, unidad: "kg" },
      ]),
      50,
    );
  });
  it("sube de nivel según los puntos y califica una sola vez", () => {
    const niveles = [
      { codigo: "nuevo", puntosMinimos: 0 },
      { codigo: "bronce", puntosMinimos: 50 },
      { codigo: "plata", puntosMinimos: 150 },
    ];
    assert.equal(nivelPara(49, niveles), "nuevo");
    assert.equal(nivelPara(50, niveles), "bronce");
    assert.equal(puedeCalificar("entregado", false), true);
    assert.equal(puedeCalificar("entregado", true), false);
    assert.equal(puedeCalificar("aceptado", false), false);
  });
});
