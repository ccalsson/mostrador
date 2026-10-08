import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { dashboardTorre, listPlans } from "@/lib/torre-fn";
import { listAudit, resumenComercial } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/")({ component: TorreHome });

const ESTADO: Record<string, string> = { active: "Activa", paused: "Pausada", archived: "Archivada" };

function TorreHome() {
  const data = useQuery({ queryKey: ["torre-dash"], queryFn: () => dashboardTorre() });
  const comercial = useQuery({ queryKey: ["torre-comercial"], queryFn: () => resumenComercial() });
  const auditoria = useQuery({ queryKey: ["torre-audit"], queryFn: () => listAudit() });
  const planes = useQuery({ queryKey: ["torre-planes"], queryFn: () => listPlans() });
  const d = data.data;
  const c = comercial.data;
  const mrr = c ? Object.entries(c.mrr).map(([moneda, valor]) => `${moneda} ${valor}`).join(" · ") || "0" : "…";
  const pendiente = c ? c.pending.map((row) => `${row.currency} ${row.amount}`).join(" · ") || "0" : "…";
  const ingresos = d ? (d.incomeByCurrency.length ? d.incomeByCurrency.map((row) => `${row.currency} ${row.amount}`).join(" · ") : "0") : "…";
  return (
    <TorreShell title="Tablero">
      {data.error ? <p className="text-sm text-terra">{(data.error as Error).message}</p> : null}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Kpi label="Aplicaciones activas" value={String(d?.apps ?? 0)} />
        <Kpi label="Clientes activos" value={String(d?.clients ?? 0)} />
        <Kpi label="Tenants activos" value={String(d?.tenants ?? 0)} />
        <Kpi label="Ingresos del mes" value={ingresos} />
        <Kpi label="Gastos del mes" value={d ? String(d.expenses) : "…"} />
        <Kpi label="MRR contratado" value={mrr} />
        <Kpi label="Pendiente de cobro" value={pendiente} />
        <Kpi label="Planes" value={String(planes.data?.length ?? 0)} />
        <Kpi label="Suscripciones" value={String(c?.subscriptions ?? 0)} />
        <Kpi label="Mostrador Base" value={String(c?.mostrador ?? 0)} />
        <Kpi label="Mercado al Toque" value={String(c?.mercado ?? 0)} />
        <Kpi label="Sucursales" value={String(c?.branches ?? 0)} />
        <Kpi label="Add-ons" value={String(c?.addons ?? 0)} />
        <Kpi label="Publicidad activa" value={String(c?.ads ?? 0)} />
        <Kpi label="Packs de envío" value={String(c?.packs ?? 0)} />
        <Kpi label="Documentos legales" value={c ? `${c.publishedDocuments} publicados / ${c.documents}` : "…"} />
        <Kpi label="Contratos pendientes" value={String(c?.pendingContracts ?? 0)} />
        <Kpi label="Aceptaciones" value={String(c?.acceptances ?? 0)} />
        <Kpi label="Releases publicados" value={String(c?.releases ?? 0)} />
      </div>
      <section className="mt-4 rounded-lg border border-line bg-surface p-3">
        <h2 className="font-medium">Aplicaciones</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {(d?.aplicaciones ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{a.name}</span>
                <span className="ml-2 text-muted">{a.tenants} tenants · {a.current_version || "sin versión"}</span>
              </span>
              <Badge tone={a.status === "active" ? "ok" : "muted"}>{ESTADO[a.status] ?? a.status}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4 rounded-lg border border-line bg-surface p-3">
        <h2 className="font-medium">Alertas</h2>
        {(d?.alertas ?? []).length === 0 && (c?.alertas ?? []).length === 0 ? <p className="mt-2 text-sm text-muted">Nada pendiente.</p> : null}
        <ul className="mt-2 space-y-1 text-sm">
          {(d?.alertas ?? []).map((a) => (
            <li key={a.texto} className="rounded-md bg-warn-bg px-2 py-1.5 text-terra">{a.texto}</li>
          ))}
          {(c?.alertas ?? []).map((texto) => (
            <li key={texto} className="rounded-md bg-warn-bg px-2 py-1.5 text-terra">{texto}</li>
          ))}
        </ul>
      </section>
      <section className="mt-4 rounded-lg border border-line bg-surface p-3">
        <h2 className="font-medium">Actividad</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(auditoria.data ?? []).slice(0, 8).map((row, index) => (
            <li key={`${row.at}-${row.entityId}-${index}`}>
              <span className="font-medium">{row.action}</span>
              <span className="ml-2 text-muted">{row.entity} · {row.actor} · {row.at}</span>
            </li>
          ))}
          {(auditoria.data ?? []).length === 0 ? <li className="text-muted">Sin eventos.</li> : null}
        </ul>
      </section>
    </TorreShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
