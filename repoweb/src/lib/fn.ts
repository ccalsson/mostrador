import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { appApi, appApiPublicTenant, AppApiError } from "@/lib/app-api.server";
import { getSql } from "@/lib/db";
import { getTenant, loadStaffByUserId } from "@/lib/server/context";
import { ensureBootstrapped, ensureStaffForUser, seedDemoAccounts } from "@/lib/server/bootstrap";
import type { TicketContenido } from "@/lib/termica";
import type {
  Alerta,
  Cliente,
  FormaPago,
  Pedido,
  PedidoEstado,
  Producto,
  Rol,
  Marca,
} from "@/lib/types";
import type { ComisionResuelta } from "@/lib/torre/condiciones";

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

export const getMarca = createServerFn({ method: "GET" }).handler(async () => appApiPublicTenant(["tenant"]));

export const guardarMarca = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; bajada: string; membrete: string; pieTicket: string; fondo: string | null }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Marca>({ token: context.token, method: "POST", path: ["marca"], body: data });
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
    try {
      const mercado = await sql<{ id: string }>`
        select id from mercado_compradores where user_id = ${context.userId}
        union all
        select id from mercado_cargadores where user_id = ${context.userId}
        limit 1
      `;
      if (mercado[0]) return { tipo: "mercado" as const, tenant };
    } catch {
      /* el canal todavía no está migrado */
    }
    const usuario = await sql<{ email: string }>`
      select email from "user" where id = ${context.userId} limit 1
    `;
    const email = (usuario[0]?.email ?? "").trim().toLowerCase();
    if (email) {
      try {
        const acceso = await sql<{ email: string }>`
          select email from torre.saas_access where lower(email) = ${email} limit 1
        `;
        if (acceso[0]) return { tipo: "torre" as const, tenant };
      } catch {
        /* el schema de la Torre todavía no existe */
      }
    }
    const creado = await ensureStaffForUser(context.userId);
    return { tipo: "staff" as const, staff: creado, tenant };
  });

export const listProductos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<Producto[]>({ token: context.token, method: "GET", path: ["catalogo"] });
  });

export const canalMercado = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<{
      activo: boolean;
      presencia: boolean;
      tier: string | null;
      cuentaCorriente: boolean;
      packs: {
        product: string;
        quantity: number;
        consumed: number;
        remaining: number;
        status: string;
      }[];
      avisos: {
        id: string;
        placement: string;
        status: string;
        startsOn: string;
        endsOn: string;
        contentRef: string;
        notes: string;
        currency: string;
        price: number;
        tenantId: string;
        tenantNombre: string;
      }[];
      comision: ComisionResuelta;
    }>({ token: context.token, method: "GET", path: ["canal-mercado"] });
  });

export const guardarCanalMercado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((activo: boolean) => activo)
  .handler(async ({ context, data }) => {
    return appApi<{ activo: boolean }>({
      token: context.token,
      method: "POST",
      path: ["canal-mercado"],
      body: { activo: data },
    });
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
    publicadoOnline?: boolean;
    stockInicial?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ id: string }>({ token: context.token, method: "POST", path: ["productos"], body: data });
  });

export const quitarProducto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["productos", id, "baja"] });
  });

export const ordenarProductos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ids: string[]) => ids.filter((id) => typeof id === "string" && id.length > 0))
  .handler(async ({ context, data: ids }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["productos", "orden"], body: ids });
  });

export const listClientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<Cliente[]>({ token: context.token, method: "GET", path: ["clientes"] });
  });

export const createCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; telefono?: string; cuentaCorriente?: boolean }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ id: string; nombre: string }>({
      token: context.token,
      method: "POST",
      path: ["clientes"],
      body: data,
    });
  });

type CartLine = { productoId: string; cantidad: number };

export const crearPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientUuid: string;
    clienteId?: string | null;
    clienteNombre: string;
    nota?: string;
    items: CartLine[];
  }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido>({
      token: context.token,
      method: "POST",
      path: ["pedidos"],
      body: data,
    });
  });

export const listPedidos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { mine?: boolean; estados?: PedidoEstado[] }) => input ?? {})
  .handler(async ({ context, data }) => {
    return appApi<Pedido[]>({
      token: context.token,
      method: "GET",
      path: ["pedidos"],
      query: {
        ...(data.mine ? { mine: "1" } : {}),
        ...(data.estados?.length ? { estados: data.estados.join(",") } : {}),
      },
    });
  });

export const getPedido = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    try {
      return await appApi<Pedido | null>({
        token: context.token,
        method: "GET",
        path: ["pedidos", id],
      });
    } catch (error) {
      if (error instanceof AppApiError && error.status === 404) return null;
      throw error;
    }
  });

export const updatePedidoEstado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; estado: PedidoEstado }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido | null>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.id, "estado"],
      body: { estado: data.estado },
    });
  });

export const marcarEntregado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["pedidos", id, "entregar"],
    });
  });

export const updatePedidoItems = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; items: CartLine[] }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido | null>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.id, "items"],
      body: { items: data.items },
    });
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
    return appApi<{ cobroId: string; ticketId?: string; numero: number; vuelto: number; total: number }>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.pedidoId, "cobrar"],
      body: {
        clientUuid: data.clientUuid,
        formaPago: data.formaPago,
        montoRecibido: data.montoRecibido,
      },
    });
  });

export const anularPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido | null>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.id, "anular"],
      body: { motivo: data.motivo },
    });
  });

export const anularCobro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["cobros", data.id, "anular"],
      body: { motivo: data.motivo },
    });
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((cobroId: string) => cobroId)
  .handler(async ({ context, data: cobroId }) => {
    try {
      return await appApi<{
        id: string;
        numero: number;
        contenido: TicketContenido;
        createdAt: string;
      } | null>({ token: context.token, method: "GET", path: ["cobros", cobroId, "ticket"] });
    } catch (error) {
      if (error instanceof AppApiError && error.status === 404) return null;
      throw error;
    }
  });

export const dashboardResumen = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { dias?: number } | undefined) => {
    const raw = input?.dias;
    const dias = raw === 1 || raw === 30 ? raw : 7;
    return { dias };
  })
  .handler(async ({ context, data }) => {
    return appApi<{
      dias: number;
      ventas: number;
      ventasPrev: number;
      tickets: number;
      ticketsPrev: number;
      ticketPromedio: number;
      enCola: number;
      series: { dia: string; total: number; n: number }[];
      top: { nombre: string; cantidad: number; total: number }[];
      formas: { formaPago: FormaPago; total: number; n: number }[];
      movimientos: {
        id: string;
        monto: number;
        formaPago: FormaPago;
        createdAt: string;
        cliente: string;
        numero: number | null;
        productos: string;
      }[];
      cola: {
        id: string;
        cliente: string;
        estado: string;
        createdAt: string;
        total: number;
        vendedor: string | null;
      }[];
    }>({ token: context.token, method: "GET", path: ["dashboard"], query: { dias: String(data.dias) } });
  });
export const resumenVentasProductos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<{
      semana: { productoId: string; nombre: string; cantidad: number; total: number }[];
      mes: { productoId: string; nombre: string; cantidad: number; total: number }[];
    }>({ token: context.token, method: "GET", path: ["reportes", "productos"] });
  });

export const historialProducto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => {
    if (typeof id !== "string" || !id) throw new Error("Falta el producto.");
    return id;
  })
  .handler(async ({ context, data: id }) => {
    return appApi<{ dias: { dia: string; cantidad: number; total: number }[] }>({
      token: context.token,
      method: "GET",
      path: ["reportes", "productos", id, "historial"],
    });
  });

export const rankingCargadores = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<{
      ranking: {
        puesto: number;
        nombre: string;
        nivel: string;
        puntos: number;
        score: number;
        recorridosCompletados: number;
      }[];
    }>({ token: context.token, method: "GET", path: ["cargadores", "ranking"] });
  });

export const listAlertas = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<Alerta[]>({ token: context.token, method: "GET", path: ["alertas"] });
  });

export const marcarAlertaLeida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["alertas", id, "leida"] });
  });

export const listUsuarios = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<{
      id: string;
      nombre: string;
      email: string;
      rol: Rol;
      activo: boolean;
      ultimo_login: string | null;
    }[]>({ token: context.token, method: "GET", path: ["usuarios"] });
  });

export const createUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; email: string; password: string; rol: Rol }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["usuarios"], body: data });
  });

export const toggleUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; activo: boolean }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["usuarios", data.id, "toggle"],
      body: { activo: data.activo },
    });
  });

export const listAuditoria = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await appApi<{
      id: string;
      usuarioNombre: string | null;
      accion: string;
      entidad: string;
      detalle: unknown;
      createdAt: string;
    }[]>({ token: context.token, method: "GET", path: ["auditoria"] });
    return rows.map((row) => ({
      ...row,
      detalle: typeof row.detalle === "string" ? row.detalle : JSON.stringify(row.detalle ?? {}) ?? "{}",
    }));
  });

type CajaEstado = {
  id: string;
  abiertoAt: string;
  esperado: number;
  totales: { formaPago: FormaPago; total: number; n: number }[];
  ultimos: {
    id: string;
    monto: number;
    formaPago: FormaPago;
    createdAt: string;
    cliente: string;
    numero: number | null;
    facturaId: string | null;
    cae: string | null;
  }[];
};

export const estadoCaja = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<CajaEstado>({ token: context.token, method: "GET", path: ["caja"] });
  });

export const cerrarCaja = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; real: number; notas?: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ diferencia: number; esperado: number }>({
      token: context.token,
      method: "POST",
      path: ["caja", "cerrar"],
      body: data,
    });
  });


export const ajustarStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { productoId: string; cantidad: number; tipo: "ajuste" | "merma"; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["stock", "ajuste"], body: data });
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
    return appApi<{ id: string }>({ token: context.token, method: "POST", path: ["remitos"], body: data });
  });

export const getRemito = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    try {
      return await appApi<{
        id: string;
        proveedor: string | null;
        proveedor_id: string | null;
        fuente: string;
        estado: string;
        archivo_nombre: string | null;
        createdAt: string;
        items: {
          id: string;
          descripcionOriginal: string;
          productoId: string | null;
          cantidad: number;
          precio: number | null;
          confianza: number;
          confirmado: boolean;
        }[];
      }>({ token: context.token, method: "GET", path: ["remitos", id] });
    } catch (error) {
      if (error instanceof AppApiError && error.status === 404) return null;
      throw error;
    }
  });

export const listRemitos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const remitos = await appApi<{
      id: string;
      proveedor: string | null;
      fuente: string;
      estado: string;
      createdAt: string;
    }[]>({ token: context.token, method: "GET", path: ["remitos"] });
    return remitos.map(({ createdAt, ...remito }) => ({ ...remito, created_at: createdAt }));
  });

export const actualizarRemitoItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; productoId: string | null; cantidad: number; confirmado: boolean }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["remitos", "items"], body: data });
  });

export const confirmarRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    return appApi<{ ok: true; lineas: number }>({
      token: context.token,
      method: "POST",
      path: ["remitos", id, "confirmar"],
    });
  });

export const parseRemitoVision = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { imageBase64: string; mimeType: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{
      proveedor: string | null;
      lineas: { descripcion: string; cantidad: number; precio: number | null }[];
    }>({ token: context.token, method: "POST", path: ["remitos", "ocr"], body: data });
  });