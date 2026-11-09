export const PLANTILLAS = [
  { id: "oferta", nombre: "Oferta", pideProducto: true, pideFrase: false },
  { id: "llegada", nombre: "Llegó", pideProducto: true, pideFrase: false },
  { id: "precio", nombre: "Precio", pideProducto: true, pideFrase: false },
  { id: "puesto", nombre: "El puesto", pideProducto: false, pideFrase: true },
] as const;

export type PlantillaId = (typeof PLANTILLAS)[number]["id"];

export type BannerGuardado = {
  adId: string;
  plantilla: PlantillaId;
  productoId: string | null;
  frase: string;
};

const IDS = new Set<string>(PLANTILLAS.map((item) => item.id));

export function esPlantilla(id: string): id is PlantillaId {
  return IDS.has(id);
}

export function leerBanners(config: unknown): BannerGuardado[] {
  let value = config;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  const raw = !value || typeof value !== "object" ? null : (value as { banners?: unknown }).banners;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { adId?: unknown; plantilla?: unknown; productoId?: unknown; frase?: unknown };
    if (typeof row.adId !== "string" || !row.adId || typeof row.plantilla !== "string" || !esPlantilla(row.plantilla)) return [];
    return [{
      adId: row.adId,
      plantilla: row.plantilla,
      productoId: typeof row.productoId === "string" && row.productoId ? row.productoId : null,
      frase: typeof row.frase === "string" ? row.frase.slice(0, 80) : "",
    }];
  });
}

export function armarBanner(input: {
  plantilla: PlantillaId;
  puesto: string;
  producto?: { nombre: string; unidadLabel: string } | null;
  frase: string;
}) {
  if ((input.plantilla === "oferta" || input.plantilla === "llegada" || input.plantilla === "precio") && !input.producto) return null;
  if (input.plantilla === "oferta" && input.producto) return { titulo: "Oferta", detalle: input.producto.nombre };
  if (input.plantilla === "llegada" && input.producto) return { titulo: "Llegó", detalle: `${input.producto.nombre} · ${input.producto.unidadLabel}` };
  if (input.plantilla === "precio" && input.producto) return { titulo: input.producto.nombre, detalle: input.producto.unidadLabel };
  if (!input.frase.trim()) return null;
  return { titulo: input.puesto, detalle: input.frase.trim() };
}
