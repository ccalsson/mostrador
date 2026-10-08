import { createHash } from "node:crypto";

export const AUDIENCIAS = ["saas_b2b", "mercado_comprador", "mercado_cargador", "privacy", "other"] as const;
export type Audiencia = (typeof AUDIENCIAS)[number];

export function canonico(body: string) {
  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** SHA-256 del texto canónico. Lo calcula el backend. La app no es fuente de verdad. */
export function hashDocumento(body: string) {
  return createHash("sha256").update(canonico(body), "utf8").digest("hex");
}

export function versionEsInmutable(status: string) {
  return status === "published" || status === "retired";
}

export function audienciasDe(actor: "mostrador" | "comprador" | "cargador") {
  if (actor === "mostrador") return ["saas_b2b", "privacy"] as const;
  if (actor === "comprador") return ["mercado_comprador", "privacy"] as const;
  return ["mercado_cargador", "privacy"] as const;
}

export function pendienteDeAceptacion(input: {
  reacceptOnChange: boolean;
  publishedHash: string | null;
  acceptedHashes: string[];
}) {
  if (!input.publishedHash) return false;
  if (input.acceptedHashes.includes(input.publishedHash)) return false;
  if (input.acceptedHashes.length === 0) return true;
  return input.reacceptOnChange;
}

export function beneficioVigente(
  grant: { status: string; startsOn: string; endsOn: string | null },
  today: string,
) {
  if (grant.status !== "active") return false;
  if (grant.startsOn > today) return false;
  if (grant.endsOn && grant.endsOn < today) return false;
  return true;
}

/** El precio de una línea ya contratada no se reemplaza por el catálogo. */
export function precioAplicable(unitPrice: number, _catalogPrice: number) {
  return unitPrice;
}
