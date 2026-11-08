import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { DashboardEjecutivo } from "@/lib/torre/ejecutivo-fn";

type Rango = 1 | 7 | 30;

type Props = {
  data: DashboardEjecutivo | undefined;
  dias: Rango;
  onDiasChange: (d: Rango) => void;
  isPending: boolean;
  error: Error | null;
};

const RANGOS: [Rango, string][] = [
  [1, "Hoy"],
  [7, "7 dias"],
  [30, "30 dias"],
];

export function EjecutivoDashboard({ data, dias, onDiasChange, isPending, error }: Props) {
  return (
    <div className="space-y-5">
      {/* Selector de periodo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Vista consolidada de Mostrador, Mercado al Toque, Super al Toque y Materiales Ya.
        </p>
        <div className="flex rounded-md bg-paper-2 p-1">
          {RANGOS.map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => onDiasChange(valor)}
              className={cn(
                "h-8 rounded-md px-3 text-sm transition-colors",
                valor === dias ? "bg-surface font-medium" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-terra">{error.message}</p> : null}
      {isPending && !data ? <p className="text-sm text-muted">Cargando metricas...</p> : null}

      {data ? (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Revenue total" value={money(data.revenueTotal)} hint={`Ultimos ${data.dias} dia(s)`} />
            <Kpi label="Usuarios activos" value={String(data.usuariosActivos.total)} hint="con sesion abierta" />
            <Kpi label="Pedidos en curso" value={String(data.pedidosEnCurso.total)} hint="enviados + preparando + listos" />
            <Kpi label="Alertas" value={String(data.alertas.length)} tone={data.alertas.length > 0 ? "warn" : "default"} />
          </div>

          {/* Revenue por app (barras) */}
          <section className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-display text-sm font-semibold">Revenue por app</h2>
            <RevenueBarras revenue={data.revenue} total={data.revenueTotal} />
          </section>

          {/* Top productos + Alertas */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top 10 productos */}
            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-display text-sm font-semibold">Top 10 productos</h2>
              {data.topProductos.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Sin ventas en este periodo.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {data.topProductos.map((p, i) => (
                    <li key={`${p.nombre}-${i}`} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 text-xs text-muted tabular-nums">{i + 1}.</span>
                        {p.nombre}
                      </span>
                      <span className="shrink-0 tabular-nums">{money(p.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Alertas */}
            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-display text-sm font-semibold">Alertas activas</h2>
              {data.alertas.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Todo en orden.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {data.alertas.map((a, i) => (
                    <li
                      key={`${a.tipo}-${i}`}
                      className={cn(
                        "rounded-md px-3 py-2",
                        a.tipo === "stock" ? "bg-warn-bg" : "bg-[#fef3f2]",
                      )}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        {a.tipo === "stock" ? "Stock bajo" : "Pago pendiente"}
                      </p>
                      <p className="mt-0.5">{a.texto}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Detalle de usuarios y pedidos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-display text-sm font-semibold">Usuarios activos</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Detalle label="Staff online" value={data.usuariosActivos.staff} />
                <Detalle label="Clientes" value={data.usuariosActivos.clientes} />
                <Detalle label="Compradores" value={data.usuariosActivos.compradores} />
                <Detalle label="Cargadores" value={data.usuariosActivos.cargadores} />
              </div>
            </section>

            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-display text-sm font-semibold">Pedidos en curso</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Detalle label="Enviados" value={data.pedidosEnCurso.enviados} />
                <Detalle label="En preparacion" value={data.pedidosEnCurso.enPreparacion} />
                <Detalle label="Listos" value={data.pedidosEnCurso.listos} />
                <Detalle label="Total" value={data.pedidosEnCurso.total} bold />
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn(
        "mt-1 font-display text-xl font-semibold tabular-nums",
        tone === "warn" ? "text-terra" : "text-ink",
      )}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Detalle({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={cn("text-muted", bold && "font-medium")}>{label}</span>
      <span className={cn("tabular-nums", bold && "font-semibold")}>{value}</span>
    </div>
  );
}

function RevenueBarras({ revenue, total }: { revenue: DashboardEjecutivo["revenue"]; total: number }) {
  const apps: { nombre: string; valor: number; color: string }[] = [
    { nombre: "Mostrador", valor: revenue.mostrador, color: "bg-leaf" },
    { nombre: "Mercado al Toque", valor: revenue.mercado, color: "bg-[#5b8def]" },
    { nombre: "Super al Toque", valor: revenue.superAlToque, color: "bg-[#e3c56a]" },
    { nombre: "Materiales Ya", valor: revenue.materialesYa, color: "bg-terra" },
  ];

  return (
    <div className="mt-3 space-y-2">
      {apps.map((app) => {
        const pct = total > 0 ? (app.valor / total) * 100 : 0;
        return (
          <div key={app.nombre}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{app.nombre}</span>
              <span className="tabular-nums text-muted">{money(app.valor)} ({pct.toFixed(1)}%)</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-2">
              <div
                className={cn("h-full rounded-full transition-all", app.color)}
                style={{ width: `${Math.max(pct, 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
