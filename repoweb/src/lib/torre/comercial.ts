import { sumarPeriodo } from "./reglas.ts";

export const ESTADOS_SUSCRIPCION = ["pending", "active", "past_due", "paused", "suspended", "cancelled"] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

const SIGUIENTE: Record<EstadoSuscripcion, readonly EstadoSuscripcion[]> = {
  pending: ["active", "cancelled"],
  active: ["past_due", "paused", "suspended", "cancelled"],
  past_due: ["active", "suspended", "cancelled"],
  paused: ["active", "cancelled"],
  suspended: ["active", "cancelled"],
  cancelled: [],
};

export function transicionSuscripcion(desde: string | null, hacia: string) {
  if (!ESTADOS_SUSCRIPCION.includes(hacia as EstadoSuscripcion)) return false;
  if (!desde) return hacia === "pending" || hacia === "active";
  if (desde === hacia) return true;
  if (!ESTADOS_SUSCRIPCION.includes(desde as EstadoSuscripcion)) return false;
  return SIGUIENTE[desde as EstadoSuscripcion].includes(hacia as EstadoSuscripcion);
}

export function sumarMeses(iso: string, months: number) {
  let cursor = iso.slice(0, 10);
  const n = Math.max(0, Math.floor(months));
  for (let i = 0; i < n; i += 1) {
    const next = sumarPeriodo("monthly", cursor);
    if (!next) return null;
    cursor = next;
  }
  return cursor;
}

export type LineaComercial = { id: string; slug: string; currency: string; unitPrice: number };

export type Efecto = {
  lineId: string | null;
  kind: "bonus" | "discount" | "freeze" | "commission_override";
  percent: number | null;
  amount: number | null;
  currency: string | null;
  startsOn: string;
  endsOn: string | null;
  note: string;
};

export type PromoConfig = {
  bonusMonths?: number;
  commissionPercent?: number;
  frozenMonths?: number;
  discountPercent?: number;
  productSlugs?: string[];
};

function redondo(value: number) {
  return Math.round(value * 100) / 100;
}

export function efectosDePromocion(input: { startsOn: string; config: PromoConfig; lines: LineaComercial[] }): Efecto[] {
  const slugs = (input.config.productSlugs ?? []).map((slug) => slug.trim()).filter(Boolean);
  const matching = input.lines.filter((line) => slugs.includes(line.slug));
  const out: Efecto[] = [];
  const bonusMonths = Number(input.config.bonusMonths ?? 0);
  const frozenMonths = Number(input.config.frozenMonths ?? 0);
  const targets = (kindNote: string) => {
    if (matching.length) return matching.map((line) => ({ line, note: kindNote }));
    if (!slugs.length) return [];
    return [{ line: null, note: `${kindNote} Pendiente de línea (${slugs.join(", ")}).` }];
  };
  if (bonusMonths > 0) {
    const ends = sumarMeses(input.startsOn, bonusMonths);
    for (const target of targets("Bonificación. No reescribe el precio contratado.")) {
      out.push({
        lineId: target.line?.id ?? null,
        kind: "bonus",
        percent: 100,
        amount: null,
        currency: target.line?.currency ?? null,
        startsOn: input.startsOn,
        endsOn: ends,
        note: target.note,
      });
    }
  }
  if (frozenMonths > 0) {
    const ends = sumarMeses(input.startsOn, frozenMonths);
    for (const target of targets("Precio congelado.")) {
      out.push({
        lineId: target.line?.id ?? null,
        kind: "freeze",
        percent: null,
        amount: target.line ? target.line.unitPrice : null,
        currency: target.line?.currency ?? null,
        startsOn: input.startsOn,
        endsOn: ends,
        note: `${target.note} El unitario contratado no se reemplaza.`,
      });
    }
  }
  if (typeof input.config.discountPercent === "number" && slugs.length) {
    for (const target of targets("Descuento.")) {
      out.push({
        lineId: target.line?.id ?? null,
        kind: "discount",
        percent: input.config.discountPercent,
        amount: null,
        currency: target.line?.currency ?? null,
        startsOn: input.startsOn,
        endsOn: null,
        note: `${target.note} No pisa el catálogo ni el precio contratado.`,
      });
    }
  }
  if (typeof input.config.commissionPercent === "number") {
    const months = bonusMonths > 0 ? bonusMonths : frozenMonths;
    out.push({
      lineId: null,
      kind: "commission_override",
      percent: input.config.commissionPercent,
      amount: null,
      currency: null,
      startsOn: input.startsOn,
      endsOn: months > 0 ? sumarMeses(input.startsOn, months) : null,
      note: "Comisión de venta online durante el beneficio. No es el precio del abono.",
    });
  }
  return out;
}

export function ajusteVigente(ajuste: { status: string; startsOn: string; endsOn: string | null }, today: string) {
  if (ajuste.status !== "active") return false;
  if (ajuste.startsOn > today) return false;
  if (ajuste.endsOn && ajuste.endsOn < today) return false;
  return true;
}

export function precioEfectivo(
  unit: number,
  adjustments: { kind: string; percent: number | null; amount: number | null; status: string; startsOn: string; endsOn: string | null }[],
  today: string,
) {
  const vivos = adjustments.filter((ajuste) => ajusteVigente(ajuste, today));
  let bonus = 0;
  for (const ajuste of vivos) {
    if (ajuste.kind !== "bonus") continue;
    bonus += unit * ((ajuste.percent ?? 0) / 100);
    if (ajuste.amount) bonus += ajuste.amount;
  }
  bonus = Math.min(unit, redondo(bonus));
  const rest = redondo(unit - bonus);
  let discount = 0;
  for (const ajuste of vivos) {
    if (ajuste.kind !== "discount") continue;
    discount += rest * ((ajuste.percent ?? 0) / 100);
    if (ajuste.amount) discount += ajuste.amount;
  }
  discount = Math.min(rest, redondo(discount));
  return {
    contracted: redondo(unit),
    bonus,
    discount,
    effective: redondo(unit - bonus - discount),
    frozen: vivos.some((ajuste) => ajuste.kind === "freeze"),
  };
}

export function lineaCongelada(
  adjustments: { kind: string; status: string; startsOn: string; endsOn: string | null }[],
  today: string,
) {
  return adjustments.some((ajuste) => ajuste.kind === "freeze" && ajusteVigente(ajuste, today));
}
