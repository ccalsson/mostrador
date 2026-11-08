import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validarCampania,
  validarSecuencia,
  validarOferta,
  calcularResumen,
  segmentoLabel,
  eventoLabel,
  condicionLabel,
  type CampaniaPush,
  type SecuenciaEmail,
  type OfertaAuto,
} from "./marketing-core.ts";

describe("validarCampania", () => {
  it("rechaza nombre vacio", () => {
    const result = validarCampania({ nombre: "", segmento: "todos", titulo: "Test", cuerpo: "Body" });
    assert.equal(result, "El nombre de la campania es obligatorio.");
  });

  it("rechaza segmento invalido", () => {
    const result = validarCampania({ nombre: "Test", segmento: "invalido", titulo: "Test", cuerpo: "Body" });
    assert.equal(result, "Segmento invalido.");
  });

  it("rechaza titulo vacio", () => {
    const result = validarCampania({ nombre: "Test", segmento: "todos", titulo: "", cuerpo: "Body" });
    assert.equal(result, "El titulo del push es obligatorio.");
  });

  it("rechaza cuerpo vacio", () => {
    const result = validarCampania({ nombre: "Test", segmento: "todos", titulo: "Test", cuerpo: "" });
    assert.equal(result, "El cuerpo del push es obligatorio.");
  });

  it("acepta campania valida", () => {
    const result = validarCampania({ nombre: "Test", segmento: "todos", titulo: "Titulo", cuerpo: "Cuerpo" });
    assert.equal(result, null);
  });
});

describe("validarSecuencia", () => {
  it("rechaza nombre vacio", () => {
    const result = validarSecuencia({ nombre: "", eventoTrigger: "registro", asunto: "Test", contenido: "Content" });
    assert.equal(result, "El nombre de la secuencia es obligatorio.");
  });

  it("rechaza evento trigger invalido", () => {
    const result = validarSecuencia({ nombre: "Test", eventoTrigger: "invalido", asunto: "Test", contenido: "Content" });
    assert.equal(result, "Evento trigger invalido.");
  });

  it("rechaza asunto vacio", () => {
    const result = validarSecuencia({ nombre: "Test", eventoTrigger: "registro", asunto: "", contenido: "Content" });
    assert.equal(result, "El asunto del email es obligatorio.");
  });

  it("rechaza contenido vacio", () => {
    const result = validarSecuencia({ nombre: "Test", eventoTrigger: "registro", asunto: "Test", contenido: "" });
    assert.equal(result, "El contenido del email es obligatorio.");
  });

  it("acepta secuencia valida", () => {
    const result = validarSecuencia({ nombre: "Test", eventoTrigger: "registro", asunto: "Asunto", contenido: "Contenido" });
    assert.equal(result, null);
  });
});

describe("validarOferta", () => {
  it("rechaza nombre vacio", () => {
    const result = validarOferta({ nombre: "", condicion: "carrito_abandonado", descuentoPct: 10, mensaje: "Test" });
    assert.equal(result, "El nombre de la oferta es obligatorio.");
  });

  it("rechaza condicion invalida", () => {
    const result = validarOferta({ nombre: "Test", condicion: "invalido", descuentoPct: 10, mensaje: "Test" });
    assert.equal(result, "Condicion invalida.");
  });

  it("rechaza descuento mayor a 100", () => {
    const result = validarOferta({ nombre: "Test", condicion: "carrito_abandonado", descuentoPct: 150, mensaje: "Test" });
    assert.equal(result, "El descuento debe ser un numero entre 0 y 100.");
  });

  it("rechaza descuento negativo", () => {
    const result = validarOferta({ nombre: "Test", condicion: "carrito_abandonado", descuentoPct: -5, mensaje: "Test" });
    assert.equal(result, "El descuento debe ser un numero entre 0 y 100.");
  });

  it("rechaza mensaje vacio", () => {
    const result = validarOferta({ nombre: "Test", condicion: "carrito_abandonado", descuentoPct: 10, mensaje: "" });
    assert.equal(result, "El mensaje de la oferta es obligatorio.");
  });

  it("acepta oferta valida", () => {
    const result = validarOferta({ nombre: "Test", condicion: "carrito_abandonado", descuentoPct: 10, mensaje: "Mensaje" });
    assert.equal(result, null);
  });
});

describe("calcularResumen", () => {
  const campanias: CampaniaPush[] = [
    { id: "c1", nombre: "Camp 1", segmento: "todos", titulo: "T", cuerpo: "B", estado: "borrador", programadoAt: null, enviadoAt: null, enviadosCount: 0, createdAt: "" },
    { id: "c2", nombre: "Camp 2", segmento: "compradores", titulo: "T", cuerpo: "B", estado: "programada", programadoAt: null, enviadoAt: null, enviadosCount: 0, createdAt: "" },
    { id: "c3", nombre: "Camp 3", segmento: "todos", titulo: "T", cuerpo: "B", estado: "enviada", programadoAt: null, enviadoAt: null, enviadosCount: 5, createdAt: "" },
    { id: "c4", nombre: "Camp 4", segmento: "todos", titulo: "T", cuerpo: "B", estado: "enviada", programadoAt: null, enviadoAt: null, enviadosCount: 10, createdAt: "" },
  ];

  const secuencias: SecuenciaEmail[] = [
    { id: "s1", nombre: "Seq 1", eventoTrigger: "registro", asunto: "A", contenido: "C", activo: true, createdAt: "" },
    { id: "s2", nombre: "Seq 2", eventoTrigger: "primera_compra", asunto: "A", contenido: "C", activo: false, createdAt: "" },
  ];

  const ofertas: OfertaAuto[] = [
    { id: "o1", nombre: "Oferta 1", condicion: "carrito_abandonado", descuentoPct: 10, mensaje: "M", activo: true, createdAt: "" },
    { id: "o2", nombre: "Oferta 2", condicion: "ticket_alto", descuentoPct: 20, mensaje: "M", activo: true, createdAt: "" },
    { id: "o3", nombre: "Oferta 3", condicion: "cliente_nuevo", descuentoPct: 5, mensaje: "M", activo: false, createdAt: "" },
  ];

  it("calcula totales correctamente", () => {
    const resumen = calcularResumen(campanias, secuencias, ofertas);
    assert.equal(resumen.campanias.total, 4);
    assert.equal(resumen.secuencias.total, 2);
    assert.equal(resumen.ofertas.total, 3);
  });

  it("calcula campanias activas (programadas)", () => {
    const resumen = calcularResumen(campanias, secuencias, ofertas);
    assert.equal(resumen.campanias.activas, 1);
  });

  it("calcula campanias enviadas", () => {
    const resumen = calcularResumen(campanias, secuencias, ofertas);
    assert.equal(resumen.campanias.enviadas, 2);
  });

  it("calcula campanias pendientes (borrador)", () => {
    const resumen = calcularResumen(campanias, secuencias, ofertas);
    assert.equal(resumen.campanias.pendientes, 1);
  });

  it("calcula secuencias activas", () => {
    const resumen = calcularResumen(campanias, secuencias, ofertas);
    assert.equal(resumen.secuencias.activas, 1);
  });

  it("calcula ofertas activas", () => {
    const resumen = calcularResumen(campanias, secuencias, ofertas);
    assert.equal(resumen.ofertas.activas, 2);
  });

  it("con listas vacias devuelve todo en cero", () => {
    const resumen = calcularResumen([], [], []);
    assert.equal(resumen.campanias.total, 0);
    assert.equal(resumen.secuencias.total, 0);
    assert.equal(resumen.ofertas.total, 0);
  });
});

describe("label functions", () => {
  it("segmentoLabel devuelve etiquetas esperadas", () => {
    assert.equal(segmentoLabel("todos"), "Todos los usuarios");
    assert.equal(segmentoLabel("compradores"), "Compradores");
    assert.equal(segmentoLabel("inactivos_30d"), "Inactivos 30 dias");
    assert.equal(segmentoLabel("inactivos_60d"), "Inactivos 60 dias");
    assert.equal(segmentoLabel("frecuentes"), "Compradores frecuentes");
  });

  it("eventoLabel devuelve etiquetas esperadas", () => {
    assert.equal(eventoLabel("registro"), "Registro de cuenta");
    assert.equal(eventoLabel("primera_compra"), "Primera compra");
    assert.equal(eventoLabel("inactividad_7d"), "Inactividad 7 dias");
    assert.equal(eventoLabel("inactividad_30d"), "Inactividad 30 dias");
    assert.equal(eventoLabel("cumpleanos"), "Cumpleanos");
  });

  it("condicionLabel devuelve etiquetas esperadas", () => {
    assert.equal(condicionLabel("carrito_abandonado"), "Carrito abandonado");
    assert.equal(condicionLabel("compra_repetida"), "Compra repetida");
    assert.equal(condicionLabel("ticket_alto"), "Ticket alto");
    assert.equal(condicionLabel("cliente_nuevo"), "Cliente nuevo");
  });
});
