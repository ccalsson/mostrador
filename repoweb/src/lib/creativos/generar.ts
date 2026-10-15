import { leerTanda, TEXTOS_POR_FOTO } from "@/lib/creativos/precios";
import type { Formato } from "@/lib/creativos/precios";

export type { Formato };

export async function redactarTanda(formato: Formato, brief: string) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error("Falta DEEPSEEK_API_KEY. El texto no se puede armar.");
  const modelo = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
  const pieza = formato === "banner" ? "un banner de la portada" : "un aviso push corto";
  const respuesta = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      messages: [
        {
          role: "system",
          content:
            "Escribís para un puesto de frutas y verduras del Mercado Central. Sin gente, sin marcas reales, sin neon. Respondé solo JSON con imagen y textos. imagen es un solo pedido para la foto, en español, sin texto escrito dentro de la foto. textos son lecturas distintas del mismo aviso.",
        },
        {
          role: "user",
          content: `Una sola foto para ${pieza}. El puesto pide: ${brief}. Devolvé ${TEXTOS_POR_FOTO} textos, cada uno con titulo de hasta 40 caracteres y texto de hasta 90. Las lecturas tienen que decir cosas distintas, no repetir la frase.`,
        },
      ],
      thinking: { type: "disabled" },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!respuesta.ok) throw new Error("DeepSeek no respondió. No se descontaron créditos.");
  const data = (await respuesta.json()) as { choices?: { message?: { content?: string } }[] };
  const tanda = leerTanda(data.choices?.[0]?.message?.content ?? "");
  if (!tanda) throw new Error("La respuesta no sirvió para armar la pieza. No se descontaron créditos.");
  return tanda;
}

export async function pintarPieza(prompt: string) {
  const key = process.env.QWEN_API_KEY?.trim();
  if (!key) throw new Error("Falta QWEN_API_KEY. La imagen no se puede armar.");
  const url = process.env.QWEN_API_URL?.trim() || "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
  const modelo = process.env.QWEN_MODEL?.trim() || "qwen-image-3.0-pro";
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
      parameters: {
        watermark: false,
        size: "1024*1024",
        negative_prompt: "personas, caras, logos de marcas, neon, texto ilegible, baja resolución",
      },
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!respuesta.ok) throw new Error("Qwen no armó la imagen. No se descontaron créditos.");
  const data = (await respuesta.json()) as {
    output?: { choices?: { message?: { content?: { image?: string }[] } }[] };
  };
  const imagen = data.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
  if (!imagen) throw new Error("Qwen no devolvió la imagen. No se descontaron créditos.");
  return guardarImagen(imagen);
}

async function guardarImagen(url: string) {
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!respuesta.ok) return url;
    const tipo = respuesta.headers.get("content-type") ?? "image/png";
    if (!tipo.startsWith("image/")) return url;
    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    if (bytes.byteLength < 1_000 || bytes.byteLength > 900_000) return url;
    return `data:${tipo.split(";")[0]};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return url;
  }
}
