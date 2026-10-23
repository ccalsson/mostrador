/**
 * Helper para validar archivos subidos (foto de producto).
 *
 * Reglas:
 * - Tipos permitidos: image/jpeg, image/png, image/webp
 * - Tamaño máximo: 5 MB
 */

export const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
export const TAMANO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type TipoArchivo = (typeof TIPOS_PERMITIDOS)[number];

export interface ResultadoValidacion {
  ok: boolean;
  motivo?: string;
}

/**
 * Valida el tipo MIME y el tamaño de un archivo.
 * Devuelve un resultado con `ok: true` si es válido, o el motivo del rechazo.
 */
export function validarArchivo(mimeType: string, sizeBytes: number): ResultadoValidacion {
  if (!TIPOS_PERMITIDOS.includes(mimeType as TipoArchivo)) {
    return {
      ok: false,
      motivo: `Tipo de archivo no permitido (${mimeType}). Usá JPG, PNG o WebP.`,
    };
  }
  if (sizeBytes > TAMANO_MAX_BYTES) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      motivo: `El archivo pesa ${mb} MB. El máximo permitido es 5 MB.`,
    };
  }
  if (sizeBytes <= 0) {
    return { ok: false, motivo: "El archivo está vacío." };
  }
  return { ok: true };
}

/**
 * Devuelve la extensión normalizada para un MIME de imagen válido.
 */
export function extensionDe(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}
