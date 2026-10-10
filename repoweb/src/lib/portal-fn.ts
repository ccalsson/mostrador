import { createServerFn } from "@tanstack/react-start";
import { appApi, appApiPublic } from "@/lib/app-api.server";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Cliente, FormaPago, Pedido, Producto } from "@/lib/types";

type Ficha = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  cuit: string | null;
  direccion: string | null;
  cuentaCorriente: boolean;
  condicionIva: string;
  activo: boolean;
  userId: string | null;
  saldo: number;
  tenantId: string;
  puedeCuentaCorriente: boolean;
};

export const registrarCliente = createServerFn({ method: "POST" })
  .validator((input: {
    nombre: string;
    email: string;
    password: string;
    telefono: string;
    cuit: string;
    direccion: string;
  }) => input)
  .handler(async ({ data }) =>
    appApiPublic<{ id: string }>({
      method: "POST",
      path: ["portal", "registro"],
      body: data,
    }),
  );

export const recordarUsuario = createServerFn({ method: "POST" })
  .validator((input: { dato: string }) => input)
  .handler(async ({ data }) =>
    appApiPublic<{ email: string }>({
      method: "POST",
      path: ["portal", "recordar"],
      body: data,
    }),
  );

export const confirmarRecuperacion = createServerFn({ method: "POST" })
  .validator((input: { email: string; cuit: string; password: string }) => input)
  .handler(async ({ data }) =>
    appApiPublic<{ ok: true }>({
      method: "POST",
      path: ["portal", "recuperar"],
      body: data,
    }),
  );

export const catalogoCliente = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<Producto[]>({
      token: context.token,
      method: "GET",
      path: ["portal", "catalogo"],
    }),
  );

export const miFicha = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<Ficha>({
      token: context.token,
      method: "GET",
      path: ["portal", "ficha"],
    }),
  );

export const guardarMiFicha = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; telefono: string; cuit: string; direccion: string }) => input)
  .handler(async ({ context, data }) =>
    appApi<Ficha>({
      token: context.token,
      method: "POST",
      path: ["portal", "ficha"],
      body: data,
    }),
  );

export const misMovimientos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<{ id: string; tipo: string; monto: number; nota: string | null; createdAt: string }[]>({
      token: context.token,
      method: "GET",
      path: ["portal", "movimientos"],
    }),
  );

export const misPedidos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<Pedido[]>({
      token: context.token,
      method: "GET",
      path: ["portal", "pedidos"],
    }),
  );

export const pedirComoCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    items: { productoId: string; cantidad: number }[];
    nota?: string;
    formaPago: FormaPago;
    comprobanteNombre?: string;
    comprobanteData?: string;
  }) => input)
  .handler(async ({ context, data }) =>
    appApi<Pedido>({
      token: context.token,
      method: "POST",
      path: ["portal", "pedidos"],
      body: data,
    }),
  );

export const verComprobante = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((pedidoId: string) => pedidoId)
  .handler(async ({ context, data: pedidoId }) =>
    appApi<{ nombre: string | null; data: string }>({
      token: context.token,
      method: "GET",
      path: ["pedidos", pedidoId, "comprobante"],
    }),
  );

export const listarClientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<Omit<Ficha, "puedeCuentaCorriente" | "tenantId">[]>({
      token: context.token,
      method: "GET",
      path: ["clientes"],
    }),
  );

export const guardarCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id: string;
    nombre: string;
    telefono: string;
    cuit: string;
    direccion: string;
    cuentaCorriente: boolean;
    condicionIva: string;
    activo: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    const { id, ...body } = data;
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["clientes", id],
      body,
    });
  });

export const anotarPagoCuenta = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clienteId: string; monto: number; nota?: string }) => input)
  .handler(async ({ context, data }) => {
    const { clienteId, ...body } = data;
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["clientes", clienteId, "pagos"],
      body,
    });
  });

export const movimientosCliente = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((clienteId: string) => clienteId)
  .handler(async ({ context, data: clienteId }) =>
    appApi<{
      saldo: number;
      movimientos: { id: string; tipo: string; monto: number; nota: string | null; createdAt: string }[];
    }>({
      token: context.token,
      method: "GET",
      path: ["clientes", clienteId, "cuenta"],
    }),
  );

export type Proveedor = {
  id: string;
  nombre: string;
  cuit: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  observaciones: string | null;
  activo: boolean;
};

export const listarProveedores = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<Proveedor[]>({
      token: context.token,
      method: "GET",
      path: ["proveedores"],
    }),
  );

export const guardarProveedor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id?: string;
    nombre: string;
    cuit?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    observaciones?: string;
    activo?: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    if (data.id) {
      await appApi<{ ok: true }>({
        token: context.token,
        method: "POST",
        path: ["proveedores", data.id],
        body: { ...data, activo: data.activo ?? true },
      });
      return { id: data.id };
    }
    return appApi<{ id: string }>({
      token: context.token,
      method: "POST",
      path: ["proveedores"],
      body: data,
    });
  });

export const productosDelProveedor = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((proveedorId: string) => proveedorId)
  .handler(async ({ context, data: proveedorId }) => {
    const result = await appApi<{ productos: string[] }>({
      token: context.token,
      method: "GET",
      path: ["proveedores", proveedorId, "productos"],
    });
    return result.productos;
  });

export const asignarProveedorRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { remitoId: string; proveedorId: string }) => input)
  .handler(async ({ context, data }) =>
    appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["remitos", data.remitoId, "proveedor"],
      body: { proveedorId: data.proveedorId },
    }),
  );

export type { Cliente };
