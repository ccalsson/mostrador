export type PushPedido = { titulo: string; cuerpo: string; token: string };

/** La web no dispara el aviso. Android lo manda por Firebase cuando tenga el dispositivo. */
export function pushDesdeWeb() {
  return {
    enviado: false as const,
    canal: "android" as const,
    motivo: "El push no se envía desde la web. Queda para la app Android.",
  };
}

export function pedidoFcm(pedido: PushPedido, projectId: string) {
  const proyecto = projectId.trim();
  if (!proyecto || !pedido.token.trim() || !pedido.titulo.trim()) {
    throw new Error("Falta el proyecto, el dispositivo o el texto.");
  }
  return {
    url: `https://fcm.googleapis.com/v1/projects/${proyecto}/messages:send`,
    body: {
      message: {
        token: pedido.token.trim(),
        notification: { title: pedido.titulo.trim(), body: pedido.cuerpo.trim() },
      },
    },
  };
}
