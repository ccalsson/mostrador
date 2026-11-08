import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validarWhiteLabel,
  esHexValid,
  contrasteTexto,
  type WhiteLabelInput,
} from "./white-label-core.ts";

const baseValido: WhiteLabelInput = {
  marcaNombre: "Mi Marca",
  logoUrl: "https://ejemplo.com/logo.png",
  colorPrimario: "#1a7a4c",
  colorSecundario: "#e3c56a",
  colorFondo: "#ffffff",
  colorTexto: "#1a1a1a",
  fuente: "Inter",
  template: "clasico",
};

describe("esHexValid", () => {
  it("acepta #RRGGBB valido", () => {
    assert.equal(esHexValid("#1a7a4c"), true);
    assert.equal(esHexValid("#FFFFFF"), true);
    assert.equal(esHexValid("#000000"), true);
    assert.equal(esHexValid("#e3c56a"), true);
  });

  it("acepta #RGB corto", () => {
    assert.equal(esHexValid("#fff"), true);
    assert.equal(esHexValid("#000"), true);
    assert.equal(esHexValid("#abc"), true);
    assert.equal(esHexValid("#ABC"), true);
  });

  it("rechaza sin #", () => {
    assert.equal(esHexValid("1a7a4c"), false);
    assert.equal(esHexValid("fff"), false);
  });

  it("rechaza longitud incorrecta", () => {
    assert.equal(esHexValid("#ff"), false);
    assert.equal(esHexValid("#ffff"), false);
    assert.equal(esHexValid("#fffffff"), false);
    assert.equal(esHexValid("#ffffffff"), false);
  });

  it("rechaza caracteres no hex", () => {
    assert.equal(esHexValid("#gggggg"), false);
    assert.equal(esHexValid("#xyz"), false);
    assert.equal(esHexValid("#12345g"), false);
  });

  it("rechaza vacio", () => {
    assert.equal(esHexValid(""), false);
    assert.equal(esHexValid("#"), false);
  });

  it("rechaza palabras", () => {
    assert.equal(esHexValid("red"), false);
    assert.equal(esHexValid("transparent"), false);
  });
});

describe("contrasteTexto", () => {
  it("retorna 'oscuro' para fondos claros", () => {
    assert.equal(contrasteTexto("#ffffff"), "oscuro");
    assert.equal(contrasteTexto("#f0f0f0"), "oscuro");
    assert.equal(contrasteTexto("#e3c56a"), "oscuro");
  });

  it("retorna 'claro' para fondos oscuros", () => {
    assert.equal(contrasteTexto("#000000"), "claro");
    assert.equal(contrasteTexto("#1a1a1a"), "claro");
    assert.equal(contrasteTexto("#1a7a4c"), "claro");
  });

  it("funciona con formato corto", () => {
    assert.equal(contrasteTexto("#fff"), "oscuro");
    assert.equal(contrasteTexto("#000"), "claro");
  });
});

describe("validarWhiteLabel", () => {
  it("acepta datos validos", () => {
    assert.equal(validarWhiteLabel(baseValido), null);
  });

  it("rechaza marcaNombre vacio", () => {
    assert.equal(validarWhiteLabel({ ...baseValido, marcaNombre: "" }), "El nombre de marca es obligatorio.");
  });

  it("rechaza marcaNombre solo espacios", () => {
    assert.equal(validarWhiteLabel({ ...baseValido, marcaNombre: "   " }), "El nombre de marca es obligatorio.");
  });

  it("rechaza marcaNombre mayor a 60 caracteres", () => {
    const largo = "A".repeat(61);
    assert.equal(validarWhiteLabel({ ...baseValido, marcaNombre: largo }), "El nombre de marca no puede superar 60 caracteres.");
  });

  it("acepta marcaNombre de exactamente 60 caracteres", () => {
    const exacto = "A".repeat(60);
    assert.equal(validarWhiteLabel({ ...baseValido, marcaNombre: exacto }), null);
  });

  it("rechaza color primario invalido", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, colorPrimario: "rojo" }),
      "El color primario debe ser un color hex valido (#RRGGBB).",
    );
  });

  it("rechaza color secundario invalido", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, colorSecundario: "#gg" }),
      "El color secundario debe ser un color hex valido (#RRGGBB).",
    );
  });

  it("rechaza color fondo invalido", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, colorFondo: "12345" }),
      "El color de fondo debe ser un color hex valido (#RRGGBB).",
    );
  });

  it("rechaza color texto invalido", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, colorTexto: "#xyz" }),
      "El color de texto debe ser un color hex valido (#RRGGBB).",
    );
  });

  it("rechaza template invalido", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, template: "no-existe" }),
      "Template invalido.",
    );
  });

  it("acepta todos los templates validos", () => {
    for (const tpl of ["clasico", "moderno", "minimal", "vibrante"]) {
      assert.equal(validarWhiteLabel({ ...baseValido, template: tpl }), null);
    }
  });

  it("rechaza fuente invalida", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, fuente: "Comic Sans" }),
      "Fuente invalida.",
    );
  });

  it("acepta todas las fuentes validas", () => {
    for (const f of ["Inter", "Poppins", "Roboto", "Montserrat", "Playfair Display"]) {
      assert.equal(validarWhiteLabel({ ...baseValido, fuente: f }), null);
    }
  });

  it("rechaza dominioPropio sin punto", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, dominioPropio: "localhost" }),
      "El dominio propio debe ser un dominio valido (ej: negocio.litoral.solutions).",
    );
  });

  it("rechaza dominioPropio con espacios", () => {
    assert.equal(
      validarWhiteLabel({ ...baseValido, dominioPropio: "mi dominio.com" }),
      "El dominio propio debe ser un dominio valido (ej: negocio.litoral.solutions).",
    );
  });

  it("acepta dominioPropio valido", () => {
    assert.equal(validarWhiteLabel({ ...baseValido, dominioPropio: "negocio.litoral.solutions" }), null);
  });

  it("acepta dominioPropio vacio u omitido", () => {
    assert.equal(validarWhiteLabel({ ...baseValido, dominioPropio: "" }), null);
    assert.equal(validarWhiteLabel({ ...baseValido, dominioPropio: undefined }), null);
  });
});
