import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ensureBootstrapped, ensureStaffForUser, seedDemoAccounts } from "@/lib/server/bootstrap";
import { cerrarCajaForStaff, estadoCajaForStaff } from "@/lib/server/caja";
import { crearPedidoForStaff, listProductosForStaff, type PedidoLineaInput } from "@/lib/server/catalog-pedidos";
import { createClienteForStaff, listClientesForStaff } from "@/lib/server/clientes";
import { anularCobroForStaff, anularPedidoForStaff, cobrarPedidoForStaff, getTicketForStaff } from "@/lib/server/cobros";
import { getTenant, loadStaffByUserId } from "@/lib/server/context";
import {
  dashboardResumenForStaff,
  listAlertasForStaff,
  listAuditoriaForStaff,
  marcarAlertaLeidaForStaff,
} from "@/lib/server/panel";
import {
  getPedidoForStaff,
  listPedidosForStaff,
  marcarEntregadoForStaff,
  updatePedidoEstadoForStaff,
  updatePedidoItemsForStaff,
} from "@/lib/server/pedidos";
import { ordenarProductosForStaff, quitarProductoForStaff, saveProductoForStaff } from "@/lib/server/productos";
import {
  actualizarRemitoItemForStaff,
  confirmarRemitoForStaff,
  crearRemitoForStaff,
  getRemitoForStaff,
  listRemitosForStaff,
} from "@/lib/server/remitos";
import { ajustarStockForStaff } from "@/lib/server/stock";
import { createUsuarioForStaff, listUsuariosForStaff, toggleUsuarioForStaff } from "@/lib/server/usuarios";
import type { FormaPago, PedidoEstado, Producto, Rol } from "@/lib/types";

export const prepareDemo = createServerFn({ method: "POST" }).handler(async () => {
  return seedDemoAccounts();
});

export const getSessionStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    const tenant = await getTenant();
    return { staff, tenant };
  });

export const quienSoy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureBootstrapped();
    const tenant = await getTenant();
    const staff = await loadStaffByUserId(context.userId);
    if (staff) return { tipo: "staff" as const, staff, tenant };
    const sql = await getSql();
    const cliente = await sql<{ id: string }>`
      select id from clientes where user_id = ${context.userId} and activo = true limit 1
    `;
    if (cliente[0]) return { tipo: "cliente" as const, tenant };
    const creado = await ensureStaffForUser(context.userId);
    return { tipo: "staff" as const, staff: creado, tenant };
  });

export const listProductos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listProductosForStaff(staff);
  });

export const saveProducto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id?: string;
    nombre: string;
    unidad: Producto["unidad"];
    unidadLabel: string;
    precio: number;
    stockMinimo: number;
    alias: string[];
    activo: boolean;
    stockInicial?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return saveProductoForStaff(staff, data);
  });

export const quitarProducto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    return quitarProductoForStaff(staff, id);
  });

export const ordenarProductos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ids: string[]) => ids.filter((id) => typeof id === "string" && id.length > 0))
  .handler(async ({ context, data: ids }) => {
    const staff = await ensureStaffForUser(context.userId);
    return ordenarProductosForStaff(staff, ids);
  });

export const listClientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listClientesForStaff(staff);
  });

export const createCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; telefono?: string; cuentaCorriente?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return createClienteForStaff(staff, data);
  });

export const crearPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientUuid: string;
    clienteId?: string | null;
    clienteNombre: string;
    nota?: string;
    items: PedidoLineaInput[];
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return crearPedidoForStaff(staff, data);
  });

export const listPedidos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { mine?: boolean; estados?: PedidoEstado[] }) => input ?? {})
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listPedidosForStaff(staff, data);
  });

export const getPedido = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    return getPedidoForStaff(staff, id);
  });

export const updatePedidoEstado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; estado: PedidoEstado }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return updatePedidoEstadoForStaff(staff, data);
  });

export const marcarEntregado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    return marcarEntregadoForStaff(staff, id);
  });

export const updatePedidoItems = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; items: PedidoLineaInput[] }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return updatePedidoItemsForStaff(staff, data);
  });

export const cobrarPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    pedidoId: string;
    clientUuid: string;
    formaPago: FormaPago;
    montoRecibido?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return cobrarPedidoForStaff(staff, data);
  });

export const anularPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return anularPedidoForStaff(staff, data);
  });

export const anularCobro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return anularCobroForStaff(staff, data);
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((cobroId: string) => cobroId)
  .handler(async ({ context, data: cobroId }) => {
    const staff = await ensureStaffForUser(context.userId);
    return getTicketForStaff(staff, cobroId);
  });

export const dashboardResumen = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { dias?: number } | undefined) => {
    const raw = input?.dias;
    const dias = raw === 1 || raw === 30 ? raw : 7;
    return { dias };
  })
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return dashboardResumenForStaff(staff, data.dias);
  });

export const listAlertas = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listAlertasForStaff(staff);
  });

export const marcarAlertaLeida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    return marcarAlertaLeidaForStaff(staff, id);
  });

export const listUsuarios = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listUsuariosForStaff(staff);
  });

export const createUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; email: string; password: string; rol: Rol }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return createUsuarioForStaff(staff, data);
  });

export const toggleUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; activo: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return toggleUsuarioForStaff(staff, data);
  });

export const listAuditoria = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listAuditoriaForStaff(staff);
  });

export const estadoCaja = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return estadoCajaForStaff(staff);
  });

export const cerrarCaja = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; real: number; notas?: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return cerrarCajaForStaff(staff, data);
  });

export const ajustarStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { productoId: string; cantidad: number; tipo: "ajuste" | "merma"; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return ajustarStockForStaff(staff, data);
  });

export const crearRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    proveedor?: string;
    proveedorId?: string;
    fuente: "csv" | "foto" | "manual" | "pdf";
    archivoNombre?: string;
    lineas: { descripcion: string; cantidad: number; precio?: number }[];
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return crearRemitoForStaff(staff, data);
  });

export const getRemito = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    return getRemitoForStaff(staff, id);
  });

export const listRemitos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return listRemitosForStaff(staff);
  });

export const actualizarRemitoItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; productoId: string | null; cantidad: number; confirmado: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    return actualizarRemitoItemForStaff(staff, data);
  });

export const confirmarRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    return confirmarRemitoForStaff(staff, id);
  });

export const parseRemitoVision = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { imageBase64: string; mimeType: string }) => input)
  .handler(async ({ context, data }) => {
    await ensureStaffForUser(context.userId);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "El lector de fotos no está disponible en este entorno." };
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
                  url: `data:${data.mimeType};base64,${data.imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `No se pudo leer la foto (${res.status}).` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = body.choices[0]?.message.content ?? "";
    const jsonText = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(jsonText) as {
        proveedor?: string | null;
        lineas: { descripcion: string; cantidad: number; precio?: number | null }[];
      };
      return { ok: true as const, proveedor: parsed.proveedor ?? null, lineas: parsed.lineas ?? [] };
    } catch {
      return { ok: false as const, error: "No pude interpretar el remito. Cargalo a mano." };
    }
  });
