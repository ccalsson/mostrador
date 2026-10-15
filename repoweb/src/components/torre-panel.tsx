import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { panelPantalla } from "@/lib/torre/panel-fn";

type Tipo = "barras" | "linea" | "area";
const TIPOS: { id: Tipo; label: string }[] = [
  { id: "barras", label: "Barras" },
  { id: "linea", label: "Línea" },
  { id: "area", label: "Área" },
];

function tipoGuardado(): Tipo {
  if (typeof window === "undefined") return "barras";
  const guardado = window.localStorage.getItem("torre-grafico");
  return guardado === "linea" || guardado === "area" ? guardado : "barras";
}

export function TorrePanel({ clave }: { clave: string }) {
  const [tipo, setTipo] = useState<Tipo>(tipoGuardado);
  const panel = useQuery({
    queryKey: ["torre-panel", clave],
    queryFn: () => panelPantalla({ data: { clave } }),
  });
  const d = panel.data;
  const serie = d?.serie ?? [];
  const ultimos = serie.slice(-7).reduce((acc, row) => acc + row.valor, 0);
  const previos = serie.slice(-14, -7).reduce((acc, row) => acc + row.valor, 0);
  const delta = previos === 0 ? null : Math.round(((ultimos - previos) / previos) * 100);
  const maximo = Math.max(...(d?.barras.map((row) => row.valor) ?? [0]), 1);

  function elegir(siguiente: Tipo) {
    setTipo(siguiente);
    window.localStorage.setItem("torre-grafico", siguiente);
  }

  return (
    <aside className="xl:sticky xl:top-[4.5rem]">
      <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
        <div className="border-b border-line px-3 py-3">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">{d?.titulo ?? "De esta pantalla"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{d?.detalle ?? "Cifras de lo que estás viendo, no un adorno."}</p>
        </div>
        {panel.error ? <p className="px-3 py-3 text-sm text-terra">{(panel.error as Error).message}</p> : null}
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">{d?.serieLabel ?? "Serie"}</p>
          <div className="flex rounded-md bg-paper-2 p-0.5">
            {TIPOS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => elegir(item.id)}
                className={item.id === tipo ? "rounded-[6px] bg-surface px-2 py-1 text-[11px] font-medium" : "px-2 py-1 text-[11px] text-muted"}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-3 pt-2 pb-3">
          <p className="text-[11px] text-muted">
            {delta === null ? "Sin base para comparar la última semana." : `${delta > 0 ? "+" : ""}${delta}% contra los 7 días anteriores`}
          </p>
          <div className="mt-2 h-28">
            <ResponsiveContainer width="100%" height="100%">
              {tipo === "linea" ? (
                <LineChart data={serie}>
                  <XAxis dataKey="dia" hide />
                  <Tooltip formatter={(value) => [value, d?.serieLabel ?? ""]} labelFormatter={(label) => String(label).slice(5)} contentStyle={estilo} />
                  <Line type="monotone" dataKey="valor" stroke="var(--color-leaf)" strokeWidth={2} dot={false} />
                </LineChart>
              ) : tipo === "area" ? (
                <AreaChart data={serie}>
                  <XAxis dataKey="dia" hide />
                  <Tooltip formatter={(value) => [value, d?.serieLabel ?? ""]} labelFormatter={(label) => String(label).slice(5)} contentStyle={estilo} />
                  <Area type="monotone" dataKey="valor" stroke="var(--color-leaf)" fill="var(--color-leaf)" fillOpacity={0.18} />
                </AreaChart>
              ) : (
                <BarChart data={serie}>
                  <XAxis dataKey="dia" hide />
                  <Tooltip formatter={(value) => [value, d?.serieLabel ?? ""]} labelFormatter={(label) => String(label).slice(5)} contentStyle={estilo} />
                  <Bar dataKey="valor" fill="var(--color-leaf)" radius={[3, 3, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-line">
          {(d?.kpis ?? []).map((kpi) => (
            <div key={kpi.label} className="border-line px-3 py-2.5 odd:border-r [&:nth-child(-n+2)]:border-b">
              <p className="text-[11px] tracking-wide text-muted uppercase">{kpi.label}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-3 py-3">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">{d?.barrasLabel ?? "Comparación"}</p>
          <ul className="mt-2 space-y-2">
            {(d?.barras ?? []).length === 0 ? <li className="text-xs text-muted">Nada para comparar.</li> : null}
            {(d?.barras ?? []).map((row) => (
              <li key={row.nombre}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate">{row.nombre}</span>
                  <span className="shrink-0 tabular-nums text-muted">{row.valor}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.max(4, (row.valor / maximo) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-line px-3 py-3">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">{d?.filasLabel ?? "Detalle"}</p>
          <ul className="mt-2 space-y-2">
            {(d?.filas ?? []).length === 0 ? <li className="text-xs text-muted">Nada pendiente en esta lista.</li> : null}
            {(d?.filas ?? []).map((row) => (
              <li key={`${row.titulo}-${row.detalle}`}>
                <p className="truncate text-sm font-medium">{row.titulo}</p>
                <p className="truncate text-xs text-muted">{row.detalle}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </aside>
  );
}

const estilo = { background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 };
