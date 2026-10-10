import { createServerFn } from "@tanstack/react-start";
import { appApi } from "@/lib/app-api.server";
import { authMiddleware } from "@/lib/auth/middleware";
import type { PedidoEstado } from "@/lib/types";

export type Mensaje = {
  id: string;
  emisor: "cliente" | "negocio";
  cuerpo: string;
  createdAt: string;
};

type PaginaMensajes = { mensajes: Mensaje[]; hayMas: boolean };
type LadoConversacion = "cliente" | "negocio";

export const mensajesDelPedido = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { pedidoId: string; lado: LadoConversacion; antes?: string | null }) => input)
  .handler(async ({ context, data }) => {
    const path =
      data.lado === "cliente"
        ? ["portal", "pedidos", data.pedidoId, "mensajes"]
        : ["pedidos", data.pedidoId, "mensajes"];
    return appApi<PaginaMensajes>({
      token: context.token,
      method: "GET",
      path,
      query: { antes: data.antes ?? undefined },
    });
  });

export const enviarMensajePedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { pedidoId: string; lado: LadoConversacion; cuerpo: string }) => input)
  .handler(async ({ context, data }) => {
    const path =
      data.lado === "cliente"
        ? ["portal", "pedidos", data.pedidoId, "mensajes"]
        : ["pedidos", data.pedidoId, "mensajes"];
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path,
      body: { cuerpo: data.cuerpo },
    });
  });

export const conversacionesNegocio = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<{
      pedidoId: string;
      clienteNombre: string;
      estado: PedidoEstado;
      pedidoAt: string;
      ultimo: string;
      ultimoDe: "cliente" | "negocio";
      ultimoAt: string;
      sinLeer: number;
    }[]>({
      token: context.token,
      method: "GET",
      path: ["mensajes", "conversaciones"],
    }),
  );

export const misMensajesPendientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<{ pedidoId: string; n: number }[]>({
      token: context.token,
      method: "GET",
      path: ["portal", "mensajes-pendientes"],
    }),
  );
