export type Condicion = "ri" | "monotributo" | "exento" | "consumidor_final";

export const CONDICION_LABEL: Record<Condicion, string> = {
  ri: "IVA responsable inscripto",
  monotributo: "Responsable monotributo",
  exento: "IVA sujeto exento",
  consumidor_final: "Consumidor final",
};

export function esCondicion(value: string): value is Condicion {
  return value === "ri" || value === "monotributo" || value === "exento" || value === "consumidor_final";
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function cuitValido(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = pesos.reduce((acc, peso, i) => acc + Number(d[i]) * peso, 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  else if (dv === 10) dv = 9;
  return dv === Number(d[10]);
}

export function cbteTipo(emisor: Condicion, receptor: Condicion, nota: boolean): number {
  const factura = emisor === "ri" ? (receptor === "ri" ? 1 : 6) : 11;
  if (!nota) return factura;
  if (factura === 1) return 3;
  if (factura === 6) return 8;
  return 13;
}

export function nombreCbte(tipo: number): string {
  const nombres: Record<number, string> = {
    1: "Factura A",
    3: "Nota de crédito A",
    6: "Factura B",
    8: "Nota de crédito B",
    11: "Factura C",
    13: "Nota de crédito C",
  };
  return nombres[tipo] ?? `Comprobante ${tipo}`;
}

export function alicuotaId(rate: number): number {
  if (rate === 0) return 3;
  if (rate === 2.5) return 9;
  if (rate === 5) return 8;
  if (rate === 10.5) return 4;
  if (rate === 27) return 6;
  return 5;
}

export function condicionId(c: Condicion): number {
  if (c === "ri") return 1;
  if (c === "exento") return 4;
  if (c === "monotributo") return 6;
  return 5;
}

export function docReceptor(raw: string | null, tipoCbte: number): { docTipo: number; docNro: string } {
  const d = (raw ?? "").replace(/\D/g, "");
  const esA = tipoCbte === 1 || tipoCbte === 3;
  if (esA) {
    if (!cuitValido(d)) throw new Error("La factura A pide un CUIT válido del cliente.");
    return { docTipo: 80, docNro: d };
  }
  if (cuitValido(d)) return { docTipo: 80, docNro: d };
  if (d.length >= 7 && d.length <= 8) return { docTipo: 96, docNro: d };
  return { docTipo: 99, docNro: "0" };
}

export const TOPE_CONSUMIDOR_FINAL = 10_000_000;

export function validarReceptor(
  total: number,
  doc: { docTipo: number; docNro: string },
  condicion: Condicion,
) {
  if (condicion === "consumidor_final" && doc.docTipo === 99 && total >= TOPE_CONSUMIDOR_FINAL) {
    throw new Error("Desde $10.000.000 hay que identificar al cliente con DNI o CUIT.");
  }
}

export function numeroFiscal(puntoVenta: number, numero: number) {
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

export function desglosarLineas(totales: number[], rate: number, discrimina: boolean) {
  const partes = totales.map((total) => {
    const bruto = round2(total);
    if (!discrimina || rate <= 0) return { neto: bruto, iva: 0 };
    const neto = round2(bruto / (1 + rate / 100));
    return { neto, iva: round2(bruto - neto) };
  });
  const bruto = round2(totales.reduce((a, n) => a + n, 0));
  if (partes.length && discrimina && rate > 0) {
    const suma = round2(partes.reduce((a, p) => a + p.neto + p.iva, 0));
    const drift = round2(bruto - suma);
    if (drift !== 0) partes[partes.length - 1].iva = round2(partes[partes.length - 1].iva + drift);
  }
  const neto = round2(partes.reduce((a, p) => a + p.neto, 0));
  const iva = round2(partes.reduce((a, p) => a + p.iva, 0));
  return { partes, neto, iva, total: round2(neto + iva) };
}
