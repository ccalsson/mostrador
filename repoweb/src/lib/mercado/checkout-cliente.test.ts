import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cuerpoCheckout,
  esFalloAmbiguo,
  firmaCheckout,
  notaDePedido,
  resolverCheckout,
  type CheckoutPendiente,
} from "./checkout-cliente.ts";

const lineas = [
  { tenantId: "roman", productoId: "p1", cantidad: 2 },
  { tenantId: "puesto7", productoId: "p2", cantidad: 1 },
];

describe("checkout pendiente", () => {
  it("recorta la nota a 500 y no manda cantidades vacías", () => {
    assert.equal(notaDePedido("a".repeat(600)).length, 500);
    const cuerpo = cuerpoCheckout(
      [...lineas, { tenantId: "roman", productoId: "p3", cantidad: 0 }],
      "efectivo",
      "a".repeat(600),
    );
    assert.equal(cuerpo.items.length, 2);
    assert.equal(cuerpo.nota.length, 500);
    assert.equal(cuerpo.medioPago, "efectivo");
  });

  it("reintenta con la misma clave y el mismo cuerpo", () => {
    const cuerpo = cuerpoCheckout(lineas, "transferencia", "dejar en el portón");
    const guardado: CheckoutPendiente = { clave: "clave-fija", cuerpo };
    let creadas = 0;
    const primero = resolverCheckout(guardado, cuerpoCheckout(lineas, "transferencia", "dejar en el portón"), () => {
      creadas += 1;
      return "nueva";
    });
    assert.equal(primero.reutilizado, true);
    assert.equal(primero.envio.clave, "clave-fija");
    assert.equal(primero.envio.cuerpo, guardado.cuerpo);
    assert.equal(creadas, 0);
  });

  it("si cambia el carrito, la clave anterior queda invalidada", () => {
    const cuerpo = cuerpoCheckout(lineas, "efectivo", "");
    const guardado: CheckoutPendiente = { clave: "clave-fija", cuerpo };
    const cambiado = cuerpoCheckout(
      [{ tenantId: "roman", productoId: "p1", cantidad: 1 }],
      "efectivo",
      "",
    );
    assert.notEqual(firmaCheckout(cuerpo), firmaCheckout(cambiado));
    const siguiente = resolverCheckout(guardado, cambiado, () => "clave-nueva");
    assert.equal(siguiente.reutilizado, false);
    assert.equal(siguiente.envio.clave, "clave-nueva");
    assert.deepEqual(siguiente.envio.cuerpo, cambiado);
  });

  it("un corte de red es ambiguo y un rechazo de stock no", () => {
    assert.equal(esFalloAmbiguo(null), true);
    assert.equal(esFalloAmbiguo(503), true);
    assert.equal(esFalloAmbiguo(409), false);
    assert.equal(esFalloAmbiguo(400), false);
  });
});
