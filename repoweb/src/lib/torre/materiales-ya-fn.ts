import { createServerFn } from "@tanstack/react-start";
import { torreGuard } from "@/lib/torre-fn";

// Materiales Ya (punto de venta y logística para corralones) es otro proyecto desplegado aparte:
// la Torre no toca su base, lee su uso por HTTP con un token de servicio compartido en el header
// `x-torre-token`. Mismo reparto que Super al Toque (ver super-al-toque-fn.ts), solo del servidor.
// Acá la falta de configuración NO corta la pantalla: se devuelve el motivo y Finanzas sigue
// mostrando el resto de los negocios, porque la app de Materiales Ya puede estar apagada.

// El contrato real de GET /v1/usage. Materiales Ya responde `{ usage: {...} }`;
// los importes son enteros de PESOS, no centavos: `money()` recibe pesos, así
// que se pasan directo. Es single-tenant: `app`, `sucursales` y `moneda` las fija
// el deployment, no el corralón.
export type UsoMaterialesYa = {
  app: string;
  mes: string;
  tickets: number;
  ventas: number;
  operadores: number;
  cajas_abiertas: number;
  clientes_con_venta: number;
  sucursales: number;
  moneda: string;
};

export type LecturaMaterialesYa =
  | { disponible: false; motivo: string }
  | { disponible: true; uso: UsoMaterialesYa };

// Un corte de la app externa no puede dejar el panel colgado: se corta rápido.
const TIMEOUT_MS = 5000;

function credenciales(): { apiUrl: string; token: string } | null {
  const apiUrl = process.env.MATERIALES_YA_API_URL?.trim();
  const token = process.env.MATERIALES_YA_SERVICE_TOKEN?.trim();
  return apiUrl && token ? { apiUrl, token } : null;
}

async function pedirUso(): Promise<LecturaMaterialesYa> {
  const conf = credenciales();
  if (!conf) {
    return {
      disponible: false,
      motivo: "Falta configurar MATERIALES_YA_API_URL y MATERIALES_YA_SERVICE_TOKEN.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${conf.apiUrl}/v1/usage`, {
      headers: { "x-torre-token": conf.token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Timeout o red: la app no está, pero la Torre sigue mostrando lo suyo.
    return { disponible: false, motivo: "No se pudo contactar Materiales Ya." };
  }

  if (!res.ok) {
    // 503 = TORRE_SERVICE_TOKEN sin configurar del lado de Materiales Ya; 401 = token distinto.
    return { disponible: false, motivo: `Materiales Ya respondió ${res.status}.` };
  }

  const body = (await res.json()) as { usage?: UsoMaterialesYa };
  if (!body.usage) {
    return { disponible: false, motivo: "Materiales Ya respondió sin el campo `usage`." };
  }
  return { disponible: true, uso: body.usage };
}

// Uso de Materiales Ya para el panel de Finanzas.
export const usoMaterialesYa = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async () => pedirUso());
