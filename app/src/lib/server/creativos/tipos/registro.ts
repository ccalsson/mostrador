import { z } from "zod";
import type { Staff } from "@/lib/types";

export type TipoPiezaId =
  | "banner"
  | "copy"
  | "push"
  | "post"
  | "email"
  | "descripcion"
  | "etiqueta"
  | "historia";

export interface TipoPieza {
  id: TipoPiezaId;
  nombre: string;
  descripcion: string;
  costoCreditos: number;
  necesitaImagen: boolean;
  schemaEntrada: z.ZodType<any>;
  plantillaPrompt(entrada: any, ctx: { casa: string }): string;
  schemaSalida: z.ZodType<any>;
  publicar?(variante: any, ctx: { staff: Staff; sql: any }): Promise<void>;
}

export const tiposPieza = new Map<TipoPiezaId, TipoPieza>();

export function registrarTipo(tipo: TipoPieza): void {
  tiposPieza.set(tipo.id, tipo);
}

export function obtenerTipo(id: TipoPiezaId): TipoPieza | undefined {
  return tiposPieza.get(id);
}

export function listarTipos(): TipoPieza[] {
  return Array.from(tiposPieza.values());
}
