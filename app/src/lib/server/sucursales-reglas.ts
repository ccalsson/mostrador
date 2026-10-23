export type LineaCupo = {
  status: string;
  kind: string;
  slug: string;
  quantity: number;
  includedBranches?: number;
};

export function contextoSucursalCoincide(
  method: string,
  segments: string[],
  esperado: string | null,
  actual: string,
): boolean {
  if (method === "GET" && segments.length === 1 && segments[0] === "session") return true;
  return esperado === null || esperado === actual;
}

export function incluidasPorBase(lines: LineaCupo[]): number {
  let n = 0;
  for (const line of lines) {
    if (line.status !== "active" || line.kind !== "base_product") continue;
    n += line.includedBranches ?? 1;
  }
  return n;
}

export function cupoDeLineas(lines: LineaCupo[]): { incluidas: number; extras: number; cupo: number } {
  const incluidas = Math.max(1, incluidasPorBase(lines));
  const extras = lines
    .filter((line) => line.slug === "sucursal-extra" || line.kind === "branch")
    .reduce((suma, linea) => suma + linea.quantity, 0);
  return { incluidas, extras, cupo: incluidas + extras };
}

export function slugDe(nombre: string, id: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${base || "sucursal"}-${id.slice(-4)}`;
}

// Las sucursales copian la configuración de la casa sin el canal Mercado:
// el marketplace vive sólo en el puesto principal.
export function configSinMercado(raw: unknown): Record<string, unknown> {
  const base = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  base.mercadoAlToque = false;
  return base;
}
