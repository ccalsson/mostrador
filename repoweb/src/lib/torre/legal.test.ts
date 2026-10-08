import assert from "node:assert/strict";
import test from "node:test";
import { audienciasDe, beneficioVigente, hashDocumento, pendienteDeAceptacion, precioAplicable, versionEsInmutable } from "./legal.ts";
import { rolPermite } from "./roles.ts";

test("el hash lo define el texto canónico y no cambia por saltos de línea", () => {
  const a = hashDocumento("Hola\r\ncontrato");
  const b = hashDocumento("Hola\ncontrato");
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.notEqual(hashDocumento("Hola\ncontrato"), hashDocumento("Hola\ncontrato."));
});

test("una versión publicada es inmutable y la reaceptación depende del documento", () => {
  assert.equal(versionEsInmutable("published"), true);
  assert.equal(versionEsInmutable("draft"), false);
  assert.equal(pendienteDeAceptacion({ reacceptOnChange: false, publishedHash: null, acceptedHashes: [] }), false);
  assert.equal(pendienteDeAceptacion({ reacceptOnChange: true, publishedHash: "a", acceptedHashes: [] }), true);
  assert.equal(pendienteDeAceptacion({ reacceptOnChange: false, publishedHash: "b", acceptedHashes: ["a"] }), false);
  assert.equal(pendienteDeAceptacion({ reacceptOnChange: true, publishedHash: "b", acceptedHashes: ["a"] }), true);
  assert.equal(pendienteDeAceptacion({ reacceptOnChange: true, publishedHash: "a", acceptedHashes: ["a"] }), false);
});

test("cada perfil ve solo su audiencia y soporte no cambia precios", () => {
  assert.deepEqual(audienciasDe("mostrador"), ["saas_b2b", "privacy"]);
  assert.deepEqual(audienciasDe("comprador"), ["mercado_comprador", "privacy"]);
  assert.equal((audienciasDe("comprador") as readonly string[]).includes("saas_b2b"), false);
  assert.equal(rolPermite("soporte", "comercial"), false);
  assert.equal(rolPermite("legal", "legal"), true);
  assert.equal(rolPermite("comercial", "legal"), false);
  assert.equal(rolPermite("administracion", "acceso"), true);
  assert.equal(rolPermite("auditoria", "comercial"), false);
});

test("fundador es un beneficio por tenant y el precio contratado no se pisa", () => {
  assert.equal(beneficioVigente({ status: "active", startsOn: "2026-10-01", endsOn: "2027-10-01" }, "2026-12-01"), true);
  assert.equal(beneficioVigente({ status: "active", startsOn: "2026-10-01", endsOn: "2026-11-01" }, "2026-12-01"), false);
  assert.equal(beneficioVigente({ status: "revoked", startsOn: "2026-10-01", endsOn: null }, "2026-12-01"), false);
  assert.equal(precioAplicable(100, 180), 100);
});
