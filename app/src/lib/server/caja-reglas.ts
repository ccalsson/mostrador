/**
 * Reglas puras del arqueo, aparte del servicio para probarlas sin base.
 *
 * El `real` que se carga al cerrar son los billetes de la gaveta, así que el
 * `esperado` sólo puede contar efectivo: mezclar tarjeta, transferencia o
 * cuenta corriente inflaba el número y todo cierre con cobros no efectivos
 * arrojaba una diferencia falsa — y su alerta de `caja_diferencia`.
 */

export type TotalPorForma = {
  formaPago: string;
  total: number;
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sumaMedio(totales: TotalPorForma[], forma: string): number {
  return totales
    .filter((t) => t.formaPago === forma)
    .reduce((acc, t) => acc + t.total, 0);
}

export function esperadoEnEfectivo(
  totales: TotalPorForma[],
  egresosEfectivo: number,
): number {
  return round2(sumaMedio(totales, "efectivo") - egresosEfectivo);
}
