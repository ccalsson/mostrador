const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const arsFull = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: number, cents = false): string {
  if (!Number.isFinite(value)) return ars.format(0);
  return cents ? arsFull.format(value) : ars.format(Math.round(value));
}

export function qty(value: number, unidadLabel: string): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  return `${n} ${unidadLabel}${value === 1 ? "" : "s"}`.replace(/kgs$/i, "kg");
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  return 0;
}
