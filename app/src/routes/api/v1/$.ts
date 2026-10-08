import { createFileRoute } from "@tanstack/react-router";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId, UnauthorizedError } from "@/lib/auth/verify.server";
import { ensureStaffForUser } from "@/lib/server/bootstrap";
import { cerrarCajaForStaff, estadoCajaForStaff } from "@/lib/server/caja";
import {
  crearPedidoForStaff,
  syncCatalogoForStaff,
  type CrearPedidoInput,
  type PedidoLineaInput,
} from "@/lib/server/catalog-pedidos";
import { createClienteForStaff, anotarPagoCuentaForStaff, cuentaClienteForStaff, listClientesForStaff, updateClienteForStaff } from "@/lib/server/clientes";
import {
  emitirFacturaForStaff,
  emitirNotaCreditoForStaff,
  getAfipConfigForStaff,
  getFacturaForStaff,
  guardarAfipConfigForStaff,
  listarFacturacionForStaff,
  probarAfipForStaff,
  setArcaHabilitadaForStaff,
} from "@/lib/server/facturacion";
import {
  anularCobroForStaff,
  anularPedidoForStaff,
  cobrarPedidoForStaff,
  getTicketForStaff,
} from "@/lib/server/cobros";
import {
  LegalError,
  aceptarContratoForStaff,
  contratoDocumentoForStaff,
  historialContratoForStaff,
  resumenSuscripcionForStaff,
} from "@/lib/server/legal";
import { canalMercadoForStaff, getMarcaForStaff, guardarCanalMercadoForStaff, guardarMarcaForStaff } from "@/lib/server/marca";
import {
  conversacionesNegocioForStaff,
  enviarMensajePedidoForClient,
  enviarMensajePedidoForStaff,
  mensajesDelPedidoForClient,
  mensajesDelPedidoForStaff,
  misMensajesPendientesForClient,
} from "@/lib/server/mensajes";
import { dashboardResumenForStaff, listAlertasForStaff, listAuditoriaForStaff, marcarAlertaLeidaForStaff } from "@/lib/server/panel";
import {
  getPedidoForStaff,
  listPedidosForStaff,
  marcarEntregadoForStaff,
  updatePedidoEstadoForStaff,
  updatePedidoItemsForStaff,
} from "@/lib/server/pedidos";
import { ordenarProductosForStaff, quitarProductoForStaff, saveProductoForStaff, type SaveProductoInput } from "@/lib/server/productos";
import {
  asignarProveedorRemitoForStaff,
  createProveedorForStaff,
  listProveedoresForStaff,
  productosDelProveedorForStaff,
  updateProveedorForStaff,
} from "@/lib/server/proveedores";
import {
  actualizarRemitoItemForStaff,
  confirmarRemitoForStaff,
  crearRemitoForStaff,
  getRemitoForStaff,
  listRemitosForStaff,
  type CrearRemitoInput,
} from "@/lib/server/remitos";
import { historialProductoForStaff, rankingCargadoresForStaff, resumenVentasProductosForStaff } from "@/lib/server/reportes";
import { ajustarStockForStaff } from "@/lib/server/stock";
import { createUsuarioForStaff, listUsuariosForStaff, toggleUsuarioForStaff } from "@/lib/server/usuarios";
import {
  catalogoClienteForClient,
  fichaActivaPorUsuario,
  guardarMiFichaForClient,
  miFichaForClient,
  misMovimientosForClient,
  misPedidosForClient,
  pedirComoClienteForClient,
  recordarUsuarioForPublic,
  recuperarClaveForPublic,
  registrarClienteForPublic,
  verComprobanteForClient,
  type Ficha,
  type PedirComoClienteInput,
} from "@/lib/server/portal";
import type { FormaPago, PedidoEstado, Rol, Staff } from "@/lib/types";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const PEDIDO_ESTADOS = ["borrador", "enviado", "en_preparacion", "listo", "cobrado", "anulado", "entregado"] as const;
const FORMAS_PAGO = ["efectivo", "transferencia", "tarjeta", "cuenta_corriente"] as const;
const ROLES = ["admin", "cajero", "vendedor"] as const;
const FUENTES = ["csv", "foto", "manual", "pdf"] as const;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...JSON_HEADERS, vary: "authorization", ...(init.headers ?? {}) },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.code, message: error.message }, { status: error.status });
  if (error instanceof LegalError) {
    return json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof UnauthorizedError) return json({ error: "unauthorized" }, { status: 401 });
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
  const message = error instanceof Error ? error.message : "Solicitud inválida.";
  return json({ error: status === 403 ? "forbidden" : "invalid_request", message }, { status });
}

function bearerToken(request: Request): string | undefined {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function splitPath(splat: string | undefined): string[] {
  return (splat ?? "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Enviá el cuerpo como application/json.");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_request", "El cuerpo no es JSON válido.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_request", "El cuerpo debe ser un objeto JSON.");
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string, max = 500): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new HttpError(400, "invalid_request", `${field} es obligatorio.`);
  return text;
}

function asOptionalString(value: unknown, max = 500): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

function asNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) throw new HttpError(400, "invalid_request", `${field} debe ser un número.`);
  return parsed;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new HttpError(400, "invalid_request", `${field} inválido.`);
}

function parseSince(value: string | null): string | undefined {
  if (!value) return undefined;
  if (Number.isNaN(Date.parse(value))) throw new HttpError(400, "invalid_request", "since debe ser una fecha ISO válida.");
  return value;
}

function parseLinea(value: unknown): PedidoLineaInput {
  const line = asRecord(value);
  const productoId = typeof line.productoId === "string" ? line.productoId.trim() : "";
  const cantidad = typeof line.cantidad === "number" ? line.cantidad : Number.NaN;
  if (!productoId || !Number.isFinite(cantidad) || cantidad <= 0) {
    throw new HttpError(400, "invalid_request", "Ítem inválido.");
  }
  return { productoId, cantidad };
}

function parsePedido(value: unknown): CrearPedidoInput {
  const body = asRecord(value);
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    throw new HttpError(400, "invalid_request", "El pedido debe incluir entre 1 y 200 ítems.");
  }
  return {
    clientUuid: asString(body.clientUuid, "clientUuid", 120),
    clienteId: typeof body.clienteId === "string" ? body.clienteId : null,
    clienteNombre: asOptionalString(body.clienteNombre, 120) ?? "Mostrador",
    nota: asOptionalString(body.nota, 500),
    items: items.map(parseLinea),
  };
}

function parsePedidoPortal(value: unknown): PedirComoClienteInput {
  const body = asRecord(value);
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    throw new HttpError(400, "invalid_request", "El pedido debe incluir entre 1 y 200 ítems.");
  }
  return {
    items: items.map(parseLinea),
    nota: asOptionalString(body.nota, 500),
    formaPago: oneOf(body.formaPago, FORMAS_PAGO, "formaPago") as FormaPago,
    comprobanteNombre: asOptionalString(body.comprobanteNombre, 200),
    comprobanteData: typeof body.comprobanteData === "string" ? body.comprobanteData : undefined,
  };
}

function parseProducto(value: unknown): SaveProductoInput {
  const body = asRecord(value);
  return {
    id: asOptionalString(body.id, 80),
    nombre: asString(body.nombre, "nombre", 120),
    unidad: oneOf(body.unidad, ["bulto", "kg"] as const, "unidad"),
    unidadLabel: asString(body.unidadLabel, "unidadLabel", 20),
    precio: asNumber(body.precio, "precio"),
    stockMinimo: asNumber(body.stockMinimo, "stockMinimo"),
    alias: Array.isArray(body.alias)
      ? body.alias.filter((a): a is string => typeof a === "string").map((a) => a.trim()).filter(Boolean)
      : [],
    activo: body.activo === undefined ? true : body.activo === true,
    stockInicial: body.stockInicial == null ? undefined : asNumber(body.stockInicial, "stockInicial"),
  };
}

function parseRemito(value: unknown): CrearRemitoInput {
  const body = asRecord(value);
  const lineas = body.lineas;
  if (!Array.isArray(lineas) || lineas.length === 0 || lineas.length > 500) {
    throw new HttpError(400, "invalid_request", "El remito debe incluir entre 1 y 500 líneas.");
  }
  return {
    proveedor: asOptionalString(body.proveedor, 120),
    proveedorId: asOptionalString(body.proveedorId, 80),
    fuente: oneOf(body.fuente, FUENTES, "fuente"),
    archivoNombre: asOptionalString(body.archivoNombre, 200),
    lineas: lineas.map((linea) => {
      const row = asRecord(linea);
      return {
        descripcion: asString(row.descripcion, "descripcion", 200),
        cantidad: asNumber(row.cantidad, "cantidad"),
        precio: row.precio == null ? undefined : asNumber(row.precio, "precio"),
      };
    }),
  };
}

type Segment = string | ":";

type StaffCtx = {
  request: Request;
  url: URL;
  segments: string[];
  staff: Staff;
};

type ClientCtx = {
  request: Request;
  url: URL;
  segments: string[];
  client: { userId: string; ficha: Ficha };
};

type PublicCtx = {
  request: Request;
  url: URL;
  segments: string[];
};

type Entry =
  | { method: "GET" | "POST"; path: Segment[]; audience?: "staff"; handler: (ctx: StaffCtx) => Promise<Response> | Response }
  | { method: "GET" | "POST"; path: Segment[]; audience: "client"; handler: (ctx: ClientCtx) => Promise<Response> | Response }
  | { method: "GET" | "POST"; path: Segment[]; audience: "public"; handler: (ctx: PublicCtx) => Promise<Response> | Response };

function match(method: string, segments: string[]): Entry | null {
  for (const entry of ROUTES) {
    if (entry.method !== method || entry.path.length !== segments.length) continue;
    let ok = true;
    for (let i = 0; i < segments.length; i += 1) {
      const expected = entry.path[i];
      if (expected !== ":" && expected !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return entry;
  }
  return null;
}

/**
 * HTTP contract for mobile clients (Flutter). Better Auth remains mounted at
 * `/api/auth/*`; clients authenticate there and send the session token as
 * `Authorization: Bearer`. All handlers reuse the same server services as the
 * web app, so authorization, idempotency and audit live in one place.
 */
const ROUTES: Entry[] = [
  {
    method: "GET",
    path: ["session"],
    handler: async ({ staff }) =>
      json({ staff: { id: staff.id, nombre: staff.nombre, rol: staff.rol }, tenantId: staff.tenantId }),
  },
  {
    method: "GET",
    path: ["catalogo"],
    handler: async ({ request, url, staff }) => {
      const since = parseSince(url.searchParams.get("since"));
      const catalogo = await syncCatalogoForStaff(staff, since);
      const etag = catalogo.version ? `"${catalogo.version}"` : undefined;
      if (etag && request.headers.get("if-none-match") === etag) {
        return new Response(null, {
          status: 304,
          headers: { "cache-control": "private, max-age=30", etag, vary: "authorization" },
        });
      }
      return json(
        { data: catalogo.productos, version: catalogo.version },
        { headers: { "cache-control": "private, max-age=30", etag: etag ?? "" } },
      );
    },
  },
  {
    method: "POST",
    path: ["pedidos"],
    handler: async ({ request, staff }) => {
      const pedido = await crearPedidoForStaff(staff, parsePedido(await readJson(request)));
      return json({ data: pedido }, { status: 201 });
    },
  },
  {
    method: "GET",
    path: ["pedidos"],
    handler: async ({ url, staff }) => {
      const mine = ["1", "true"].includes(url.searchParams.get("mine") ?? "");
      const estadosRaw = url.searchParams.get("estados");
      let estados: PedidoEstado[] | undefined;
      if (estadosRaw) {
        const parsed = estadosRaw.split(",").map((e) => e.trim()).filter(Boolean).map((e) => oneOf(e, PEDIDO_ESTADOS, "estados"));
        estados = parsed.length ? parsed : undefined;
      }
      return json({ data: await listPedidosForStaff(staff, { mine, estados }) });
    },
  },
  {
    method: "GET",
    path: ["pedidos", ":"],
    handler: async ({ segments, staff }) => {
      const pedido = await getPedidoForStaff(staff, segments[1]);
      if (!pedido) throw new HttpError(404, "not_found", "Pedido no encontrado.");
      return json({ data: pedido });
    },
  },
  {
    method: "POST",
    path: ["pedidos", ":", "estado"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      const pedido = await updatePedidoEstadoForStaff(staff, {
        id: segments[1],
        estado: oneOf(body.estado, PEDIDO_ESTADOS, "estado"),
      });
      if (!pedido) throw new HttpError(404, "not_found", "Pedido no encontrado.");
      return json({ data: pedido });
    },
  },
  {
    method: "POST",
    path: ["pedidos", ":", "entregar"],
    handler: async ({ segments, staff }) => json({ data: await marcarEntregadoForStaff(staff, segments[1]) }),
  },
  {
    method: "POST",
    path: ["pedidos", ":", "items"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) {
        throw new HttpError(400, "invalid_request", "El pedido debe incluir entre 1 y 200 ítems.");
      }
      const pedido = await updatePedidoItemsForStaff(staff, { id: segments[1], items: body.items.map(parseLinea) });
      if (!pedido) throw new HttpError(404, "not_found", "Pedido no encontrado.");
      return json({ data: pedido });
    },
  },
  {
    method: "POST",
    path: ["pedidos", ":", "cobrar"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      const cobro = await cobrarPedidoForStaff(staff, {
        pedidoId: segments[1],
        clientUuid: asString(body.clientUuid, "clientUuid", 120),
        formaPago: oneOf(body.formaPago, FORMAS_PAGO, "formaPago") as FormaPago,
        montoRecibido: body.montoRecibido == null ? undefined : asNumber(body.montoRecibido, "montoRecibido"),
      });
      return json({ data: cobro });
    },
  },
  {
    method: "POST",
    path: ["pedidos", ":", "anular"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      const pedido = await anularPedidoForStaff(staff, { id: segments[1], motivo: asString(body.motivo, "motivo", 300) });
      return json({ data: pedido });
    },
  },
  {
    method: "GET",
    path: ["pedidos", ":", "mensajes"],
    handler: async ({ url, segments, staff }) =>
      json({ data: await mensajesDelPedidoForStaff(staff, segments[1], parseSince(url.searchParams.get("antes"))) }),
  },
  {
    method: "POST",
    path: ["pedidos", ":", "mensajes"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      const cuerpo = typeof body.cuerpo === "string" ? body.cuerpo : "";
      return json({ data: await enviarMensajePedidoForStaff(staff, segments[1], cuerpo) });
    },
  },
  {
    method: "GET",
    path: ["mensajes", "conversaciones"],
    handler: async ({ staff }) => json({ data: await conversacionesNegocioForStaff(staff) }),
  },
  {
    method: "GET",
    path: ["cobros", ":", "ticket"],
    handler: async ({ segments, staff }) => {
      const ticket = await getTicketForStaff(staff, segments[1]);
      if (!ticket) throw new HttpError(404, "not_found", "Ticket no encontrado.");
      return json({ data: ticket });
    },
  },
  {
    method: "POST",
    path: ["cobros", ":", "anular"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      return json({ data: await anularCobroForStaff(staff, { id: segments[1], motivo: asString(body.motivo, "motivo", 300) }) });
    },
  },
  {
    method: "GET",
    path: ["clientes"],
    handler: async ({ staff }) => json({ data: await listClientesForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["clientes"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const cliente = await createClienteForStaff(staff, {
        nombre: asString(body.nombre, "nombre", 120),
        telefono: asOptionalString(body.telefono, 40),
        cuentaCorriente: body.cuentaCorriente === true,
      });
      return json({ data: cliente }, { status: 201 });
    },
  },
  {
    method: "GET",
    path: ["clientes", ":", "cuenta"],
    handler: async ({ segments, staff }) => json({ data: await cuentaClienteForStaff(staff, segments[1]) }),
  },
  {
    method: "POST",
    path: ["clientes", ":"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      if (typeof body.cuentaCorriente !== "boolean") throw new HttpError(400, "invalid_request", "cuentaCorriente debe ser booleano.");
      if (typeof body.activo !== "boolean") throw new HttpError(400, "invalid_request", "activo debe ser booleano.");
      return json({
        data: await updateClienteForStaff(staff, {
          id: segments[1],
          nombre: asString(body.nombre, "nombre", 120),
          telefono: asOptionalString(body.telefono, 40),
          cuit: asOptionalString(body.cuit, 20),
          direccion: asOptionalString(body.direccion, 200),
          cuentaCorriente: body.cuentaCorriente,
          condicionIva: asString(body.condicionIva, "condicionIva", 40),
          activo: body.activo,
        }),
      });
    },
  },
  {
    method: "POST",
    path: ["clientes", ":", "pagos"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      return json({
        data: await anotarPagoCuentaForStaff(staff, {
          clienteId: segments[1],
          monto: asNumber(body.monto, "monto"),
          nota: asOptionalString(body.nota, 200),
        }),
      });
    },
  },
  {
    method: "POST",
    path: ["productos"],
    handler: async ({ request, staff }) => {
      const producto = await saveProductoForStaff(staff, parseProducto(await readJson(request)));
      return json({ data: producto }, { status: 201 });
    },
  },
  {
    method: "POST",
    path: ["productos", ":", "baja"],
    handler: async ({ segments, staff }) => json({ data: await quitarProductoForStaff(staff, segments[1]) }),
  },
  {
    method: "POST",
    path: ["productos", "orden"],
    handler: async ({ request, staff }) => {
      const raw = await readJson(request);
      if (!Array.isArray(raw)) throw new HttpError(400, "invalid_request", "Envía una lista de ids.");
      const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0);
      return json({ data: await ordenarProductosForStaff(staff, ids) });
    },
  },
  {
    method: "POST",
    path: ["stock", "ajuste"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const ajuste = await ajustarStockForStaff(staff, {
        productoId: asString(body.productoId, "productoId", 80),
        cantidad: asNumber(body.cantidad, "cantidad"),
        tipo: oneOf(body.tipo, ["ajuste", "merma"] as const, "tipo"),
        motivo: asString(body.motivo, "motivo", 200),
      });
      return json({ data: ajuste });
    },
  },
  {
    method: "GET",
    path: ["remitos"],
    handler: async ({ staff }) => json({ data: await listRemitosForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["remitos"],
    handler: async ({ request, staff }) => {
      const remito = await crearRemitoForStaff(staff, parseRemito(await readJson(request)));
      return json({ data: remito }, { status: 201 });
    },
  },
  {
    method: "GET",
    path: ["remitos", ":"],
    handler: async ({ segments, staff }) => {
      const remito = await getRemitoForStaff(staff, segments[1]);
      if (!remito) throw new HttpError(404, "not_found", "Remito no encontrado.");
      return json({ data: remito });
    },
  },
  {
    method: "POST",
    path: ["remitos", "items"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      if (typeof body.confirmado !== "boolean") throw new HttpError(400, "invalid_request", "confirmado debe ser booleano.");
      const item = await actualizarRemitoItemForStaff(staff, {
        id: asString(body.id, "id", 80),
        productoId: body.productoId == null ? null : asString(body.productoId, "productoId", 80),
        cantidad: asNumber(body.cantidad, "cantidad"),
        confirmado: body.confirmado,
      });
      return json({ data: item });
    },
  },
  {
    method: "POST",
    path: ["remitos", ":", "confirmar"],
    handler: async ({ segments, staff }) => json({ data: await confirmarRemitoForStaff(staff, segments[1]) }),
  },
  {
    method: "GET",
    path: ["proveedores"],
    handler: async ({ staff }) => json({ data: await listProveedoresForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["proveedores"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const proveedor = await createProveedorForStaff(staff, {
        nombre: asString(body.nombre, "nombre", 120),
        cuit: asOptionalString(body.cuit, 20),
        telefono: asOptionalString(body.telefono, 40),
        email: asOptionalString(body.email, 120),
        direccion: asOptionalString(body.direccion, 200),
        observaciones: asOptionalString(body.observaciones, 300),
      });
      return json({ data: proveedor }, { status: 201 });
    },
  },
  {
    method: "POST",
    path: ["proveedores", ":"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      if (typeof body.activo !== "boolean") throw new HttpError(400, "invalid_request", "activo debe ser booleano.");
      return json({
        data: await updateProveedorForStaff(staff, segments[1], {
          nombre: asString(body.nombre, "nombre", 120),
          cuit: asOptionalString(body.cuit, 20),
          telefono: asOptionalString(body.telefono, 40),
          email: asOptionalString(body.email, 120),
          direccion: asOptionalString(body.direccion, 200),
          observaciones: asOptionalString(body.observaciones, 300),
          activo: body.activo,
        }),
      });
    },
  },
  {
    method: "GET",
    path: ["proveedores", ":", "productos"],
    handler: async ({ segments, staff }) => json({ data: await productosDelProveedorForStaff(staff, segments[1]) }),
  },
  {
    method: "POST",
    path: ["remitos", ":", "proveedor"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      return json({
        data: await asignarProveedorRemitoForStaff(
          staff,
          segments[1],
          asString(body.proveedorId, "proveedorId", 80),
        ),
      });
    },
  },
  {
    method: "GET",
    path: ["usuarios"],
    handler: async ({ staff }) => json({ data: await listUsuariosForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["usuarios"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const email = asString(body.email, "email", 200);
      if (!email.includes("@")) throw new HttpError(400, "invalid_request", "El email no es válido.");
      const usuario = await createUsuarioForStaff(staff, {
        nombre: asString(body.nombre, "nombre", 120),
        email,
        password: asString(body.password, "password", 200),
        rol: oneOf(body.rol, ROLES, "rol") as Rol,
      });
      return json({ data: usuario }, { status: 201 });
    },
  },
  {
    method: "POST",
    path: ["usuarios", ":", "toggle"],
    handler: async ({ request, segments, staff }) => {
      const body = asRecord(await readJson(request));
      if (typeof body.activo !== "boolean") throw new HttpError(400, "invalid_request", "activo debe ser booleano.");
      return json({ data: await toggleUsuarioForStaff(staff, { id: segments[1], activo: body.activo }) });
    },
  },
  {
    method: "GET",
    path: ["alertas"],
    handler: async ({ staff }) => json({ data: await listAlertasForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["alertas", ":", "leida"],
    handler: async ({ segments, staff }) => json({ data: await marcarAlertaLeidaForStaff(staff, segments[1]) }),
  },
  {
    method: "GET",
    path: ["dashboard"],
    handler: async ({ url, staff }) => {
      const diasRaw = url.searchParams.get("dias");
      const dias = diasRaw == null || diasRaw === "" ? undefined : Number(diasRaw);
      return json({ data: await dashboardResumenForStaff(staff, dias) });
    },
  },
  {
    method: "GET",
    path: ["caja"],
    handler: async ({ staff }) => json({ data: await estadoCajaForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["caja", "cerrar"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const cierre = await cerrarCajaForStaff(staff, {
        id: asString(body.id, "id", 80),
        real: asNumber(body.real, "real"),
        notas: asOptionalString(body.notas, 300),
      });
      return json({ data: cierre });
    },
  },
  {
    method: "GET",
    path: ["auditoria"],
    handler: async ({ staff }) => json({ data: await listAuditoriaForStaff(staff) }),
  },
  {
    method: "GET",
    path: ["suscripcion"],
    handler: async ({ staff }) => json({ data: await resumenSuscripcionForStaff(staff) }),
  },
  {
    method: "GET",
    path: ["suscripcion", "contrato"],
    handler: async ({ url, staff }) => {
      const raw = url.searchParams.get("version");
      const version = raw == null || raw === "" ? undefined : Number(raw);
      if (version !== undefined && (!Number.isInteger(version) || version <= 0)) {
        throw new HttpError(400, "cuerpo_invalido", "version debe ser un entero positivo.");
      }
      return json({ data: await contratoDocumentoForStaff(staff, version) });
    },
  },
  {
    method: "GET",
    path: ["suscripcion", "contrato", "historial"],
    handler: async ({ staff }) => json({ data: await historialContratoForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["suscripcion", "contrato", "aceptar"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const documentoId = typeof body.documentoId === "string" ? body.documentoId.trim() : "";
      const hash = typeof body.hash === "string" ? body.hash.trim() : "";
      const version = typeof body.version === "number" ? body.version : Number.NaN;
      if (!documentoId || !hash || !Number.isInteger(version) || version <= 0) {
        throw new HttpError(400, "cuerpo_invalido", "documentoId, version y hash son obligatorios.");
      }
      const resultado = await aceptarContratoForStaff(
        staff,
        { documentoId, version, hash },
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
        request.headers.get("user-agent") ?? "",
      );
      return json({ data: resultado });
    },
  },
  {
    method: "GET",
    path: ["marca"],
    handler: async ({ staff }) => json({ data: await getMarcaForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["marca"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const fondo = typeof body.fondo === "string" ? body.fondo : null;
      const marca = await guardarMarcaForStaff(staff, {
        nombre: asString(body.nombre, "nombre", 200),
        bajada: asOptionalString(body.bajada, 80) ?? "",
        membrete: asOptionalString(body.membrete, 240) ?? "",
        pieTicket: asOptionalString(body.pieTicket, 240) ?? "",
        fondo,
      });
      return json({ data: marca });
    },
  },
  {
    method: "GET",
    path: ["canal-mercado"],
    handler: async ({ staff }) => json({ data: await canalMercadoForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["canal-mercado"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      if (typeof body.activo !== "boolean") throw new HttpError(400, "invalid_request", "activo debe ser booleano.");
      return json({ data: await guardarCanalMercadoForStaff(staff, body.activo) });
    },
  },
  {
    method: "GET",
    path: ["reportes", "productos"],
    handler: async ({ staff }) => json({ data: await resumenVentasProductosForStaff(staff) }),
  },
  {
    method: "GET",
    path: ["reportes", "productos", ":", "historial"],
    handler: async ({ segments, staff }) => json({ data: await historialProductoForStaff(staff, segments[2]) }),
  },
  {
    method: "GET",
    path: ["cargadores", "ranking"],
    handler: async ({ staff }) => json({ data: await rankingCargadoresForStaff(staff) }),
  },
  {
    method: "GET",
    path: ["afip", "config"],
    handler: async ({ staff }) => json({ data: await getAfipConfigForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["afip", "config"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      const config = await guardarAfipConfigForStaff(staff, {
        cuit: asString(body.cuit, "cuit", 20),
        razonSocial: asString(body.razonSocial, "razonSocial", 200),
        domicilio: asOptionalString(body.domicilio, 300) ?? "",
        condicion: asString(body.condicion, "condicion", 30),
        puntoVenta: asNumber(body.puntoVenta, "puntoVenta"),
        inicioActividades: asOptionalString(body.inicioActividades, 20) ?? "",
        iibb: asOptionalString(body.iibb, 40) ?? "",
        alicuota: asNumber(body.alicuota, "alicuota"),
        ambiente: asString(body.ambiente, "ambiente", 10),
        certPem: asOptionalString(body.certPem, 20000),
        keyPem: asOptionalString(body.keyPem, 20000),
      });
      return json({ data: config });
    },
  },
  {
    method: "POST",
    path: ["afip", "probar"],
    handler: async ({ staff }) => json({ data: await probarAfipForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["afip", "habilitada"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      if (typeof body.habilitada !== "boolean") throw new HttpError(400, "invalid_request", "habilitada debe ser booleano.");
      return json({ data: await setArcaHabilitadaForStaff(staff, body.habilitada) });
    },
  },
  {
    method: "GET",
    path: ["afip", "facturacion"],
    handler: async ({ staff }) => json({ data: await listarFacturacionForStaff(staff) }),
  },
  {
    method: "POST",
    path: ["afip", "facturas"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      return json({ data: await emitirFacturaForStaff(staff, asString(body.cobroId, "cobroId", 80)) });
    },
  },
  {
    method: "POST",
    path: ["afip", "notas-credito"],
    handler: async ({ request, staff }) => {
      const body = asRecord(await readJson(request));
      return json({ data: await emitirNotaCreditoForStaff(staff, asString(body.facturaId, "facturaId", 80)) });
    },
  },
  {
    method: "GET",
    path: ["afip", "facturas", ":"],
    handler: async ({ segments, staff }) => json({ data: await getFacturaForStaff(staff, segments[2]) }),
  },
  // ---- Portal de clientes: los tres endpoints públicos no exigen token; el
  // resto exige una ficha de cliente activa (audience "client") y nunca admite
  // cuentas del puesto.
  {
    method: "POST",
    path: ["portal", "registro"],
    audience: "public",
    handler: async ({ request }) => {
      const body = asRecord(await readJson(request));
      const cliente = await registrarClienteForPublic({
        nombre: asString(body.nombre, "nombre", 120),
        email: asString(body.email, "email", 200),
        password: asString(body.password, "password", 200),
        telefono: asString(body.telefono, "telefono", 40),
        cuit: asString(body.cuit, "cuit", 20),
        direccion: asString(body.direccion, "direccion", 200),
      });
      return json({ data: cliente }, { status: 201 });
    },
  },
  {
    method: "POST",
    path: ["portal", "recordar"],
    audience: "public",
    handler: async ({ request }) => {
      const body = asRecord(await readJson(request));
      return json({ data: await recordarUsuarioForPublic(asString(body.dato, "dato", 80)) });
    },
  },
  {
    method: "POST",
    path: ["portal", "recuperar"],
    audience: "public",
    handler: async ({ request }) => {
      const body = asRecord(await readJson(request));
      return json({
        data: await recuperarClaveForPublic({
          email: asString(body.email, "email", 200),
          cuit: asString(body.cuit, "cuit", 20),
          password: asString(body.password, "password", 200),
        }),
      });
    },
  },
  {
    method: "GET",
    path: ["portal", "catalogo"],
    audience: "client",
    handler: async ({ client }) => json({ data: await catalogoClienteForClient(client.ficha) }),
  },
  {
    method: "GET",
    path: ["portal", "ficha"],
    audience: "client",
    handler: async ({ client }) => json({ data: await miFichaForClient(client.ficha) }),
  },
  {
    method: "POST",
    path: ["portal", "ficha"],
    audience: "client",
    handler: async ({ request, client }) => {
      const body = asRecord(await readJson(request));
      return json({
        data: await guardarMiFichaForClient(client.userId, client.ficha, {
          nombre: asString(body.nombre, "nombre", 120),
          telefono: asString(body.telefono, "telefono", 40),
          cuit: asString(body.cuit, "cuit", 20),
          direccion: asString(body.direccion, "direccion", 200),
        }),
      });
    },
  },
  {
    method: "GET",
    path: ["portal", "movimientos"],
    audience: "client",
    handler: async ({ client }) => json({ data: await misMovimientosForClient(client.ficha) }),
  },
  {
    method: "GET",
    path: ["portal", "pedidos"],
    audience: "client",
    handler: async ({ client }) => json({ data: await misPedidosForClient(client.ficha) }),
  },
  {
    method: "POST",
    path: ["portal", "pedidos"],
    audience: "client",
    handler: async ({ request, client }) => {
      const pedido = await pedirComoClienteForClient(client.ficha, parsePedidoPortal(await readJson(request)));
      return json({ data: pedido }, { status: 201 });
    },
  },
  {
    method: "GET",
    path: ["portal", "pedidos", ":", "comprobante"],
    audience: "client",
    handler: async ({ segments, client }) => json({ data: await verComprobanteForClient(client.ficha, segments[2]) }),
  },
  {
    method: "GET",
    path: ["portal", "pedidos", ":", "mensajes"],
    audience: "client",
    handler: async ({ url, segments, client }) =>
      json({
        data: await mensajesDelPedidoForClient(client.ficha, segments[2], parseSince(url.searchParams.get("antes"))),
      }),
  },
  {
    method: "POST",
    path: ["portal", "pedidos", ":", "mensajes"],
    audience: "client",
    handler: async ({ request, segments, client }) => {
      const body = asRecord(await readJson(request));
      const cuerpo = typeof body.cuerpo === "string" ? body.cuerpo : "";
      return json({ data: await enviarMensajePedidoForClient(client.ficha, segments[2], cuerpo) });
    },
  },
  {
    method: "GET",
    path: ["portal", "mensajes-pendientes"],
    audience: "client",
    handler: async ({ client }) => json({ data: await misMensajesPendientesForClient(client.ficha) }),
  },
];

async function handle(method: "GET" | "POST", request: Request, splat: string | undefined) {
  try {
    assertSameSiteRequest();
    const segments = splitPath(splat);
    const entry = match(method, segments);
    if (!entry) return json({ error: "not_found" }, { status: 404 });
    const base = { request, url: new URL(request.url), segments };
    if (entry.audience === "public") {
      return await entry.handler(base);
    }
    const userId = await requireUserId(bearerToken(request));
    if (entry.audience === "client") {
      const ficha = await fichaActivaPorUsuario(userId);
      return await entry.handler({ ...base, client: { userId, ficha } });
    }
    const staff = await ensureStaffForUser(userId);
    return await entry.handler({ ...base, staff });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle("GET", request, params._splat),
      POST: ({ request, params }) => handle("POST", request, params._splat),
    },
  },
});
