import { createServerFn } from "@tanstack/react-start";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import { cambiarSire, consultarSire } from "./sire-bridge";
import { z } from "zod";

export async function consultarSireCore(email: string) {
  await exigirAccion(email, "acceso");
  return consultarSire(process.env.SIRE_API_URL, process.env.SIRE_TORRE_SERVICE_TOKEN);
}

export const consultarInstitucionesSire = createServerFn({ method: "GET" }).middleware([torreGuard]).handler(async ({ context }) => {
  const email = await requireTorre(context.userId);
  return consultarSireCore(email);
});

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-institution"), operationId: z.string().uuid(), resourceId: z.string().uuid(), siteId: z.string().uuid(), institutionName: z.string().trim().min(1).max(180), siteName: z.string().trim().min(1).max(180), rectorEmail: z.string().trim().email().max(320) }).strict(),
  z.object({ action: z.literal("create-site"), operationId: z.string().uuid(), resourceId: z.string().uuid(), institutionId: z.string().min(1).max(128), parentSiteId: z.string().min(1).max(128), name: z.string().trim().min(1).max(180), kind: z.enum(["subsede", "extension"]) }).strict(),
  z.object({ action: z.literal("link-member"), operationId: z.string().uuid(), resourceId: z.string().uuid(), institutionId: z.string().min(1).max(128), siteId: z.string().min(1).max(128).nullable(), email: z.string().trim().email().max(320), role: z.enum(["docente", "preceptor", "secretaria", "coordinador"]) }).strict(),
  z.object({ action: z.literal("set-member-state"), operationId: z.string().uuid(), institutionId: z.string().min(1).max(128), membershipId: z.string().min(1).max(128), active: z.boolean() }).strict(),
]);
export async function modificarSireCore(email: string, raw: unknown) {
  await exigirAccion(email, "acceso");
  const request = input.parse(raw);
  const data = request.action === "create-institution"
    ? { operationId: request.operationId, institutionId: request.resourceId, institutionName: request.institutionName, siteId: request.siteId, siteName: request.siteName, rectorEmail: request.rectorEmail }
    : request.action === "create-site"
      ? { operationId: request.operationId, siteId: request.resourceId, institutionId: request.institutionId, parentSiteId: request.parentSiteId, name: request.name, kind: request.kind }
      : request.action === "link-member"
        ? { operationId: request.operationId, membershipId: request.resourceId, institutionId: request.institutionId, siteId: request.siteId, email: request.email, role: request.role }
        : { operationId: request.operationId, institutionId: request.institutionId, membershipId: request.membershipId, active: request.active };
  return cambiarSire(process.env.SIRE_API_URL, process.env.SIRE_TORRE_SERVICE_TOKEN, email, request.action, data);
}
export const modificarInstitucionSire = createServerFn({ method: "POST" }).middleware([torreGuard]).inputValidator(input).handler(async ({ context, data }) => {
  const email = await requireTorre(context.userId);
  return modificarSireCore(email, data);
});
