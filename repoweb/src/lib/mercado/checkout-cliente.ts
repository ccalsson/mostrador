export type ItemCheckout = { tenantId: string; productoId: string; cantidad: number };

export type CuerpoCheckout = {
  medioPago: "efectivo" | "transferencia" | "cuenta_corriente";
  nota: string;
  items: ItemCheckout[];
};

export type CheckoutPendiente = { clave: string; cuerpo: CuerpoCheckout };

const NOTA_MAX = 500;

export function notaDePedido(valor: string) {
  return valor.slice(0, NOTA_MAX);
}

export function cuerpoCheckout(
  lineas: { tenantId: string; productoId: string; cantidad: number }[],
  medioPago: "efectivo" | "transferencia" | "cuenta_corriente",
  nota: string,
): CuerpoCheckout {
  return {
    medioPago,
    nota: notaDePedido(nota),
    items: lineas
      .filter((linea) => linea.cantidad > 0)
      .map((linea) => ({
        tenantId: linea.tenantId,
        productoId: linea.productoId,
        cantidad: linea.cantidad,
      })),
  };
}

export function firmaCheckout(cuerpo: CuerpoCheckout) {
  const items = [...cuerpo.items].sort((a, b) =>
    `${a.tenantId}\0${a.productoId}`.localeCompare(`${b.tenantId}\0${b.productoId}`),
  );
  return JSON.stringify({ medioPago: cuerpo.medioPago, nota: cuerpo.nota, items });
}

/** Reutiliza clave y cuerpo si el checkout no cambió. Si cambió, la clave anterior no sirve. */
export function resolverCheckout(
  guardado: CheckoutPendiente | null,
  cuerpo: CuerpoCheckout,
  nuevaClave: () => string,
): { envio: CheckoutPendiente; reutilizado: boolean } {
  if (guardado && firmaCheckout(guardado.cuerpo) === firmaCheckout(cuerpo)) {
    return { envio: guardado, reutilizado: true };
  }
  return { envio: { clave: nuevaClave(), cuerpo }, reutilizado: false };
}

/** Sin respuesta, o un fallo en el que el servidor pudo haber creado el pedido. */
export function esFalloAmbiguo(status: number | null) {
  if (status == null) return true;
  return status === 408 || status === 429 || status >= 500;
}
