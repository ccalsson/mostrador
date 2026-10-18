import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import type { Moneda } from "@/lib/types";

// Espejo literal de app/src/lib/server/moneda.ts: los dos backends escriben sobre la
// misma Neon DEV y dos fórmulas distintas es dinero cobrado de más o de menos.
// scripts/moneda-paridad.test.mjs compara los dos archivos.
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

/** La moneda la manda la fila: sin columna leída no se puede adivinar. */
export function monedaDeFila(valor: unknown): Moneda {
  if (valor === "ARS") return "ARS";
  if (valor === "USD") return "USD";
  throw new Error("El producto no trae moneda; no se puede cobrar.");
}

export function precioEnArs(precio: number, moneda: Moneda, cotizacion: number): number {
  if (moneda === "ARS") return Math.round(precio * 100) / 100;
  const raw = precio * cotizacion * FACTOR;
  return Math.ceil(raw / 100) * 100;
}

/** Cambiarle la etiqueta a un precio guardado sin cambiar lo que vale. */
export function reetiquetar(precio: number, de: Moneda, a: Moneda, cotizacion: number): number {
  if (de === a) return precio;
  const convertido = a === "ARS" ? precio * cotizacion : precio / cotizacion;
  return Math.round(convertido * 100) / 100;
}
