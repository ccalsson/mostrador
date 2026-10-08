export function cmpVer(a: string, b: string) {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function sumarPeriodo(frecuencia: string, iso: string): string | null {
  if (frecuencia !== "monthly" && frecuencia !== "yearly") return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) return null;
  const months = frecuencia === "yearly" ? 12 : 1;
  const targetMonth = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), day)).toISOString().slice(0, 10);
}

export function aplicarPagoALinea(input: {
  status: string;
  frequency: string;
  paymentDate: string;
  nextDue: string | null;
}): { nextDue: string | null; paidThrough: string } | null {
  if (input.status !== "paid") return null;
  const base = input.nextDue || input.paymentDate;
  const next = sumarPeriodo(input.frequency, base);
  if (!next) return { nextDue: input.nextDue, paidThrough: input.paymentDate.slice(0, 10) };
  return { nextDue: next, paidThrough: base.slice(0, 10) };
}

export type LineaPrecio = {
  status: string;
  frequency: string;
  charge: string;
  currency: string;
  subtotal: number;
};

export function totalMensual(lines: LineaPrecio[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lines) {
    if (line.status !== "active" || line.frequency !== "monthly" || line.charge !== "recurring") continue;
    out[line.currency] = Math.round(((out[line.currency] ?? 0) + line.subtotal) * 100) / 100;
  }
  return out;
}

export function incluidasPorBase(lines: { status: string; kind: string; includedBranches?: number }[]): number {
  let n = 0;
  for (const line of lines) {
    if (line.status !== "active" || line.kind !== "base_product") continue;
    n += line.includedBranches ?? 1;
  }
  return n;
}

export function extrasFacturables(sucursalesActivas: number, incluidas: number): number {
  return Math.max(0, sucursalesActivas - Math.max(0, incluidas));
}

export function marcarIncluidas<T extends { id: string }>(
  activasMasViejasPrimero: T[],
  allowance: number,
): { id: string; included: boolean }[] {
  return activasMasViejasPrimero.map((row, index) => ({ id: row.id, included: index < allowance }));
}

export type PrecioCatalogo = {
  billing: string;
  frequency: string;
  setupUsd: number | null;
  setupArs: number | null;
  recurringUsd: number | null;
  recurringArs: number | null;
  onceUsd: number | null;
  onceArs: number | null;
};

export function precioSnapshot(
  product: PrecioCatalogo,
  currency: "USD" | "ARS",
  charge: "recurring" | "setup",
  fx: number | null,
): { unit: number; fxUsed: number | null } {
  const pick = (usd: number | null, ars: number | null) => {
    if (currency === "USD") {
      if (usd == null) throw new Error("Ese producto no tiene precio en USD.");
      return { unit: usd, fxUsed: null };
    }
    if (ars != null) return { unit: ars, fxUsed: null };
    if (usd == null || fx == null) throw new Error("No hay precio en ARS ni tipo de cambio para convertir.");
    return { unit: Math.round(usd * fx * 100) / 100, fxUsed: fx };
  };
  if (charge === "setup") return pick(product.setupUsd, product.setupArs);
  if (product.billing === "once" || product.frequency === "once") return pick(product.onceUsd, product.onceArs);
  return pick(product.recurringUsd, product.recurringArs);
}

export type ReleaseTarget = {
  scope: string;
  tenantId: string | null;
  branchId: string | null;
  status: string;
};

export type ReleaseRow = {
  id: string;
  version: string;
  status: string;
  publishedAt: string | null;
  targets: ReleaseTarget[];
};

const TARGET_OK = new Set(["approved", "deployed"]);

export function releaseVisible(
  row: ReleaseRow,
  audience: { tenantId?: string; branchId?: string },
): boolean {
  if (row.status !== "published") return false;
  const approved = row.targets.filter((target) => TARGET_OK.has(target.status));
  if (approved.length === 0 || approved.some((target) => target.scope === "all")) return true;
  if (audience.tenantId && approved.some((target) => (target.scope === "tenant" || target.scope === "beta") && target.tenantId === audience.tenantId)) {
    return true;
  }
  if (audience.branchId && approved.some((target) => target.scope === "branch" && target.branchId === audience.branchId)) {
    return true;
  }
  return false;
}

export function elegirManifest<T extends ReleaseRow>(rows: T[], audience: { tenantId?: string; branchId?: string }): T | null {
  const visible = rows.filter((row) => releaseVisible(row, audience));
  visible.sort((a, b) => cmpVer(b.version, a.version) || String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));
  return visible[0] ?? null;
}

export function hayActualizacion(actual: string | null | undefined, latest: string | null | undefined): boolean {
  if (!latest) return false;
  if (!actual) return true;
  return cmpVer(actual, latest) < 0;
}
