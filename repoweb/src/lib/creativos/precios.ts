/** Una foto de la API. El texto trae cuatro lecturas y no se vuelve a pagar. */
export const CREDITOS_POR_FOTO = 4;
export const TEXTOS_POR_FOTO = 4;

export type Formato = "banner" | "push";

export function leerTanda(raw: string) {
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
