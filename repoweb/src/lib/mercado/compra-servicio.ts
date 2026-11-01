import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { elegirOpcion, leerLista, PRECIO_COMPRA_ARS, type OpcionCompra } from "@/lib/mercado/compra-reglas";
import { MercadoError } from "@/lib/mercado/servicio";
import { localidadesPublicadas } from "@/lib/torre/presencia";

function aliasDe(valor: unknown) {
  if (Array.isArray(valor)) return valor.map(String);
  if (typeof valor === "string") {
    try {
      const parsed = JSON.parse(valor) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function compradorId(userId: string) {
  const db = await getSql();
  const rows = await db<{ id: string }>`select id from mercado_compradores where user_id = ${userId} limit 1`;
  return rows[0]?.id ?? null;
}

export async function estadoCompra(userId: string) {
  const id = await compradorId(userId);
  if (!id) return { estado: "sin_alta" as const, precioArs: PRECIO_COMPRA_ARS };
  const db = await getSql();
  const rows = await db<{ estado: string; hasta: string | null }>`
    select estado, hasta::text as hasta
    from mercado_compra_alta
    where comprador_id = ${id}
    order by created_at desc
    limit 1
  `;
  const alta = rows[0];
  if (!alta) return { estado: "sin_alta" as const, precioArs: PRECIO_COMPRA_ARS };
  if (alta.estado === "activa" && alta.hasta && alta.hasta >= new Date().toISOString().slice(0, 10)) {
    return { estado: "activa" as const, hasta: alta.hasta, precioArs: PRECIO_COMPRA_ARS };
  }
  if (alta.estado === "pendiente") return { estado: "pendiente" as const, precioArs: PRECIO_COMPRA_ARS };
  return { estado: "vencida" as const, precioArs: PRECIO_COMPRA_ARS };
}

export async function pedirCompra(userId: string, comprobanteNombre: string, comprobanteData: string) {
  if (!comprobanteData.startsWith("data:") || comprobanteData.length > 900_000) {
    throw new MercadoError("Subí el comprobante de la transferencia.");
  }
  const id = await compradorId(userId);
  if (!id) throw new MercadoError("No hay perfil de comprador.", 403);
  const actual = await estadoCompra(userId);
  if (actual.estado === "activa") throw new MercadoError("La compra inteligente ya está habilitada.");
  if (actual.estado === "pendiente") throw new MercadoError("El comprobante ya está en Torre.");
  const db = await getSql();
  await db`
    insert into mercado_compra_alta (id, comprador_id, estado, precio_ars, comprobante_nombre, comprobante_data)
    values (${newId("cca")}, ${id}, ${"pendiente"}, ${PRECIO_COMPRA_ARS}, ${comprobanteNombre.slice(0, 120)}, ${comprobanteData})
  `;
  return { estado: "pendiente" as const };
}

export async function armarCompra(userId: string, texto: string) {
  const actual = await estadoCompra(userId);
  if (actual.estado !== "activa") throw new MercadoError("Torre todavía no habilitó la compra inteligente.");
  const pedidos = leerLista(texto);
  if (pedidos.length === 0) throw new MercadoError("Escribí al menos un producto.");
  const db = await getSql();
  const rows = await db<{
    id: string;
    tenant_id: string;
    puesto: string;
    nombre: string;
    alias: unknown;
    precio: unknown;
    stock: unknown;
    unidad: string;
    unidad_label: string;
  }>`
    select p.id, p.tenant_id, t.nombre as puesto, p.nombre, p.alias, p.precio, p.stock, p.unidad, p.unidad_label
    from productos p
    join tenants t on t.id = p.tenant_id
    where p.activo = true and p.publicado_online = true and p.stock > 0
      and coalesce(t.config, '{}'::jsonb)->>'mercadoAlToque' = 'true'
  `;
  const publicadas = await localidadesPublicadas();
  const opciones: OpcionCompra[] = rows.flatMap((row) => {
    if (!publicadas.has(row.tenant_id)) return [];
    return [{
      id: row.id,
      tenantId: row.tenant_id,
      puesto: row.puesto,
      nombre: row.nombre,
      alias: aliasDe(row.alias),
      precio: num(row.precio),
      stock: num(row.stock),
      unidad: row.unidad,
      unidadLabel: row.unidad_label,
    }];
  });
  return {
    lineas: pedidos.map((pedido) => {
      const elegida = elegirOpcion(opciones, pedido.texto, pedido.cantidad);
      if (!elegida) return { texto: pedido.texto, cantidad: pedido.cantidad, encontrada: false as const };
      return {
        texto: pedido.texto,
        cantidad: pedido.cantidad,
        encontrada: true as const,
        tenantId: elegida.tenantId,
        tenantNombre: elegida.puesto,
        productoId: elegida.id,
        nombre: elegida.nombre,
        precio: elegida.precio,
        unidad: elegida.unidad,
        unidadLabel: elegida.unidadLabel,
      };
    }),
  };
}

