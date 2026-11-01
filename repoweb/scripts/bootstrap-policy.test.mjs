import assert from "node:assert/strict";
import test from "node:test";
import { runBootstrap } from "./bootstrap-policy.ts";

test("Neon never runs the demo account and operation cleanup bootstrap", async () => {
  let ownerProvisioned = false;
  await runBootstrap({
    source: "neon",
    seedDemo: async () => assert.fail("No se deben crear cuentas demo ni limpiar operaciones en Neon"),
    provisionOwner: async () => { ownerProvisioned = true; },
  });
  assert.equal(ownerProvisioned, true);
});

test("the ephemeral preview retains its original demo bootstrap", async () => {
  let demoSeeded = false;
  await runBootstrap({
    source: "pglite",
    seedDemo: async () => { demoSeeded = true; },
    provisionOwner: async () => assert.fail("La semilla original ya provisiona al dueño"),
  });
  assert.equal(demoSeeded, true);
});

test("a failed owner bootstrap propagates so the caller can retry", async () => {
  await assert.rejects(runBootstrap({
    source: "neon",
    seedDemo: async () => assert.fail("No se debe usar la demo como fallback"),
    provisionOwner: async () => { throw new Error("Sin conexión"); },
  }), /Sin conexión/);
});
