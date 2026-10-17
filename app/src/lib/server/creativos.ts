import { getSql, type Sql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { assertRole, audit } from "@/lib/server/context";
import { cupoFirme } from "@/lib/seguridad/cupo-db";
import {
  CREDITOS_POR_FOTO,
  PAQUETES,
  TEXTOS_POR_FOTO,
  briefDe,
  formatoDe,
  leerTanda,
  piezasDe,
  type Formato,
} from "@/lib/server/creativos-reglas";
import type { Staff } from "@/lib/types";

export class CreativosError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CreativosError";
    this.status = status;
    this.code = code;
  }
}

export type VarianteCreativos = { id: string; n: number; titulo: string; texto: string; imagen: string };

// Saldo, pedidos y habilitaciones viven a nombre de la casa: los creativos no se
// heredan por sucursal.
export async function estadoCreativosForStaff(staff: Staff) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const saldo = await sql<{ creditos: number }>`
    select creditos from creativos_saldo where tenant_id = ${staff.casaId} limit 1
  `;
  const pedidos = await sql<{
    id: string;
    formato: string;
    cantidad: number;
    creditos: number;
    brief: string;
    estado: string;
    created_at: string;
  }>`
    select id, formato, cantidad, creditos, brief, estado, created_at::text as created_at
    from creativos_pedidos
    where tenant_id = ${staff.casaId}
    order by created_at desc
    limit 8
  `;
  const ids = pedidos.map((pedido) => pedido.id);
  const variantes = ids.length
    ? await sql<VarianteCreativos & { pedido_id: string }>`
        select id, pedido_id, n, titulo, texto, imagen
        from creativos_variantes
        where pedido_id = any(${ids}::text[])
        order by n
      `
    : [];
  return {
    creditos: Number(saldo[0]?.creditos ?? 0),
    costo: CREDITOS_POR_FOTO,
    textos: TEXTOS_POR_FOTO,
    paquetes: PAQUETES,
    piezas: await piezasHabilitadas(sql, staff.casaId),
    pedidos: pedidos.map((pedido) => ({
      id: pedido.id,
      formato: pedido.formato,
      cantidad: Number(pedido.cantidad),
      creditos: Number(pedido.creditos),
      brief: pedido.brief,
      estado: pedido.estado,
      createdAt: pedido.created_at,
      variantes: variantes
        .filter((item) => item.pedido_id === pedido.id)
        .map((item) => ({
          id: item.id,
          n: Number(item.n),
          titulo: item.titulo,
          texto: item.texto,
          imagen: item.imagen,
        })),
    })),
  };
}

export async function pedirCreativosForStaff(
  staff: Staff,
  input: { formato: string; brief: unknown },
): Promise<{ id: string; formato: Formato; creditos: number; saldo: number; variantes: VarianteCreativos[] }> {
  assertRole(staff, ["admin"]);
  const formato = formatoDe(input.formato);
  const brief = briefDe(input.brief);
  if (brief.length < 8) throw new Error("Contá un poco más qué tiene que decir la pieza.");
  const sql = await getSql();
  const habilitadas = await piezasHabilitadas(sql, staff.casaId);
  if (!habilitadas.includes(formato)) throw new Error("Torre todavía no habilitó esa pieza.");
  const golpe = await cupoFirme(`creativos:${staff.casaId}`, 12, 60 * 60 * 1000);
  if (!golpe.ok) throw new CreativosError(429, "cupo_agotado", "Demasiados pedidos. Esperá un momento.");
  const saldo = await sql<{ creditos: number }>`
    select creditos from creativos_saldo where tenant_id = ${staff.casaId} limit 1
  `;
  if (Number(saldo[0]?.creditos ?? 0) < CREDITOS_POR_FOTO) {
    throw new Error("No alcanzan los créditos para esa foto.");
  }
  const tanda = await redactarTanda(formato, brief);
  const imagen = await pintarPieza(tanda.imagen);
  const descuento = await sql<{ creditos: number }>`
    update creativos_saldo
    set creditos = creditos - ${CREDITOS_POR_FOTO}, updated_at = now()
    where tenant_id = ${staff.casaId} and creditos >= ${CREDITOS_POR_FOTO}
    returning creditos
  `;
  if (!descuento[0]) throw new Error("No alcanzan los créditos para esa foto.");
  const pedidoId = newId("crea");
  await sql`
    insert into creativos_pedidos (id, tenant_id, formato, cantidad, creditos, brief, estado)
    values (${pedidoId}, ${staff.casaId}, ${formato}, ${tanda.textos.length}, ${CREDITOS_POR_FOTO}, ${brief}, 'listo')
  `;
  const hechas: VarianteCreativos[] = [];
  for (let n = 0; n < tanda.textos.length; n += 1) {
    const texto = tanda.textos[n];
    const id = newId("var");
    await sql`
      insert into creativos_variantes (id, pedido_id, n, titulo, texto, imagen)
      values (${id}, ${pedidoId}, ${n + 1}, ${texto.titulo}, ${texto.texto}, ${imagen})
    `;
    hechas.push({ id, n: n + 1, titulo: texto.titulo, texto: texto.texto, imagen });
  }
  await audit(staff.casaId, staff, "pedir_creativos", "creativos_pedido", {
    pedidoId,
    formato,
    textos: hechas.length,
    creditos: CREDITOS_POR_FOTO,
  });
  return {
    id: pedidoId,
    formato,
    creditos: CREDITOS_POR_FOTO,
    saldo: Number(descuento[0].creditos),
    variantes: hechas,
  };
}

async function piezasHabilitadas(sql: Sql, casaId: string): Promise<Formato[]> {
  const estado = await sql<{ banner: boolean; push: boolean }>`
    select
      exists(
        select 1
        from torre.saas_ads a
        join torre.saas_tenants t on t.id = a.tenant_id
        where t.operational_tenant_ref = ${casaId}
          and a.status in ('scheduled', 'active')
          and a.ends_on >= current_date
      ) as banner,
      exists(
        select 1
        from torre.saas_message_packs k
        join torre.saas_tenants t on t.id = k.tenant_id
        where t.operational_tenant_ref = ${casaId}
          and k.status = 'active'
          and k.quantity > k.consumed
      ) as push
  `;
  const fila = estado[0];
  return piezasDe({ banner: Boolean(fila?.banner), push: Boolean(fila?.push) });
}

async function redactarTanda(formato: Formato, brief: string) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    throw new CreativosError(503, "creativos_unavailable", "Los creativos no están disponibles en este entorno.");
  }
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
  if (!respuesta.ok) {
    throw new CreativosError(502, "creativos_provider_error", "DeepSeek no respondió. No se descontaron créditos.");
  }
  const data = (await respuesta.json()) as { choices?: { message?: { content?: string } }[] };
  const tanda = leerTanda(data.choices?.[0]?.message?.content ?? "");
  if (!tanda) {
    throw new CreativosError(422, "creativos_texto_invalido", "La respuesta no sirvió para armar la pieza. No se descontaron créditos.");
  }
  return tanda;
}

async function pintarPieza(prompt: string) {
  const key = process.env.QWEN_API_KEY?.trim();
  if (!key) {
    throw new CreativosError(503, "creativos_unavailable", "Los creativos no están disponibles en este entorno.");
  }
  const url =
    process.env.QWEN_API_URL?.trim() ||
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
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
  if (!respuesta.ok) {
    throw new CreativosError(502, "creativos_provider_error", "Qwen no armó la imagen. No se descontaron créditos.");
  }
  const data = (await respuesta.json()) as {
    output?: { choices?: { message?: { content?: { image?: string }[] } }[] };
  };
  const imagen = data.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
  if (!imagen) {
    throw new CreativosError(422, "creativos_imagen_invalida", "Qwen no devolvió la imagen. No se descontaron créditos.");
  }
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
