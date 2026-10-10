import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { appApi } from "@/lib/app-api.server";

export type ResumenSuscripcionPuesto = {
  suscripcion: {
    plan: { codigo: string; nombre: string };
    estado: "activa" | "cancelada" | "prueba" | "vencida";
    inicio: string;
    proximaRenovacion: string | null;
  };
  addons: { codigo: string; nombre: string; activo: boolean; detalle: string | null }[];
  sucursalesContratadas: number;
  mercadoAlToqueContratado: boolean;
  precioVigente: { moneda: string; monto: number; periodo: string };
  condicionesComerciales: { resumen: string; actualizado: string } | null;
  contratoVigente: {
    documentoId: string;
    version: number;
    hash: string;
    estado: string;
    aceptadoPorMi: boolean;
    fechaAceptacion: string | null;
  } | null;
  pendiente: {
    hayPendiente: boolean;
    documentoId: string | null;
    version: number | null;
    hash: string | null;
  };
};

export type CapacidadesPuesto = {
  activo: boolean;
  presencia: boolean;
  tier: "presencia" | "pro" | null;
  cuentaCorriente: boolean;
  packs: { product: string; quantity: number; consumed: number; remaining: number; status: string }[];
  avisos: {
    id: string;
    placement: string;
    status: string;
    startsOn: string;
    endsOn: string;
    currency: string;
    price: number;
  }[];
  comision: { source: "override" | "policy" | "none"; percent: number | null; percentMin: number | null; percentMax: number | null };
};

export type ContratoPuesto = {
  documentoId: string;
  version: number;
  hash: string;
  estado: string;
  titulo: string;
  fechaVigencia: string | null;
  contenido: { formato: "texto"; valor: string };
  anexos: never[];
};

export type ResultadoAceptacionContrato = {
  aceptacionId: string;
  documentoId: string;
  version: number;
  fecha: string | null;
  contratoVigente: { aceptadoPorMi: true };
};

export type HistorialContratoPuesto = {
  entradas: {
    documentoId: string;
    version: number;
    hash: string;
    tipo: string;
    estado: string;
    fechaDesde: string;
    fechaHasta: string | null;
    aceptacion: { fecha: string; aceptadoPor: string } | null;
  }[];
};

export const leerResumenSuscripcionPuesto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<ResumenSuscripcionPuesto>({
      token: context.token,
      method: "GET",
      path: ["suscripcion"],
    }),
  );

export const leerCapacidadesPuesto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<CapacidadesPuesto>({
      token: context.token,
      method: "GET",
      path: ["canal-mercado"],
    }),
  );

export const leerContratoPuesto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<ContratoPuesto>({
      token: context.token,
      method: "GET",
      path: ["suscripcion", "contrato"],
    }),
  );

export const leerHistorialContratoPuesto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    appApi<HistorialContratoPuesto>({
      token: context.token,
      method: "GET",
      path: ["suscripcion", "contrato", "historial"],
    }),
  );

export const aceptarContratoPuesto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { documentoId: string; version: number; hash: string }) => input)
  .handler(async ({ context, data }) => {
    const request = getRequest();
    return appApi<ResultadoAceptacionContrato>({
      token: context.token,
      method: "POST",
      path: ["suscripcion", "contrato", "aceptar"],
      body: data,
      forwardedFor: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request?.headers.get("user-agent")?.slice(0, 300),
    });
  });
