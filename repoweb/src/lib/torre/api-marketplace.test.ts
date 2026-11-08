import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import {
  validarApiKey,
  validarWebhook,
  generarKeyPrefix,
  generarApiKey,
} from "./api-marketplace-core.ts";

describe("validarApiKey", () => {
  it("rechaza nombre vacio", () => {
    const result = validarApiKey({ nombre: "", scopes: ["read"], rateLimitRpm: 60 });
    assert.equal(result, "El nombre de la clave es obligatorio.");
  });

  it("rechaza nombre solo espacios", () => {
    const result = validarApiKey({ nombre: "   ", scopes: ["read"], rateLimitRpm: 60 });
    assert.equal(result, "El nombre de la clave es obligatorio.");
  });

  it("rechaza scopes vacios", () => {
    const result = validarApiKey({ nombre: "Test", scopes: [], rateLimitRpm: 60 });
    assert.equal(result, "Debe seleccionar al menos un scope.");
  });

  it("rechaza scope invalido", () => {
    const result = validarApiKey({ nombre: "Test", scopes: ["admin"], rateLimitRpm: 60 });
    assert.equal(result, "Scope invalido: admin");
  });

  it("rechaza rate limit negativo", () => {
    const result = validarApiKey({ nombre: "Test", scopes: ["read"], rateLimitRpm: -1 });
    assert.equal(result, "El rate limit debe ser un entero positivo.");
  });

  it("rechaza rate limit cero", () => {
    const result = validarApiKey({ nombre: "Test", scopes: ["read"], rateLimitRpm: 0 });
    assert.equal(result, "El rate limit debe ser un entero positivo.");
  });

  it("acepta datos validos", () => {
    const result = validarApiKey({ nombre: "Mi Key", scopes: ["read", "write"], rateLimitRpm: 120 });
    assert.equal(result, null);
  });
});

describe("validarWebhook", () => {
  it("rechaza URL vacia", () => {
    const result = validarWebhook({ url: "", eventos: ["pedido.creado"] });
    assert.equal(result, "La URL del webhook es obligatoria.");
  });

  it("rechaza URL invalida", () => {
    const result = validarWebhook({ url: "no-es-url", eventos: ["pedido.creado"] });
    assert.equal(result, "La URL del webhook no es valida.");
  });

  it("rechaza URL con protocolo no HTTP", () => {
    const result = validarWebhook({ url: "ftp://example.com/hook", eventos: ["pedido.creado"] });
    assert.equal(result, "La URL debe ser HTTP o HTTPS.");
  });

  it("rechaza eventos vacios", () => {
    const result = validarWebhook({ url: "https://example.com/hook", eventos: [] });
    assert.equal(result, "Debe seleccionar al menos un evento.");
  });

  it("rechaza evento invalido", () => {
    const result = validarWebhook({ url: "https://example.com/hook", eventos: ["invalido"] });
    assert.equal(result, "Evento invalido: invalido");
  });

  it("acepta datos validos", () => {
    const result = validarWebhook({ url: "https://example.com/hook", eventos: ["pedido.creado", "pago.recibido"] });
    assert.equal(result, null);
  });

  it("acepta URL HTTP", () => {
    const result = validarWebhook({ url: "http://localhost:3000/hook", eventos: ["cliente.creado"] });
    assert.equal(result, null);
  });
});

describe("generarKeyPrefix", () => {
  it("retorna string que empieza con mk_live_", () => {
    const prefix = generarKeyPrefix();
    assert.ok(prefix.startsWith("mk_live_"));
  });

  it("tiene longitud correcta (mk_live_ + 8 hex chars = 16)", () => {
    const prefix = generarKeyPrefix();
    assert.equal(prefix.length, 16);
  });

  it("genera prefijos unicos", () => {
    const a = generarKeyPrefix();
    const b = generarKeyPrefix();
    assert.notEqual(a, b);
  });
});

describe("generarApiKey", () => {
  it("retorna objeto con keyPlano, keyHash y keyPrefix", () => {
    const result = generarApiKey();
    assert.ok(typeof result.keyPlano === "string");
    assert.ok(typeof result.keyHash === "string");
    assert.ok(typeof result.keyPrefix === "string");
  });

  it("keyPlano empieza con mk_", () => {
    const result = generarApiKey();
    assert.ok(result.keyPlano.startsWith("mk_"));
  });

  it("keyHash es SHA-256 hex (64 chars)", () => {
    const result = generarApiKey();
    assert.equal(result.keyHash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(result.keyHash));
  });

  it("keyPrefix muestra los primeros 12 chars mas ...", () => {
    const result = generarApiKey();
    assert.ok(result.keyPrefix.endsWith("..."));
    assert.equal(result.keyPrefix.length, 15);
  });

  it("hash es deterministico para la misma key", () => {
    const keyPlano = "mk_test_deterministic";
    const expected = createHash("sha256").update(keyPlano).digest("hex");
    // Generamos una key y verificamos que el hash corresponde
    const result = generarApiKey();
    // El hash de result.keyPlano debe ser result.keyHash
    const computed = createHash("sha256").update(result.keyPlano).digest("hex");
    assert.equal(computed, result.keyHash);
    // Y el hash esperado de una key fija es consistente
    const hash1 = createHash("sha256").update(keyPlano).digest("hex");
    const hash2 = createHash("sha256").update(keyPlano).digest("hex");
    assert.equal(hash1, hash2);
    assert.equal(hash1, expected);
  });

  it("genera keys unicas", () => {
    const a = generarApiKey();
    const b = generarApiKey();
    assert.notEqual(a.keyPlano, b.keyPlano);
    assert.notEqual(a.keyHash, b.keyHash);
  });
});
