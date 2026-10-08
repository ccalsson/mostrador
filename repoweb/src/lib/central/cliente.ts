import { getBearerToken } from "@/lib/auth/client";
import { bloqueoSinRed, rutaPermitida } from "@/lib/central/reglas";

export { bloqueoSinRed, etiquetaAjuste, etiquetaCargo, etiquetaEstado, rutaPermitida, textoImporte } from "@/lib/central/reglas";

export class CentralClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "CentralClientError";
    this.status = status;
    this.code = code;
  }
}

export type AjusteLinea = {
  kind: string;
  percent: number | null;
  amount: number | null;
  startsOn: string;
  endsOn: string | null;
  status: string;
};

export type LineaCentral = {
  id: string;
  product: string;
  code: string;
  kind: string;
  quantity: number;
  unitPrice: number;
  effectivePrice: number;
  amountDue: number;
  bonus: number;
  discount: number;
  frozen: boolean;
  currency: string;
  frequency: string;
  charge: string;
  subtotal: number;
  status: string;
  startsOn: string;
  endsOn: string | null;
  adjustments: AjusteLinea[];
};

export type SuscripcionCentral = {
  id: string;
  status: string;
  plan: { code: string | null; name: string; currency: string; periodicity: string };
  startDate: string;
  nextPaymentDate: string | null;
  lines: LineaCentral[];
  grants: { code: string; startsOn: string; endsOn: string | null; conditions: string }[];
  commissionOverrides: { percent: number | null; startsOn: string; endsOn: string | null; status: string }[];
};

export type DocumentoPublicado = {
  id: string;
  code: string;
  title: string;
  audience: string;
  versionId: string;
  version: string;
  hash: string;
  reacceptOnChange: boolean;
};

export type PendienteCentral = {
  id: string;
  code: string;
  title: string;
  audience: string;
  version: string;
  hash: string;
  body: string;
};

export type VigenteCentral = {
  code: string;
  title: string;
  version: string;
  hash: string;
  body: string;
};

export type HistorialCentral = {
  hash: string;
  documentId: string;
};

type Modo = "mostrador" | "mercado";

async function pedir<T>(modo: Modo, ruta: string, method: "GET" | "POST", token?: string): Promise<T> {
  if (!rutaPermitida(modo, ruta)) {
    throw new CentralClientError("Esto es de la relación comercial del puesto.", 403, "not_a_tenant");
  }
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const bloqueo = bloqueoSinRed(method, online);
  if (bloqueo) throw new CentralClientError(bloqueo, 0, "offline");
  const headers = new Headers({ accept: "application/json" });
  if (modo === "mercado") {
    if (!token) throw new CentralClientError("Tenés que iniciar sesión.", 401, "unauthenticated");
    headers.set("authorization", `Bearer ${token}`);
  } else {
    const bearer = getBearerToken();
    if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  }
  const res = await fetch(`/api/central/v1/${ruta}`, { method, headers, credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new CentralClientError(data.error?.message || "No se pudo completar.", res.status, data.error?.code || "internal");
  }
  return data as T;
}

export function leerSuscripcion() {
  return pedir<{ subscription: SuscripcionCentral }>("mostrador", "subscription", "GET");
}

export function leerAddons() {
  return pedir<{ addons: LineaCentral[] }>("mostrador", "addons", "GET");
}

export function leerDocumentos(modo: Modo, token?: string) {
  return pedir<{ documents: DocumentoPublicado[] }>(modo, "legal-documents", "GET", token);
}

export function leerPendientes(modo: Modo, token?: string) {
  return pedir<{ pending: PendienteCentral[] }>(modo, "contracts/pending", "GET", token);
}

export function leerVigentes(modo: Modo, token?: string) {
  return pedir<{ current: VigenteCentral[] }>(modo, "contracts/current", "GET", token);
}

export function leerHistorial(modo: Modo, token?: string) {
  return pedir<{ history: HistorialCentral[] }>(modo, "contracts/history", "GET", token);
}

export function leerCapacidades() {
  return pedir<{
    tier: "presencia" | "pro" | null;
    presencia: boolean;
    cuentaCorriente: boolean;
    packs: { product: string; remaining: number; quantity: number; consumed: number; status: string }[];
    avisos: { id: string; placement: string; status: string; startsOn: string; endsOn: string; currency: string; price: number }[];
    comision: {
      source: "override" | "policy" | "none";
      percent: number | null;
      percentMin: number | null;
      percentMax: number | null;
    };
  }>("mostrador", "capabilities", "GET");
}

export function aceptarContrato(modo: Modo, id: string, token?: string) {
  return pedir<{ acceptanceId: string; hash: string; action: string }>(modo, `contracts/${id}/accept`, "POST", token);
}
