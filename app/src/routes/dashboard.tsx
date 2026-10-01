import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app-shell";
import { ClimaDolar } from "@/components/clima-dolar";
import { BandejaMensajes } from "@/components/pedido-chat";
import { StockBoard } from "@/components/stock-board";
import { dashboardResumen, listAlertas, marcarAlertaLeida } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { clock, money } from "@/lib/money";
import { ESTADO_LABEL, PAGO_LABEL, type FormaPago, type PedidoEstado } from "@/lib/types";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

type Rango = 1 | 7 | 30;
type Grafico = "barras" | "linea" | "pagos" | "productos";
type Metrica = "pesos" | "tickets";

function DashboardPage() {
  const qc = useQueryClient();
  const [rango, setRango] = useState<Rango>(7);
  const [grafico, setGrafico] = useState<Grafico>("barras");
  const [metrica, setMetrica] = useState<Metrica>("pesos");
  const [dia, setDia] = useState<string | null>(null);
  const [pago, setPago] = useState<FormaPago | null>(null);
  const [producto, setProducto] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [verCola, setVerCola] = useState(false);
  const [alertasAbiertas, setAlertasAbiertas] = useState(false);
  const alertasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!alertasAbiertas) return;
    function cerrar(event: PointerEvent) {
      if (!alertasRef.current?.contains(event.target as Node)) setAlertasAbiertas(false);
    }
    window.addEventListener("pointerdown", cerrar);
    return () => window.removeEventListener("pointerdown", cerrar);
  }, [alertasAbiertas]);

  const kpis = useQuery({
    queryKey: ["kpis", rango],
    queryFn: () => dashboardResumen({ data: { dias: rango } }),
    refetchInterval: 2000,
  });
  const alertas = useQuery({
    queryKey: ["alertas"],
    queryFn: () => listAlertas(),
    refetchInterval: 4000,
  });
  const leer = useMutation({
    mutationFn: (id: string) => marcarAlertaLeida({ data: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const d = kpis.data;
  const delta = d ? d.ventas - d.ventasPrev : 0;
  const deltaTickets = d ? d.tickets - d.ticketsPrev : 0;
  const rangoLabel = rango === 1 ? "hoy" : `${rango} días`;
  const sinLeer = (alertas.data ?? []).filter((a) => !a.leida);

  const movimientos = useMemo(() => {
    const rows = d?.movimientos ?? [];
    const q = buscar.trim().toLowerCase();
    return rows.filter((m) => {
      if (dia) {
        const stamp = m.createdAt.replace("T", " ");
        if (!stamp.startsWith(dia)) return false;
      }
      if (pago && m.formaPago !== pago) return false;
      if (producto && !m.productos.toLowerCase().includes(producto.toLowerCase())) return false;
      if (q && !m.cliente.toLowerCase().includes(q) && !String(m.numero ?? "").includes(q) && !m.productos.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [d?.movimientos, dia, pago, producto, buscar]);

  function elegirDia(next: string) {
    setDia((cur) => (cur === next ? null : next));
    setVerCola(false);
  }

  return (
    <AppShell title="Tablero">
      <div>
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="inline-flex items-center gap-1.5 text-xs text-ok">
              <span className="size-2 animate-pulse rounded-full bg-ok" />
              En vivo
            </span>
            <ClimaDolar />
            <Seg
              value={String(rango)}
              options={[
                ["1", "Hoy"],
                ["7", "7 días"],
                ["30", "30 días"],
              ]}
              onChange={(v) => {
                setRango(Number(v) as Rango);
                setDia(null);
              }}
            />
            <Seg
              value={grafico}
              options={[
                ["barras", "Barras"],
                ["linea", "Línea"],
                ["pagos", "Medios"],
                ["productos", "Productos"],
              ]}
              onChange={(v) => setGrafico(v as Grafico)}
            />
            {grafico !== "pagos" ? (
              <Seg
                value={metrica}
                options={
                  grafico === "productos"
                    ? [
                        ["pesos", "Pesos"],
                        ["tickets", "Cantidad"],
                      ]
                    : [
                        ["pesos", "Pesos"],
                        ["tickets", "Tickets"],
                      ]
                }
                onChange={(v) => setMetrica(v as Metrica)}
              />
            ) : null}
            <div ref={alertasRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setAlertasAbiertas((v) => !v)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
                  alertasAbiertas ? "border-leaf bg-surface" : "border-line bg-surface",
                )}
              >
                Alertas
                <span
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums",
                    sinLeer.length ? "bg-terra text-leaf-fg" : "bg-paper-2 text-muted",
                  )}
                >
                  {sinLeer.length}
                </span>
              </button>
              {alertasAbiertas ? (
                <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-line bg-surface p-2 shadow-md">
                  <p className="px-1.5 pb-1 text-xs text-muted">
                    {sinLeer.length ? `${sinLeer.length} sin leer` : "Nada pendiente"}
                  </p>
                  <ul className="max-h-64 space-y-1 overflow-auto">
                    {(alertas.data ?? []).length === 0 ? (
                      <li className="px-1.5 py-2 text-xs text-muted">Sin alertas.</li>
                    ) : (
                      (alertas.data ?? []).slice(0, 6).map((a) => (
                        <li key={a.id} className="rounded-md bg-paper px-2 py-1.5">
                          <p className={cn("text-xs leading-snug", a.leida ? "text-muted" : "text-ink")}>{a.mensaje}</p>
                          {!a.leida ? (
                            <button
                              type="button"
                              className="mt-1 text-xs font-medium text-leaf"
                              onClick={() => leer.mutate(a.id)}
                            >
                              Marcar leída
                            </button>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <Kpi
              tono="leaf"
              label={`Ventas · ${rangoLabel}`}
              value={money(d?.ventas ?? 0)}
              hint={delta >= 0 ? `+${money(delta)} vs anterior` : `${money(delta)} vs anterior`}
              active={metrica === "pesos" && grafico !== "pagos"}
              onClick={() => {
                setMetrica("pesos");
                if (grafico === "pagos") setGrafico("barras");
              }}
            />
            <Kpi
              tono="terra"
              label="Ticket promedio"
              value={money(d?.ticketPromedio ?? 0)}
              hint={`${d?.tickets ?? 0} cobrados`}
            />
            <Kpi
              tono="naranja"
              label="Tickets"
              value={String(d?.tickets ?? 0)}
              hint={deltaTickets >= 0 ? `+${deltaTickets} vs anterior` : `${deltaTickets} vs anterior`}
              active={metrica === "tickets"}
              onClick={() => {
                setMetrica("tickets");
                if (grafico === "pagos") setGrafico("linea");
              }}
            />
            <Kpi
              tono="ambar"
              label="En cola"
              value={String(d?.enCola ?? 0)}
              hint="esperando cobro"
              active={verCola}
              onClick={() => setVerCola((v) => !v)}
            />
          </div>

          <StockBoard />

          <section className="mt-4 rounded-lg border border-line border-t-2 border-t-leaf bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-semibold">
                {grafico === "pagos"
                  ? "Medios de pago"
                  : grafico === "productos"
                    ? "Productos"
                    : rango === 1
                      ? metrica === "pesos"
                        ? "Ventas por hora"
                        : "Tickets por hora"
                      : metrica === "pesos"
                        ? "Ventas"
                        : "Tickets"}
              </h2>
              <p className="text-xs text-muted">Tocá el gráfico para filtrar los movimientos.</p>
            </div>
            {grafico === "pagos" ? (
              <MediosChart
                formas={d?.formas ?? []}
                activo={pago}
                onPick={(fp) => setPago((cur) => (cur === fp ? null : fp))}
              />
            ) : grafico === "productos" ? (
              <div className="mt-4 h-72 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={d?.top ?? []}
                    layout="vertical"
                    margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={96}
                      stroke="var(--color-muted)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v) => (metrica === "pesos" ? money(Number(v)) : String(v))}
                      contentStyle={tooltipStyle}
                    />
                    <Bar
                      dataKey={metrica === "pesos" ? "total" : "cantidad"}
                      radius={[0, 6, 6, 0]}
                      cursor="pointer"
                      onClick={(row) => {
                        const nombre = barNombre(row);
                        if (nombre) setProducto((cur) => (cur === nombre ? null : nombre));
                      }}
                    >
                      {(d?.top ?? []).map((t) => (
                        <Cell
                          key={t.nombre}
                          fill={producto === t.nombre ? "var(--color-terra)" : "var(--color-leaf)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-4 h-64 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  {grafico === "linea" ? (
                    <LineChart data={d?.series ?? []} onClick={(state) => elegirDesdeChart(state, elegirDia)}>
                      <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={12} />
                      <YAxis
                        tickFormatter={(v: number) => (metrica === "pesos" ? `${Math.round(v / 1000)}k` : String(v))}
                        stroke="var(--color-muted)"
                        fontSize={12}
                        width={36}
                      />
                      <Tooltip
                        formatter={(v) => (metrica === "pesos" ? money(Number(v)) : String(v))}
                        labelFormatter={(l) => diaCorto(String(l))}
                        contentStyle={tooltipStyle}
                      />
                      <Line
                        type="monotone"
                        dataKey={metrica === "pesos" ? "total" : "n"}
                        stroke="var(--color-leaf)"
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload } = props as {
                            cx?: number;
                            cy?: number;
                            payload?: { dia?: string };
                          };
                          const on = payload?.dia === dia;
                          return (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={on ? 5 : 3}
                              fill={on ? "var(--color-terra)" : "var(--color-leaf)"}
                            />
                          );
                        }}
                      />
                    </LineChart>
                  ) : (
                    <BarChart data={d?.series ?? []} onClick={(state) => elegirDesdeChart(state, elegirDia)}>
                      <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={12} />
                      <YAxis
                        tickFormatter={(v: number) => (metrica === "pesos" ? `${Math.round(v / 1000)}k` : String(v))}
                        stroke="var(--color-muted)"
                        fontSize={12}
                        width={36}
                      />
                      <Tooltip
                        formatter={(v) => (metrica === "pesos" ? money(Number(v)) : String(v))}
                        labelFormatter={(l) => diaCorto(String(l))}
                        contentStyle={tooltipStyle}
                      />
                      <Bar dataKey={metrica === "pesos" ? "total" : "n"} radius={[6, 6, 0, 0]} cursor="pointer">
                        {(d?.series ?? []).map((s) => (
                          <Cell key={s.dia} fill={dia === s.dia ? "var(--color-terra)" : "var(--color-leaf)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
            {dia || pago || producto ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {dia ? (
                  <Chip onClear={() => setDia(null)}>{rango === 1 ? `Hora ${diaCorto(dia)}` : `Día ${diaCorto(dia)}`}</Chip>
                ) : null}
                {pago ? <Chip onClear={() => setPago(null)}>{PAGO_LABEL[pago]}</Chip> : null}
                {producto ? <Chip onClear={() => setProducto(null)}>{producto}</Chip> : null}
              </div>
            ) : null}
          </section>

          <BandejaMensajes />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section className="min-w-0 rounded-lg border border-line border-t-2 border-t-naranja bg-surface p-3 sm:p-4">
              <h2 className="font-display text-xl font-semibold">{verCola ? "Cola ahora" : "Movimientos"}</h2>
              {!verCola ? (
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Cliente, producto o n° de ticket"
                  className="mt-3 h-11 w-full rounded-md border border-line bg-paper px-3 text-sm outline-none focus:border-leaf"
                />
              ) : null}
              <ul className="mt-3 max-h-80 space-y-2 overflow-auto">
                {verCola ? (
                  (d?.cola ?? []).length === 0 ? (
                    <li className="text-sm text-muted">No hay pedidos esperando.</li>
                  ) : (
                    (d?.cola ?? []).map((p) => (
                      <li key={p.id} className="rounded-md border border-line px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{p.cliente}</span>
                          <span className="tabular-nums text-sm">{money(p.total)}</span>
                        </div>
                        <p className="text-xs text-muted">
                          {ESTADO_LABEL[p.estado as PedidoEstado] ?? p.estado} · {p.vendedor ?? "Mostrador"} ·{" "}
                          {clock(p.createdAt)}
                        </p>
                      </li>
                    ))
                  )
                ) : movimientos.length === 0 ? (
                  <li className="text-sm text-muted">Nada para ese filtro.</li>
                ) : (
                  movimientos.slice(0, 12).map((m) => (
                    <li key={m.id}>
                      <Link
                        to="/ticket/$cobroId"
                        params={{ cobroId: m.id }}
                        className="block rounded-md border border-line px-3 py-2 hover:border-leaf/50"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{m.cliente}</span>
                          <span className="tabular-nums text-sm">{money(m.monto)}</span>
                        </div>
                        <p className="text-xs text-muted">
                          {m.numero ? `Nº ${m.numero} · ` : ""}
                          {PAGO_LABEL[m.formaPago]} · {clock(m.createdAt)}
                          {m.productos ? ` · ${m.productos}` : ""}
                        </p>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="min-w-0 rounded-lg border border-line border-t-2 border-t-terra bg-surface p-3 sm:p-4">
              <h2 className="font-display text-xl font-semibold">Productos del período</h2>
              <ul className="mt-3 max-h-80 space-y-1 overflow-auto">
                {(d?.top ?? []).length === 0 ? (
                  <li className="text-sm text-muted">Todavía no hay ventas en este rango.</li>
                ) : (
                  (d?.top ?? []).map((t) => {
                    const max = Math.max(...(d?.top ?? []).map((x) => x.total), 1);
                    const on = producto === t.nombre;
                    return (
                      <li key={t.nombre}>
                        <button
                          type="button"
                          onClick={() => setProducto(on ? null : t.nombre)}
                          className={cn(
                            "w-full rounded-md px-2 py-1.5 text-left",
                            on ? "bg-ok-bg" : "hover:bg-paper",
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span>{t.nombre}</span>
                            <span className="tabular-nums text-muted">{money(t.total)}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper-2">
                            <div className="h-full bg-leaf/80" style={{ width: `${(t.total / max) * 100}%` }} />
                          </div>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          </div>
      </div>
    </AppShell>
  );
}

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 12,
  color: "var(--color-ink)",
};

const PAGO_COLORS = ["var(--color-leaf)", "var(--color-terra)", "var(--color-naranja)", "var(--color-ambar)"];

function diaCorto(iso: string) {
  if (iso.length > 10) return `${iso.slice(11, 13)}h`;
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

function elegirDesdeChart(state: { activeLabel?: unknown } | null, elegirDia: (dia: string) => void) {
  const label = state?.activeLabel;
  if (typeof label === "string") elegirDia(label);
}

function barNombre(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const rec = row as { nombre?: string; payload?: { nombre?: string } };
  return rec.nombre ?? rec.payload?.nombre ?? null;
}

function MediosChart({
  formas,
  activo,
  onPick,
}: {
  formas: { formaPago: FormaPago; total: number; n: number }[];
  activo: FormaPago | null;
  onPick: (fp: FormaPago) => void;
}) {
  if (formas.length === 0) return <p className="mt-4 text-sm text-muted">Sin cobros en este período.</p>;
  return (
    <div className="mt-2 grid items-center gap-2 sm:grid-cols-[220px_1fr]">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={formas}
              dataKey="total"
              nameKey="formaPago"
              innerRadius={48}
              outerRadius={78}
              paddingAngle={2}
              cursor="pointer"
              onClick={(row) => {
                const fp = (row as { formaPago?: FormaPago })?.formaPago;
                if (fp) onPick(fp);
              }}
            >
              {formas.map((f, i) => (
                <Cell
                  key={f.formaPago}
                  fill={PAGO_COLORS[i % PAGO_COLORS.length]}
                  stroke={activo === f.formaPago ? "var(--color-ink)" : "transparent"}
                  strokeWidth={activo === f.formaPago ? 2 : 0}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, _n, item) => {
                const fp = (item?.payload as { formaPago?: FormaPago } | undefined)?.formaPago;
                return [money(Number(v)), fp ? PAGO_LABEL[fp] : ""];
              }}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1">
        {formas.map((f, i) => (
          <li key={f.formaPago}>
            <button
              type="button"
              onClick={() => onPick(f.formaPago)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm",
                activo === f.formaPago ? "bg-ok-bg" : "hover:bg-paper",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: PAGO_COLORS[i % PAGO_COLORS.length] }}
                />
                {PAGO_LABEL[f.formaPago]}
                <span className="text-xs text-muted">{f.n}</span>
              </span>
              <span className="tabular-nums">{money(f.total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-md bg-paper-2 p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "h-8 rounded-[10px] px-2.5 text-xs font-medium sm:h-9 sm:px-3 sm:text-sm",
            value === id ? "bg-surface text-ink shadow-sm" : "text-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const KPI_TONO = {
  leaf: "border-l-leaf bg-ok-bg/55",
  terra: "border-l-terra bg-warn-bg/80",
  naranja: "border-l-naranja bg-naranja/10",
  ambar: "border-l-ambar bg-ambar/15",
} as const;

function Kpi({
  label,
  value,
  hint,
  onClick,
  active,
  tono,
}: {
  label: string;
  value: string;
  hint: string;
  onClick?: () => void;
  active?: boolean;
  tono: keyof typeof KPI_TONO;
}) {
  const className = cn(
    "rounded-lg border border-l-4 border-line p-2.5 text-left sm:p-3",
    KPI_TONO[tono],
    active && "ring-1 ring-leaf/40",
    onClick && "hover:brightness-[0.98]",
  );
  const body = (
    <>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums leading-tight tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="rounded-full bg-ok-bg px-2.5 py-1 text-leaf">
      {children} · quitar
    </button>
  );
}
