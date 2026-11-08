import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import {
  consolidarClientes,
  type ClienteUnificado,
  type CompraInput,
  type ClienteMostrador,
  type ClienteMercado,
} from "./cliente-360-core";

type Filtros360 = { busqueda?: string; app?: string; minLTV?: number };

export async function cliente360Core(email: string, filtros: Filtros360): Promise<ClienteUnificado[]> {
  await exigirAccion(email, "comercial");

  const sql = await getSql();

  // 1. Clientes de Mostrador (tabla `clientes`, con email agregado en 0005)
  const rowsMostrador = await sql<{
    id: string;
    nombre: string;
    email: string | null;
    telefono: string | null;
    tenant_id: string;
  }>`SELECT id, nombre, email, telefono, tenant_id FROM clientes WHERE activo = true`;

  const clientesMostrador: ClienteMostrador[] = rowsMostrador.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
    tenantId: r.tenant_id,
  }));

  // 2. Compradores de Mercado (tabla `mercado_compradores`, email viene de `user`)
  const rowsMercado = await sql<{
    id: string;
    nombre: string;
    email: string | null;
    telefono: string | null;
    user_id: string | null;
  }>`
    SELECT mc.id, mc.nombre, u.email, mc.telefono, mc.user_id
    FROM mercado_compradores mc
    LEFT JOIN "user" u ON u.id = mc.user_id
  `;

  const clientesMercado: ClienteMercado[] = rowsMercado.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
    userId: r.user_id,
  }));

  // 3. Compras de Mostrador: cobros no anulados unidos a pedidos de mostrador
  //    El total viene de pedido_items (no hay columna total en pedidos).
  //    cliente_id en pedidos referencia a clientes.id
  const rowsComprasMostrador = await sql<{
    cliente_id: string;
    monto: unknown;
    created_at: string;
  }>`
    SELECT p.cliente_id,
           coalesce(sum(i.cantidad * i.precio_unitario), 0) as monto,
           min(p.created_at)::text as created_at
    FROM pedidos p
    JOIN cobros c ON c.pedido_id = p.id
    JOIN pedido_items i ON i.pedido_id = p.id
    WHERE p.cliente_id IS NOT NULL
      AND coalesce(p.origen, '') <> 'mercado_al_toque'
      AND c.anulado = false
    GROUP BY p.cliente_id, c.id
  `;

  const comprasMostrador: CompraInput[] = rowsComprasMostrador.map((r) => ({
    clienteId: r.cliente_id,
    monto: num(r.monto),
    createdAt: r.created_at,
  }));

  // 4. Compras de Mercado: pedidos de mercado_al_toque con comprador_mercado_id
  //    en estado cobrado o entregado
  const rowsComprasMercado = await sql<{
    comprador_id: string;
    monto: unknown;
    created_at: string;
  }>`
    SELECT p.comprador_mercado_id as comprador_id,
           coalesce(sum(i.cantidad * i.precio_unitario), 0) as monto,
           min(p.created_at)::text as created_at
    FROM pedidos p
    JOIN cobros c ON c.pedido_id = p.id
    JOIN pedido_items i ON i.pedido_id = p.id
    WHERE p.comprador_mercado_id IS NOT NULL
      AND p.origen = 'mercado_al_toque'
      AND p.estado IN ('cobrado', 'entregado')
      AND c.anulado = false
    GROUP BY p.comprador_mercado_id, c.id
  `;

  const comprasMercado: CompraInput[] = rowsComprasMercado.map((r) => ({
    clienteId: r.comprador_id,
    monto: num(r.monto),
    createdAt: r.created_at,
  }));

  // 5. Super al Toque: usa los mismos compradores de mercado_compradores.
  //    Los pedidos de Super se distinguen por la app de origen, pero en esta base
  //    todos pasan por `pedidos` con origen = 'mercado_al_toque'.
  //    Super al Toque tiene su propia base externa; los KPIs se leen por HTTP.
  //    No hay tabla de compras separada en esta DB para Super.
  const comprasSuper: CompraInput[] = [];

  // 6. Materiales Ya: app externa, no tiene tabla de clientes ni compras en esta DB.
  //    Se lee por HTTP (ver materiales-ya-fn.ts). No hay datos para consolidar aqui.
  const comprasMateriales: CompraInput[] = [];

  // 7. Consolidar
  let resultados = consolidarClientes(
    clientesMostrador,
    clientesMercado,
    comprasMostrador,
    comprasMercado,
    comprasSuper,
    comprasMateriales,
  );

  // 8. Aplicar filtros
  if (filtros.busqueda) {
    const q = filtros.busqueda.toLowerCase();
    resultados = resultados.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.telefono?.toLowerCase().includes(q),
    );
  }
  if (filtros.app) {
    resultados = resultados.filter((c) => c.apps.some((a) => a.nombre === filtros.app));
  }
  if (filtros.minLTV) {
    resultados = resultados.filter((c) => c.lifetimeValue >= filtros.minLTV!);
  }

  return resultados.sort((a, b) => b.lifetimeValue - a.lifetimeValue);
}

export const listarClientes360 = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: Filtros360 | undefined) => input ?? {})
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return cliente360Core(email, data);
  });

export type HistorialCompra = {
  id: string;
  fecha: string;
  monto: number;
};

export type DetalleCliente360 = {
  cliente: ClienteUnificado;
  historialMostrador: HistorialCompra[];
  historialMercado: HistorialCompra[];
  historialSuper: HistorialCompra[];
  historialMateriales: HistorialCompra[];
};

export async function detalleCliente360Core(
  email: string,
  clienteId: string,
): Promise<DetalleCliente360> {
  await exigirAccion(email, "comercial");
  if (!clienteId.trim()) throw new Error("Falta el ID del cliente.");

  const sql = await getSql();

  // Primero obtener la lista completa consolidada para encontrar este cliente
  const todos = await cliente360Core(email, {});
  const cliente = todos.find((c) => c.id === clienteId);
  if (!cliente) throw new Error("No se encontro ese cliente.");

  // Extraer los IDs de cliente por app desde el perfil unificado
  const appMap = new Map(cliente.apps.map((a) => [a.nombre, a.clienteId]));

  // Historial Mostrador
  const mostradorId = appMap.get("Mostrador");
  let historialMostrador: HistorialCompra[] = [];
  if (mostradorId) {
    const rows = await sql<{ id: string; created_at: string; monto: unknown }>`
      SELECT c.id, c.created_at::text as created_at, c.monto
      FROM cobros c
      JOIN pedidos p ON p.id = c.pedido_id
      WHERE p.cliente_id = ${mostradorId}
        AND coalesce(p.origen, '') <> 'mercado_al_toque'
        AND c.anulado = false
      ORDER BY c.created_at DESC
      LIMIT 100
    `;
    historialMostrador = rows.map((r) => ({ id: r.id, fecha: r.created_at, monto: num(r.monto) }));
  }

  // Historial Mercado
  const mercadoId = appMap.get("Mercado") ?? appMap.get("Super");
  let historialMercado: HistorialCompra[] = [];
  if (mercadoId) {
    const rows = await sql<{ id: string; created_at: string; monto: unknown }>`
      SELECT c.id, c.created_at::text as created_at, c.monto
      FROM cobros c
      JOIN pedidos p ON p.id = c.pedido_id
      WHERE p.comprador_mercado_id = ${mercadoId}
        AND p.origen = 'mercado_al_toque'
        AND p.estado IN ('cobrado', 'entregado')
        AND c.anulado = false
      ORDER BY c.created_at DESC
      LIMIT 100
    `;
    historialMercado = rows.map((r) => ({ id: r.id, fecha: r.created_at, monto: num(r.monto) }));
  }

  // Super al Toque y Materiales Ya: apps externas, sin historial en esta DB
  const historialSuper: HistorialCompra[] = [];
  const historialMateriales: HistorialCompra[] = [];

  return { cliente, historialMostrador, historialMercado, historialSuper, historialMateriales };
}

export const detalleCliente360 = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return detalleCliente360Core(email, data);
  });
