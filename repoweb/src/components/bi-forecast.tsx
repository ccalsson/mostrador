import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type {
  BIResult,
  TendenciaRevenue,
  PrediccionDemanda,
  RiesgoChurn,
  ProyeccionFinancial,
} from "@/lib/torre/bi-core";

type Props = {
  data: BIResult | undefined;
  isLoading: boolean;
};

export function BIForecast({ data, isLoading }: Props) {
  if (isLoading) {
    return <p className="text-sm text-muted">Calculando proyecciones...</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted">Sin datos disponibles.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        Generado: {new Date(data.generadoAt).toLocaleString("es-AR")}
      </p>
      <SeccionRevenue revenue={data.revenue} />
      <SeccionDemanda demanda={data.demanda} />
      <SeccionChurn churn={data.churn} />
      <SeccionProyeccion proyeccion={data.proyeccion} />
    </div>
  );
}

// ─── Revenue Trend ─────────────────────────────────────────────────

function SeccionRevenue({ revenue }: { revenue: TendenciaRevenue }) {
  const todos = [...revenue.historico, ...revenue.forecast];
  const maxVal = Math.max(...todos.map((p) => p.valor), 1);
  const totalHistorico = revenue.historico.length;
  const totalForecast = revenue.forecast.length;

  // Proyeccion del proximo mes (ultimo punto del forecast * 30)
  const proyeccionMes = revenue.forecast.length > 0
    ? revenue.forecast[revenue.forecast.length - 1].valor * 30
    : 0;

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-lg">Tendencias de Revenue</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-line bg-paper p-3 text-center">
          <p className="text-xs text-muted">Crecimiento mensual</p>
          <p className={cn("font-display text-xl tabular-nums", revenue.crecimientoPct >= 0 ? "text-leaf" : "text-terra")}>
            {revenue.crecimientoPct >= 0 ? "+" : ""}{revenue.crecimientoPct.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-lg border border-line bg-paper p-3 text-center">
          <p className="text-xs text-muted">Confianza (R²)</p>
          <p className="font-display text-xl tabular-nums">{(revenue.rCuadrado * 100).toFixed(0)}%</p>
        </div>
        <div className="rounded-lg border border-line bg-paper p-3 text-center">
          <p className="text-xs text-muted">Proyeccion 30 dias</p>
          <p className="font-display text-xl tabular-nums text-leaf">{money(proyeccionMes)}</p>
        </div>
      </div>

      {todos.length > 0 && (
        <div className="mt-4">
          <div className="flex items-end gap-px" style={{ height: 100 }}>
            {todos.map((p, i) => {
              const pct = maxVal > 0 ? Math.max(2, (p.valor / maxVal) * 100) : 2;
              const esForecast = i >= totalHistorico;
              return (
                <div
                  key={`${p.fecha}-${i}`}
                  className="flex flex-1 flex-col items-center"
                  title={`${p.fecha}: ${money(p.valor)}`}
                >
                  <div
                    className={cn(
                      "w-full rounded-t",
                      esForecast
                        ? "border border-dashed border-leaf/40 bg-leaf/20"
                        : "bg-leaf/70",
                    )}
                    style={{ height: `${pct}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted">
            <span>{todos[0]?.fecha ?? ""}</span>
            <span className="flex gap-3">
              <span><span className="inline-block h-2 w-2 rounded bg-leaf/70" /> Historico ({totalHistorico}d)</span>
              <span><span className="inline-block h-2 w-2 rounded border border-dashed border-leaf/40 bg-leaf/20" /> Forecast ({totalForecast}d)</span>
            </span>
            <span>{todos[todos.length - 1]?.fecha ?? ""}</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Demanda ───────────────────────────────────────────────────────

function tendenciaIcon(t: string): string {
  if (t === "subiendo") return "\u2191";
  if (t === "bajando") return "\u2193";
  return "\u2192";
}

function confianzaColor(c: number): string {
  if (c >= 0.7) return "text-leaf";
  if (c >= 0.4) return "text-[#e3c56a]";
  return "text-terra";
}

function SeccionDemanda({ demanda }: { demanda: PrediccionDemanda[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-lg">Prediccion de Demanda</h2>
      {demanda.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Sin movimientos de venta registrados.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left">
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Negocio</th>
                <th className="px-3 py-2 text-right font-medium">Prom. Diario</th>
                <th className="px-3 py-2 text-center font-medium">Tendencia</th>
                <th className="px-3 py-2 text-right font-medium">Pred. 7 dias</th>
                <th className="px-3 py-2 text-right font-medium">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {demanda.map((d, i) => (
                <tr key={`${d.producto}-${d.tenantNombre}-${i}`} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-medium">{d.producto}</td>
                  <td className="px-3 py-2 text-muted">{d.tenantNombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.promedioDiario.toFixed(1)}</td>
                  <td className={cn(
                    "px-3 py-2 text-center font-medium",
                    d.tendencia === "subiendo" ? "text-leaf" : d.tendencia === "bajando" ? "text-terra" : "text-muted",
                  )}>
                    {tendenciaIcon(d.tendencia)} {d.tendencia}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.prediccion7Dias.toFixed(0)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", confianzaColor(d.confianza))}>
                    {(d.confianza * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Churn Risk ────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "bg-terra";
  if (score >= 40) return "bg-[#e3c56a]";
  return "bg-leaf";
}

function SeccionChurn({ churn }: { churn: RiesgoChurn[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-lg">Analisis de Churn</h2>
      {churn.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Sin clientes registrados.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left">
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Factores</th>
                <th className="px-3 py-2 font-medium">Ultima actividad</th>
              </tr>
            </thead>
            <tbody>
              {churn.map((c) => (
                <tr key={c.clienteId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-medium">{c.clienteNombre}</td>
                  <td className="px-3 py-2 text-muted">{c.email || "\u2014"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-paper">
                        <div
                          className={cn("h-full rounded-full", scoreColor(c.score))}
                          style={{ width: `${c.score}%` }}
                        />
                      </div>
                      <span className="tabular-nums">{c.score}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{c.factores.join("; ")}</td>
                  <td className="px-3 py-2 text-xs text-muted">{c.ultimaActividad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Financial Projections ─────────────────────────────────────────

function SeccionProyeccion({ proyeccion }: { proyeccion: ProyeccionFinancial[] }) {
  const maxVal = Math.max(
    ...proyeccion.map((p) => Math.max(p.ingresosProyectados, p.gastosProyectados, p.ingresosReales ?? 0, p.gastosReales ?? 0)),
    1,
  );

  // Mostrar solo los ultimos 3 meses reales + los proyectados
  const visibles = proyeccion.slice(-6);

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-lg">Proyecciones Financieras</h2>

      {visibles.length > 0 && (
        <div className="mt-4">
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {visibles.map((p) => {
              const pctIng = maxVal > 0 ? Math.max(2, ((p.ingresosReales ?? p.ingresosProyectados) / maxVal) * 100) : 2;
              const pctGas = maxVal > 0 ? Math.max(2, ((p.gastosReales ?? p.gastosProyectados) / maxVal) * 100) : 2;
              const esProyectado = p.ingresosReales === null;
              return (
                <div key={p.mes} className="flex flex-1 flex-col items-center gap-px" title={p.mes}>
                  <div className="flex w-full flex-1 items-end gap-1">
                    <div
                      className={cn(
                        "flex-1 rounded-t",
                        esProyectado ? "border border-dashed border-leaf/40 bg-leaf/20" : "bg-leaf/70",
                      )}
                      style={{ height: `${pctIng}%` }}
                    />
                    <div
                      className={cn(
                        "flex-1 rounded-t",
                        esProyectado ? "border border-dashed border-terra/40 bg-terra/20" : "bg-terra/70",
                      )}
                      style={{ height: `${pctGas}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted">
            <span>{visibles[0]?.mes ?? ""}</span>
            <span className="flex gap-3">
              <span><span className="inline-block h-2 w-2 rounded bg-leaf/70" /> Ingresos</span>
              <span><span className="inline-block h-2 w-2 rounded bg-terra/70" /> Gastos</span>
            </span>
            <span>{visibles[visibles.length - 1]?.mes ?? ""}</span>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left">
              <th className="px-3 py-2 font-medium">Mes</th>
              <th className="px-3 py-2 text-right font-medium">Ingresos (real)</th>
              <th className="px-3 py-2 text-right font-medium">Ingresos (proj.)</th>
              <th className="px-3 py-2 text-right font-medium">Gastos (real)</th>
              <th className="px-3 py-2 text-right font-medium">Gastos (proj.)</th>
              <th className="px-3 py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {proyeccion.map((p) => (
              <tr key={p.mes} className={cn("border-b border-line last:border-b-0", p.ingresosReales === null && "bg-paper/50")}>
                <td className="px-3 py-2 font-medium">{p.mes}</td>
                <td className="px-3 py-2 text-right tabular-nums text-leaf">
                  {p.ingresosReales !== null ? money(p.ingresosReales) : "\u2014"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(p.ingresosProyectados)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-terra">
                  {p.gastosReales !== null ? money(p.gastosReales) : "\u2014"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(p.gastosProyectados)}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-medium", p.resultadoProyectado >= 0 ? "text-leaf" : "text-terra")}>
                  {money(p.resultadoProyectado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
