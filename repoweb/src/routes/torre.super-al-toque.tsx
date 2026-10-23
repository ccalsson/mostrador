import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TorreShell } from "@/components/torre-shell";
import { kpisSuperAlToque } from "@/lib/torre/super-al-toque-fn";
import { money } from "@/lib/money";

export const Route = createFileRoute("/torre/super-al-toque")({ component: Page });

type Rango = 1 | 7 | 30;

/** Los KPIs llegan en centavos; `money()` formatea pesos. */
function pesos(cents: number) {
  return money(cents / 100);
}

function Page() {
  const [dias, setDias] = useState<Rango>(30);
  const data = useQuery({
    queryKey: ["torre-super-al-toque", dias],
    queryFn: () => kpisSuperAlToque({ data: { dias } }),
    refetchInterval: 60000,
  });
  const d = data.data;

  return (
    <TorreShell title="Super al Toque">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">KPIs comerciales. Comparador de precios y delivery para Virasoro.</p>
        <div className="flex rounded-md bg-paper-2 p-1">
          {(
            [
              [1, "Hoy"],
              [7, "7 días"],
              [30, "30 días"],
            ] as const
          ).map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setDias(valor)}
              className={valor === dias ? "h-8 rounded-md bg-surface px-3 text-sm" : "h-8 px-3 text-sm text-muted"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {data.error ? <p className="mb-3 text-sm text-terra">{(data.error as Error).message}</p> : null}
      {data.isPending ? <p className="text-sm text-muted">Cargando KPIs…</p> : null}

      {d ? (
        <>
          <h2 className="mb-2 text-sm text-muted">Ventas</h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Kpi label="GMV" value={pesos(d.sales.gmvCents)} hint={`${d.sales.ordersCount} pedidos`} />
            <Kpi label="Comisión plataforma" value={pesos(d.sales.commissionCents)} hint="se descuenta del comercio" />
            <Kpi label="Ticket promedio" value={pesos(d.sales.avgTicketCents)} />
            <Kpi
              label="Tiempo hasta entregar"
              value={`${d.sales.avgMinutesToDelivered} min`}
              hint="promedio de los entregados"
            />
          </div>

          <h2 className="mt-4 mb-2 text-sm text-muted">Comercios</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Kpi label="Activos" value={String(d.merchants.active)} hint={`${d.merchants.openNow} abiertos ahora`} />
            <Kpi label="Pendientes" value={String(d.merchants.pending)} />
            <Kpi label="Suspendidos" value={String(d.merchants.suspended)} />
            <Kpi label="Cerrados" value={String(d.merchants.closed)} />
            <Kpi label="Cancelados" value={String(d.sales.cancelledCount)} />
          </div>

          <h2 className="mt-4 mb-2 text-sm text-muted">Repartos</h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Kpi label="En curso" value={String(d.deliveries.inFlight)} />
            <Kpi label="Sin repartidor" value={String(d.deliveries.unassigned)} hint="hay que asignar" />
            <Kpi label="Flete en juego" value={pesos(d.deliveries.deliveryFeeCents)} hint="lo cobra el comercio" />
          </div>

          <section className="mt-4 rounded-lg border border-line bg-surface p-3">
            <h2 className="font-medium">Desglose por comercio</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.byMerchant.length === 0 ? (
                <li className="py-2 text-muted">Ningún comercio vendió en este período.</li>
              ) : null}
              {d.byMerchant.map((m) => (
                <li key={m.merchantId} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="tabular-nums">{pesos(m.salesCents)}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {m.ordersCount} pedidos · comisión {m.commissionRatePct}% ({pesos(m.commissionCents)}) · {m.status}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-2 text-xs text-muted">
            Datos generados el {new Date(d.generatedAt).toLocaleString("es-AR")} · {d.city} · últimos {d.days} días
          </p>
        </>
      ) : null}
    </TorreShell>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
