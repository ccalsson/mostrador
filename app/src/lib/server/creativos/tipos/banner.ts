import { z } from "zod";
import { registrarTipo, type TipoPieza } from "./registro";
import { TEXTOS_POR_FOTO } from "../../creativos-reglas";

const schemaEntrada = z.object({
  brief: z.string().min(8, "Contá un poco más qué tiene que decir la pieza.").max(400),
});

const schemaSalida = z.object({
  imagen: z.string().min(10, "La imagen es muy corta."),
  textos: z.array(
    z.object({
      titulo: z.string().max(40),
      texto: z.string().max(90),
    }),
  ).min(2),
});

export const banner: TipoPieza = {
  id: "banner",
  nombre: "Banner",
  descripcion: "Banner de la portada de Mercado al Toque",
  costoCreditos: 4,
  necesitaImagen: true,
  schemaEntrada,
  plantillaPrompt(entrada: { brief: string }) {
    return `Una sola foto para un banner de la portada. El puesto pide: ${entrada.brief}. Devolvé ${TEXTOS_POR_FOTO} textos, cada uno con titulo de hasta 40 caracteres y texto de hasta 90. Las lecturas tienen que decir cosas distintas, no repetir la frase.`;
  },
  schemaSalida,
};

registrarTipo(banner);
