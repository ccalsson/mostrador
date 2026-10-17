import { createServerFn } from "@tanstack/react-start";
import { torreGuard } from "@/lib/torre-fn";

// KPIs comerciales de Super al Toque, leídos vía API con token de servicio.
// La Torre no tiene acceso directo a la base de Super al Toque: todo pasa por HTTP.
export const kpisSuperAlToque = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { dias?: number } | undefined) => {
    const raw = input?.dias;
    const dias = raw === 1 || raw === 7 || raw === 30 ? raw : 30;
    return { dias };
  })
  .handler(async ({ data }) => {
    const apiUrl = process.env.SUPER_AL_TOQUE_API_URL;
    const token = process.env.SUPER_AL_TOQUE_SERVICE_TOKEN;
    if (!apiUrl || !token) {
      throw new Error("Super al Toque no está configurado (falta SUPER_AL_TOQUE_API_URL o SUPER_AL_TOQUE_SERVICE_TOKEN)");
    }

    const url = `${apiUrl}/v1/integration/kpis?days=${data.dias}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error leyendo KPIs de Super al Toque: ${res.status} ${text}`);
    }

    return res.json() as Promise<{
      city: string;
      days: number;
      timezone: string;
      generatedAt: string;
      sales: {
        ordersCount: number;
        cancelledCount: number;
        gmvCents: number;
        commissionCents: number;
        avgTicketCents: number;
        avgMinutesToDelivered: number;
      };
      merchants: {
        active: number;
        pending: number;
        suspended: number;
        closed: number;
        openNow: number;
      };
      deliveries: {
        inFlight: number;
        unassigned: number;
        deliveryFeeCents: number;
      };
      byMerchant: {
        merchantId: string;
        name: string;
        category: string;
        status: string;
        commissionRatePct: number;
        ordersCount: number;
        salesCents: number;
        commissionCents: number;
      }[];
    }>;
  });
