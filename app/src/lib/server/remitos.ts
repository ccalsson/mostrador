import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { assertRole, audit, mapProducto } from "@/lib/server/context";
import { matchProduct } from "@/lib/server/match";
import { applyStock } from "@/lib/server/stock";
import type { Producto, Staff } from "@/lib/types";

export type CrearRemitoInput = {
  proveedor?: string;
  proveedorId?: string;
  fuente: "csv" | "foto" | "manual" | "pdf";
  archivoNombre?: string;
  lineas: { descripcion: string; cantidad: number; precio?: number }[];
};

export class RemitoVisionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RemitoVisionError";
    this.status = status;
    this.code = code;
  }
}

const MIME_VISION = ["image/jpeg", "image/png", "image/webp"] as const;

export async function leerRemitoFotoForStaff(
  staff: Staff,
  input: { imageBase64: string; mimeType: string },
): Promise<{ proveedor: string | null; lineas: { descripcion: string; cantidad: number; precio: number | null }[] }> {
  assertRole(staff, ["admin", "cajero"]);
  if (!(MIME_VISION as readonly string[]).includes(input.mimeType)) {
    throw new RemitoVisionError(400, "invalid_request", "mimeType debe ser image/jpeg, image/png o image/webp.");
  }
  if (input.imageBase64.length > 12_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.imageBase64)) {
    throw new RemitoVisionError(400, "invalid_request", "imageBase64 no es una imagen Base64 válida.");
  }
  const bytes = Buffer.from(input.imageBase64, "base64");
  if (bytes.length < 8 || bytes.length > 8_000_000) {
    throw new RemitoVisionError(400, "invalid_request", "La imagen excede el tamaño permitido (máx. 8 MB).");
  }
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new RemitoVisionError(503, "ocr_unavailable", "El lector de fotos no está disponible en este entorno.");
  }
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Extraé las líneas de este remito mayorista de frutas y verduras. Devolvé SOLO JSON: {"proveedor": string|null, "lineas":[{"descripcion":string,"cantidad":number,"precio":number|null}]}. Cantidad en bultos/cajones/kg según el papel. Sin markdown.',
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.imageBase64}`,
              },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new RemitoVisionError(502, "ocr_provider_error", `No se pudo leer la foto (${res.status}).`);
  }
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = body.choices[0]?.message.content ?? "";
  const jsonText = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(jsonText) as {
      proveedor?: string | null;
      lineas: { descripcion: string; cantidad: number; precio?: number | null }[];
    };
    return {
      proveedor: parsed.proveedor ?? null,
      lineas: (parsed.lineas ?? []).map((linea) => ({
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        precio: linea.precio ?? null,
      })),
    };
  } catch {
    throw new RemitoVisionError(422, "ocr_lectura_invalida", "No pude interpretar el remito. Cargalo a mano.");
  }
}

export async function crearRemitoForStaff(staff: Staff, input: CrearRemitoInput) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const id = newId("rem");
  let proveedor = input.proveedor?.trim() || null;
  let proveedorId: string | null = null;
  if (input.proveedorId) {
    const prov = await sql<{ nombre: string }>`
      select nombre from proveedores
      where id = ${input.proveedorId} and tenant_id = ${staff.tenantId} and activo = true
      limit 1
    `;
    if (!prov[0]) throw new Error("Elegí un proveedor activo.");
    proveedor = prov[0].nombre;
    proveedorId = input.proveedorId;
  }
  await sql`
    insert into remitos (id, tenant_id, proveedor, proveedor_id, fuente, estado, archivo_nombre)
    values (${id}, ${staff.tenantId}, ${proveedor}, ${proveedorId}, ${input.fuente}, ${"procesado"}, ${input.archivoNombre ?? null})
  `;
  const productosRows = await sql<{
    id: string;
    nombre: string;
    unidad: Producto["unidad"];
    unidad_label: string;
    precio: unknown;
    stock: unknown;
    stock_minimo: unknown;
    alias: unknown;
    activo: boolean;
  }>`select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo from productos where tenant_id = ${staff.tenantId} and activo = true`;
  const productos = productosRows.map(mapProducto);
  for (const line of input.lineas) {
    const match = matchProduct(line.descripcion, productos);
    await sql`
      insert into remito_items (
        id, remito_id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
      ) values (
        ${newId("rit")}, ${id}, ${line.descripcion}, ${match.producto?.id ?? null},
        ${line.cantidad}, ${line.precio ?? null}, ${match.score}, ${false}
      )
    `;
  }
  return { id };
}

export async function getRemitoForStaff(staff: Staff, id: string) {
  const sql = await getSql();
  const rem = await sql<{
    id: string;
    proveedor: string | null;
    proveedor_id: string | null;
    fuente: string;
    estado: string;
    archivo_nombre: string | null;
    created_at: string;
  }>`
    select id, proveedor, proveedor_id, fuente, estado, archivo_nombre, created_at::text as created_at
    from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
  `;
  if (!rem[0]) return null;
  const items = await sql<{
    id: string;
    descripcion_original: string;
    producto_id: string | null;
    cantidad: unknown;
    precio: unknown;
    confianza_match: unknown;
    confirmado: boolean;
  }>`
    select id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
    from remito_items where remito_id = ${id} order by descripcion_original
  `;
  const { created_at: createdAt, ...remito } = rem[0];
  return {
    ...remito,
    createdAt,
    items: items.map((it) => ({
      id: it.id,
      descripcionOriginal: it.descripcion_original,
      productoId: it.producto_id,
      cantidad: num(it.cantidad),
      precio: it.precio == null ? null : num(it.precio),
      confianza: num(it.confianza_match),
      confirmado: it.confirmado,
    })),
  };
}

export async function listRemitosForStaff(staff: Staff) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    proveedor: string | null;
    fuente: string;
    estado: string;
    created_at: string;
  }>`
    select id, proveedor, fuente, estado, created_at::text as created_at
    from remitos where tenant_id = ${staff.tenantId}
    order by created_at desc
    limit 30
  `;
  return rows.map((r) => ({
    id: r.id,
    proveedor: r.proveedor,
    fuente: r.fuente,
    estado: r.estado,
    createdAt: r.created_at,
  }));
}

export async function actualizarRemitoItemForStaff(
  staff: Staff,
  input: { id: string; productoId: string | null; cantidad: number; confirmado: boolean },
) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  await sql`
    update remito_items
    set producto_id = ${input.productoId}, cantidad = ${input.cantidad}, confirmado = ${input.confirmado}
    where id = ${input.id}
  `;
  return { ok: true as const };
}

export async function confirmarRemitoForStaff(staff: Staff, id: string) {
  assertRole(staff, ["admin", "cajero"]);
  const sql = await getSql();
  const rem = await sql<{ estado: string }>`
    select estado from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
  `;
  if (!rem[0]) throw new Error("Remito no encontrado.");
  if (rem[0].estado === "confirmado") return { ok: true as const };
  const items = await sql<{ producto_id: string | null; cantidad: unknown; confirmado: boolean }>`
    select producto_id, cantidad, confirmado from remito_items where remito_id = ${id}
  `;
  const confirmed = items.filter((i) => i.confirmado && i.producto_id);
  if (confirmed.length === 0) throw new Error("Confirmá al menos una línea para ingresar stock.");
  for (const item of confirmed) {
    if (!item.producto_id) continue;
    await applyStock({
      tenantId: staff.tenantId,
      productoId: item.producto_id,
      tipo: "entrada_remito",
      cantidad: num(item.cantidad),
      referencia: id,
      staff,
    });
  }
  await sql`
    update remitos set estado = 'confirmado', confirmado_at = now(), confirmado_por = ${staff.id}
    where id = ${id}
  `;
  await audit(staff.tenantId, staff, "confirmar_remito", "remito", {
    id,
    lineas: confirmed.length,
  });
  return { ok: true as const, lineas: confirmed.length };
}
