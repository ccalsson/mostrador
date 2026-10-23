import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { getSql } from "@/lib/db";
import { assertRole } from "@/lib/server/context";
import { extensionDe, validarArchivo, type ResultadoValidacion } from "@/lib/server/file-validation";
import type { Staff } from "@/lib/types";

/**
 * Resuelve la ruta absoluta dentro de `public/uploads/productos/`.
 * En producción (Vercel) el directorio de build es de solo lectura,
 * por lo que se usa process.cwd() como base. En desarrollo, Vite
 * sirve `public/` directamente.
 */
function uploadsDir(): string {
  return join(process.cwd(), "public", "uploads", "productos");
}

export class FotoProductoError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "FotoProductoError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Sube (o reemplaza) la foto de un producto.
 *
 * 1. Valida tipo y tamaño del archivo.
 * 2. Verifica que el producto exista y pertenezca al tenant.
 * 3. Borra la foto anterior si existía.
 * 4. Guarda el archivo en public/uploads/productos/{producto_id}/{timestamp}.{ext}
 * 5. Actualiza foto_url en la base.
 */
export async function subirFotoProductoForStaff(
  staff: Staff,
  productoId: string,
  file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
): Promise<{ foto_url: string }> {
  assertRole(staff, ["admin"]);

  // Validar archivo
  const validacion: ResultadoValidacion = validarArchivo(file.type, file.size);
  if (!validacion.ok) {
    throw new FotoProductoError(400, "archivo_invalido", validacion.motivo ?? "Archivo inválido.");
  }

  const sql = await getSql();

  // Verificar que el producto existe y pertenece al tenant
  const rows = await sql<{ id: string; foto_url: string | null }>`
    select id, foto_url from productos where id = ${productoId} and tenant_id = ${staff.tenantId}
  `;
  if (!rows[0]) {
    throw new FotoProductoError(404, "not_found", "Producto no encontrado.");
  }

  // Borrar foto anterior si existe
  const fotoAnterior = rows[0].foto_url;
  if (fotoAnterior) {
    await borrarArchivoFisico(fotoAnterior);
  }

  // Generar nombre de archivo
  const ext = extensionDe(file.type);
  const timestamp = Date.now();
  const nombreArchivo = `${timestamp}.${ext}`;
  const dir = join(uploadsDir(), productoId);

  // Asegurar que el directorio existe
  await mkdir(dir, { recursive: true });

  // Escribir archivo
  const buffer = Buffer.from(await file.arrayBuffer());
  const rutaAbsoluta = join(dir, nombreArchivo);
  await writeFile(rutaAbsoluta, buffer);

  // La URL pública es relativa a public/
  const fotoUrl = `/uploads/productos/${productoId}/${nombreArchivo}`;

  // Actualizar la base
  await sql.query(
    `update productos set foto_url = $1, updated_at = now() where id = $2 and tenant_id = $3`,
    [fotoUrl, productoId, staff.tenantId],
  );

  return { foto_url: fotoUrl };
}

/**
 * Elimina la foto de un producto: borra el archivo físico y setea foto_url = null.
 */
export async function borrarFotoProductoForStaff(
  staff: Staff,
  productoId: string,
): Promise<{ ok: true }> {
  assertRole(staff, ["admin"]);

  const sql = await getSql();
  const rows = await sql<{ foto_url: string | null }>`
    select foto_url from productos where id = ${productoId} and tenant_id = ${staff.tenantId}
  `;
  if (!rows[0]) {
    throw new FotoProductoError(404, "not_found", "Producto no encontrado.");
  }

  const fotoUrl = rows[0].foto_url;
  if (fotoUrl) {
    await borrarArchivoFisico(fotoUrl);
  }

  await sql.query(
    `update productos set foto_url = null, updated_at = now() where id = $1 and tenant_id = $2`,
    [productoId, staff.tenantId],
  );

  return { ok: true as const };
}

/**
 * Borra el archivo físico correspondiente a una foto_url.
 * La foto_url tiene forma `/uploads/productos/{id}/{archivo}`.
 */
async function borrarArchivoFisico(fotoUrl: string): Promise<void> {
  // fotoUrl = /uploads/productos/{productoId}/{archivo}
  const relativePath = fotoUrl.replace(/^\/uploads\//, "");
  const fullPath = join(resolvePath(join(process.cwd(), "public")), "uploads", relativePath);
  try {
    if (existsSync(fullPath)) {
      await rm(fullPath);
    }
    // Intentar borrar el directorio del producto si quedó vacío
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    if (existsSync(dir)) {
      const entries = await import("node:fs/promises").then((fs) => fs.readdir(dir));
      if (entries.length === 0) {
        await rm(dir, { recursive: false });
      }
    }
  } catch {
    // No fallar si el archivo ya no existe o hay un error de IO
  }
}
