import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pedidoFcm, pushDesdeWeb } from "./push.ts";

describe("push de Android", () => {
  it("la web no lo envía", () => {
    const resultado = pushDesdeWeb();
    assert.equal(resultado.enviado, false);
    assert.equal(resultado.canal, "android");
  });

  it("arma el pedido de Firebase y no inventa un proyecto", () => {
    const pedido = pedidoFcm({ titulo: "Llegó banana", cuerpo: "Hoy en el puesto", token: "dispositivo" }, "mostrador-android");
    assert.equal(pedido.url, "https://fcm.googleapis.com/v1/projects/mostrador-android/messages:send");
    assert.equal(pedido.body.message.notification.title, "Llegó banana");
    assert.throws(() => pedidoFcm({ titulo: "Aviso", cuerpo: "", token: "x" }, "  "), /proyecto/);
  });
});
