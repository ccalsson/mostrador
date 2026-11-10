import { createServerFn } from "@tanstack/react-start";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import {
  grantPromotionCore,
  listLegalCore,
  listProcessorsCore,
  listPromotionsCore,
  offerContractCore,
  publishVersionCore,
  saveDocumentCore,
  saveProcessorCore,
  savePromotionCore,
  type GrantPromotionInput,
  type OfferContractInput,
  type PublishVersionInput,
  type SaveDocumentInput,
  type SaveProcessorInput,
  type SavePromotionInput,
} from "./legal-server";

export const listLegal = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listLegalCore(email);
  });

export const saveDocument = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: SaveDocumentInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return saveDocumentCore(email, data);
  });

export const publishVersion = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: PublishVersionInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return publishVersionCore(email, data);
  });

export const offerContract = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: OfferContractInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return offerContractCore(email, data);
  });

export const listPromotions = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listPromotionsCore(email);
  });

export const savePromotion = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: SavePromotionInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return savePromotionCore(email, data);
  });

export const grantPromotion = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: GrantPromotionInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return grantPromotionCore(email, data);
  });

export const listProcessors = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listProcessorsCore(email);
  });

export const saveProcessor = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: SaveProcessorInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return saveProcessorCore(email, data);
  });
