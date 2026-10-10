import { createServerFn } from "@tanstack/react-start";
import type { Condicion } from "@/lib/afip-calc";
import { authMiddleware } from "@/lib/auth/middleware";
import { appApi } from "@/lib/app-api.server";

type AfipConfig = {
  cuit: string;
  razonSocial: string;
  domicilio: string;
  condicion: Condicion;
  puntoVenta: number;
  inicioActividades: string;
  iibb: string;
  alicuota: number;
  ambiente: "homo" | "prod";
  certCargado: boolean;
  keyCargada: boolean;
  lista: boolean;
  habilitada: boolean;
};

type Factura = {
  id: string;
  cobroId: string | null;
  origenId: string | null;
  cbteTipo: number;
  nombre: string;
  puntoVenta: number;
  numero: number | null;
  fecha: string;
  docTipo: number | null;
  docNro: string | null;
  receptorNombre: string | null;
  receptorCondicion: string | null;
  emisorRazon: string | null;
  emisorCuit: string | null;
  emisorDomicilio: string | null;
  emisorCondicion: string | null;
  emisorIibb: string | null;
  emisorInicio: string | null;
  ambiente: string;
  neto: number;
  iva: number;
  total: number;
  alicuota: number;
  cae: string | null;
  caeVto: string | null;
  estado: string;
  error: string | null;
  lineas: { nombre: string; cantidad: number; unidad: string; neto: number; iva: number; total: number }[];
  qr: string | null;
  qrUrl: string | null;
};

export const getAfipConfig = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<AfipConfig>({ token: context.token, method: "GET", path: ["afip", "config"] }),
  );

export const guardarAfipConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    cuit: string;
    razonSocial: string;
    domicilio: string;
    condicion: string;
    puntoVenta: number;
    inicioActividades: string;
    iibb: string;
    alicuota: number;
    ambiente: string;
    certPem?: string;
    keyPem?: string;
  }) => input)
  .handler(async ({ context, data }) =>
    appApi<AfipConfig>({
      token: context.token,
      method: "POST",
      path: ["afip", "config"],
      body: data,
    }),
  );

export const probarAfip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<{ app: string | null; db: string | null; auth: string | null; login: true }>({
      token: context.token,
      method: "POST",
      path: ["afip", "probar"],
    }),
  );

export const setArcaHabilitada = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { habilitada: boolean }) => input)
  .handler(async ({ context, data }) =>
    appApi<AfipConfig>({
      token: context.token,
      method: "POST",
      path: ["afip", "habilitada"],
      body: data,
    }),
  );

export const listarFacturacion = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<{
      config: AfipConfig;
      pendientes: {
        id: string;
        monto: number;
        createdAt: string;
        cliente: string;
        numero: number | null;
        error: string | null;
      }[];
      emitidas: Factura[];
    }>({ token: context.token, method: "GET", path: ["afip", "facturacion"] }),
  );

export const emitirFactura = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { cobroId: string }) => input)
  .handler(async ({ context, data }) =>
    appApi<Factura>({
      token: context.token,
      method: "POST",
      path: ["afip", "facturas"],
      body: data,
    }),
  );

export const emitirNotaCredito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { facturaId: string }) => input)
  .handler(async ({ context, data }) =>
    appApi<Factura>({
      token: context.token,
      method: "POST",
      path: ["afip", "notas-credito"],
      body: data,
    }),
  );

export const getFactura = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data }) =>
    appApi<Factura>({
      token: context.token,
      method: "GET",
      path: ["afip", "facturas", data],
    }),
  );
