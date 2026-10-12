import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cobroDeAddon, seOfrece } from "./addon-reglas.ts";
import { pesosDeDolar } from "./reglas.ts";

describe("addons que se pueden contratar", () => {
  it("ofrece plan, banner y push, y no ofrece comisión ni sucursal", () => {
    assert.equal(seOfrece("addon"), true);
    assert.equal(seOfrece("advertising"), true);
    assert.equal(seOfrece("messaging"), true);
    assert.equal(seOfrece("commission"), false);
    assert.equal(seOfrece("branch"), false);
    assert.equal(seOfrece("free"), false);
  });

  it("la transferencia cobra el peso convertido y exige comprobante", () => {
    const ars = pesosDeDolar(50, 1000);
    assert.deepEqual(cobroDeAddon({ medio: "transferencia", usd: 50, ars, comprobante: true }), {
      currency: "ARS",
      amount: 52500,
    });
    assert.throws(
      () => cobroDeAddon({ medio: "transferencia", usd: 50, ars, comprobante: false }),
      /comprobante/,
    );
    assert.throws(
      () => cobroDeAddon({ medio: "transferencia", usd: 50, ars: null, comprobante: true }),
      /dólar/,
    );
  });

  it("la cuenta queda en dólares y no convierte", () => {
    assert.deepEqual(cobroDeAddon({ medio: "cuenta", usd: 32, ars: 32000, comprobante: false }), {
      currency: "USD",
      amount: 32,
    });
    assert.throws(() => cobroDeAddon({ medio: "efectivo", usd: 32, ars: null, comprobante: false }), /transferencia o cuenta/);
  });
});
