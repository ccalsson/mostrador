import assert from "node:assert/strict";
import test from "node:test";
import { extensionDe, TAMANO_MAX_BYTES, TIPOS_PERMITIDOS, validarArchivo } from "./file-validation.ts";

test("validarArchivo: acepta JPG válido", () => {
  const result = validarArchivo("image/jpeg", 1024);
  assert.equal(result.ok, true);
  assert.equal(result.motivo, undefined);
});

test("validarArchivo: acepta PNG válido", () => {
  const result = validarArchivo("image/png", 2 * 1024 * 1024);
  assert.equal(result.ok, true);
});

test("validarArchivo: acepta WebP válido", () => {
  const result = validarArchivo("image/webp", 5 * 1024 * 1024);
  assert.equal(result.ok, true);
});

test("validarArchivo: rechaza tipo MIME no permitido (gif)", () => {
  const result = validarArchivo("image/gif", 1024);
  assert.equal(result.ok, false);
  assert.ok(result.motivo?.includes("Tipo de archivo no permitido"));
  assert.ok(result.motivo?.includes("image/gif"));
});

test("validarArchivo: rechaza tipo MIME no permitido (svg)", () => {
  const result = validarArchivo("image/svg+xml", 1024);
  assert.equal(result.ok, false);
  assert.ok(result.motivo?.includes("JPG, PNG o WebP"));
});

test("validarArchivo: rechaza tipo completamente inválido", () => {
  const result = validarArchivo("application/pdf", 1024);
  assert.equal(result.ok, false);
});

test("validarArchivo: rechaza archivo que supera 5MB", () => {
  const result = validarArchivo("image/jpeg", TAMANO_MAX_BYTES + 1);
  assert.equal(result.ok, false);
  assert.ok(result.motivo?.includes("MB"));
  assert.ok(result.motivo?.includes("5 MB"));
});

test("validarArchivo: acepta archivo exactamente en el límite de 5MB", () => {
  const result = validarArchivo("image/jpeg", TAMANO_MAX_BYTES);
  assert.equal(result.ok, true);
});

test("validarArchivo: rechaza archivo de tamaño 0", () => {
  const result = validarArchivo("image/jpeg", 0);
  assert.equal(result.ok, false);
  assert.ok(result.motivo?.includes("vacío"));
});

test("validarArchivo: rechaza archivo con tamaño negativo", () => {
  const result = validarArchivo("image/png", -1);
  assert.equal(result.ok, false);
});

test("TIPOS_PERMITIDOS contiene exactamente los tres tipos esperados", () => {
  assert.deepEqual([...TIPOS_PERMITIDOS].sort(), ["image/jpeg", "image/png", "image/webp"]);
});

test("TAMANO_MAX_BYTES es 5MB en bytes", () => {
  assert.equal(TAMANO_MAX_BYTES, 5 * 1024 * 1024);
});

test("extensionDe: jpeg -> jpg", () => {
  assert.equal(extensionDe("image/jpeg"), "jpg");
});

test("extensionDe: png -> png", () => {
  assert.equal(extensionDe("image/png"), "png");
});

test("extensionDe: webp -> webp", () => {
  assert.equal(extensionDe("image/webp"), "webp");
});

test("extensionDe: tipo desconocido -> bin", () => {
  assert.equal(extensionDe("application/octet-stream"), "bin");
});
