import { comercialMovil } from "@/lib/torre/movil-comercial";
import { nucleoMovil } from "@/lib/torre/movil-nucleo";
import { restoMovil } from "@/lib/torre/movil-resto";
import type { TorreFnMovil } from "@/lib/torre/movil-tipos";

// Lista blanca: solo las funciones registradas acá son llamables desde el teléfono.
export const registroMovil: Record<string, TorreFnMovil> = {
  ...nucleoMovil,
  ...comercialMovil,
  ...restoMovil,
};
