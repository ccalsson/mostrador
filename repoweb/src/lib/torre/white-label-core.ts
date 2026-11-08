/**
 * Logica pura de White-Label.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type WhiteLabelConfig = {
  id: string;
  tenantId: string;
  tenantNombre: string;
  clientNombre: string;
  marcaNombre: string;
  logoUrl: string;
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  colorTexto: string;
  fuente: string;
  template: string;
  dominioPropio: string | null;
  dominioActivo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhiteLabelInput = {
  marcaNombre: string;
  logoUrl: string;
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  colorTexto: string;
  fuente: string;
  template: string;
  dominioPropio?: string;
  dominioActivo?: boolean;
};

export const TEMPLATES = [
  { id: "clasico", label: "Clasico", descripcion: "Layout tradicional con header y sidebar" },
  { id: "moderno", label: "Moderno", descripcion: "Full-width con cards grandes" },
  { id: "minimal", label: "Minimal", descripcion: "Espacios limpios, tipografia grande" },
  { id: "vibrante", label: "Vibrante", descripcion: "Colores fuertes, gradientes" },
] as const;

export const FUENTES = ["Inter", "Poppins", "Roboto", "Montserrat", "Playfair Display"] as const;

/**
 * Verifica si un string es un color hex valido (#RGB o #RRGGBB).
 */
export function esHexValid(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

/**
 * Determina si sobre un fondo dado conviene texto claro u oscuro.
 * Usa la formula de luminancia relativa (WCAG).
 */
export function contrasteTexto(fondo: string): "claro" | "oscuro" {
  const hex = fondo.replace("#", "");
  let r: number, g: number, b: number;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  // Luminancia relativa (WCAG 2.x)
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.5 ? "oscuro" : "claro";
}

/**
 * Valida los datos de configuracion white-label.
 * Devuelve un mensaje de error o null si es valido.
 */
export function validarWhiteLabel(data: WhiteLabelInput): string | null {
  if (!data.marcaNombre.trim()) return "El nombre de marca es obligatorio.";
  if (data.marcaNombre.trim().length > 60) return "El nombre de marca no puede superar 60 caracteres.";

  const colores: [string, string][] = [
    [data.colorPrimario, "color primario"],
    [data.colorSecundario, "color secundario"],
    [data.colorFondo, "color de fondo"],
    [data.colorTexto, "color de texto"],
  ];
  for (const [color, nombre] of colores) {
    if (!esHexValid(color)) return `El ${nombre} debe ser un color hex valido (#RRGGBB).`;
  }

  const templateIds = TEMPLATES.map((t) => t.id);
  if (!templateIds.includes(data.template as (typeof TEMPLATES)[number]["id"])) {
    return "Template invalido.";
  }

  const fuentesList = FUENTES as readonly string[];
  if (!fuentesList.includes(data.fuente)) {
    return "Fuente invalida.";
  }

  if (data.dominioPropio && data.dominioPropio.trim()) {
    const dominio = data.dominioPropio.trim();
    if (dominio.includes(" ") || !dominio.includes(".")) {
      return "El dominio propio debe ser un dominio valido (ej: negocio.litoral.solutions).";
    }
  }

  return null;
}
