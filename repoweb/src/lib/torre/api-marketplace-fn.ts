import { createServerFn } from "@tanstack/react-start";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import {
  crearApiKeyCore,
  crearWebhookCore,
  eliminarWebhookCore,
  listarApiKeysCore,
  listarWebhookLogCore,
  listarWebhooksCore,
  revocarApiKeyCore,
  type CrearApiKeyInput,
  type CrearWebhookInput,
} from "./api-marketplace-server";

export const listarApiKeys = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarApiKeysCore(email);
  });

export const crearApiKey = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: CrearApiKeyInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return crearApiKeyCore(email, data);
  });

export const revocarApiKey = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return revocarApiKeyCore(email, data);
  });

export const listarWebhooks = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarWebhooksCore(email);
  });

export const crearWebhook = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: CrearWebhookInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return crearWebhookCore(email, data);
  });

export const eliminarWebhook = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return eliminarWebhookCore(email, data);
  });

export const listarWebhookLog = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { webhookId: string; limite?: number }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return listarWebhookLogCore(email, data.webhookId, data.limite ?? 50);
  });
