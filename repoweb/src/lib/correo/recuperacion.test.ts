import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { correoRecuperacion, resendListo } from "./recuperacion.ts";

describe("recuperación por Resend", () => {
  it("arma el correo con el enlace y no manda si falta la clave", () => {
    assert.equal(resendListo(undefined), false);
    assert.equal(resendListo("  "), false);
    assert.equal(resendListo("re_test"), true);
    const correo = correoRecuperacion("caja@puesto.test", "https://mostrador.test/recuperar?token=abc", "Mostrador <avisos@mostrador.test>");
    assert.deepEqual(correo.to, ["caja@puesto.test"]);
    assert.match(correo.text, /token=abc/);
    assert.equal(correo.from, "Mostrador <avisos@mostrador.test>");
  });
});
