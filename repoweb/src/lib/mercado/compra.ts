import { createServerFn } from "@tanstack/react-start";
import {
  habilitarCompraCore,
  listarComprasPendientesCore,
  requireTorre,
  torreGuard,
} from "@/lib/torre-fn";

export const listarComprasPendientes = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarComprasPendientesCore(email);
  });

export const habilitarCompra = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return habilitarCompraCore(email, data);
  });