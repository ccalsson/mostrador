import { comercialMovil } from "@/lib/torre/movil-comercial";
import { nucleoMovil } from "@/lib/torre/movil-nucleo";
import { restoMovil } from "@/lib/torre/movil-resto";
import { torreNuevosMovil } from "@/lib/torre/movil-torre-nuevos";
import { torreFase3Movil } from "@/lib/torre/movil-torre-fase3";
import { torreFase4Movil } from "@/lib/torre/movil-torre-fase4";
import type { TorreFnMovil } from "@/lib/torre/movil-tipos";

// Lista blanca: solo las funciones registradas acá son llamables desde el teléfono.
export const registroMovil: Record<string, TorreFnMovil> = {
  ...nucleoMovil,
  ...comercialMovil,
  ...restoMovil,
  ...torreNuevosMovil,
  ...torreFase3Movil,
  ...torreFase4Movil,
};
