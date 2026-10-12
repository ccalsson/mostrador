export const ADDONS_OFRECIDOS = ["addon", "advertising", "messaging"] as const;

export function seOfrece(kind: string) {
  return (ADDONS_OFRECIDOS as readonly string[]).includes(kind);
}

/** El importe lo fija el servidor. Transferencia en pesos, cuenta en dólares. */
export function cobroDeAddon(input: {
  medio: string;
  usd: number;
  ars: number | null;
  comprobante: boolean;
}): { currency: "USD" | "ARS"; amount: number } {
  if (input.medio === "transferencia") {
    if (input.ars == null) throw new Error("No hay dólar para convertir a pesos.");
    if (!input.comprobante) throw new Error("Subí el comprobante de la transferencia.");
    return { currency: "ARS", amount: input.ars };
  }
  if (input.medio === "cuenta") return { currency: "USD", amount: input.usd };
  throw new Error("El pago es transferencia o cuenta.");
}
