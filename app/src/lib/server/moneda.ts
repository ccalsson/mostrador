import { getSql } from "@/lib/db";
import { num } from "@/lib/money";

export type Moneda = "USD" | "ARS";

const FALLBACK_FX = 1600;
const FACTOR = 1.05;

export async function getCotizacion(): Promise<number> {
  try {
    const sql = await getSql();
    const rows = await sql<{ usd_ars: unknown }>`
      select usd_ars from torre.saas_fx_rates order by as_of desc limit 1
    `;
    const v = num(rows[0]?.usd_ars);
    return v > 0 ? v : FALLBACK_FX;
  } catch {
    return FALLBACK_FX;
  }
}

export function precioEnArs(precio: number, moneda: Moneda, cotizacion: number): number {
  if (moneda === "ARS") return Math.round(precio * 100) / 100;
  const raw = precio * cotizacion * FACTOR;
  return Math.ceil(raw / 100) * 100;
}
