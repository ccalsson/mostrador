export const CREDITOS_POR_FOTO = 4;
export const TEXTOS_POR_FOTO = 4;

export type Formato = "banner" | "push";

export const PAQUETES = [
  { id: "prod_creditos_50", creditos: 50, usd: 5.99 },
  { id: "prod_creditos_100", creditos: 100, usd: 9.99 },
];

export function formatoDe(value: string): Formato {
  if (value === "banner" || value === "push") return value;
  throw new Error("Esa pieza no se pide desde acá.");
}

export function briefDe(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 400) : "";
}

export function piezasDe(estado: { banner: boolean; push: boolean }): Formato[] {
  const piezas: Formato[] = [];
  if (estado.banner) piezas.push("banner");
  if (estado.push) piezas.push("push");
  return piezas;
}

export type Tanda = {
  imagen: string;
  textos: { titulo: string; texto: string }[];
};

export function leerTanda(raw: string): Tanda | null {
  const inicio = raw.indexOf("{");
  const fin = raw.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const data = JSON.parse(raw.slice(inicio, fin + 1)) as {
      imagen?: unknown;
      textos?: { titulo?: unknown; texto?: unknown }[];
    };
    const imagen = typeof data.imagen === "string" ? data.imagen.trim().slice(0, 700) : "";
    const textos = (data.textos ?? [])
      .map((item) => ({
        titulo: typeof item.titulo === "string" ? item.titulo.trim().slice(0, 80) : "",
        texto: typeof item.texto === "string" ? item.texto.trim().slice(0, 180) : "",
      }))
      .filter((item) => item.titulo && item.texto)
      .slice(0, TEXTOS_POR_FOTO);
    if (!imagen || textos.length < 2) return null;
    return { imagen, textos };
  } catch {
    return null;
  }
}
