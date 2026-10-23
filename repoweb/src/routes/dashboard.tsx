import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, Line, LineChart, Area, AreaChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ClimaDolar } from "@/components/clima-dolar";
import { IdentidadPuesto } from "@/components/identidad-puesto";
import { MesaTurno } from "@/components/mesa-turno";
import { StockBoard } from "@/components/stock-board";
import { SucursalesPuesto } from "@/components/sucursales-puesto";
import { dashboardResumen, listAlertas, marcarAlertaLeida, rankingCargadores, quienSoy, getMarca } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { clock, money } from "@/lib/money";
import { ESTADO_LABEL, PAGO_LABEL, type FormaPago, type PedidoEstado } from "@/lib/types";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

type Rango = 1 | 7 | 30;
type Grafico = "barras" | "linea" | "area";
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
  const cargadores = useQuery({ queryKey: ["ranking-cargadores"], queryFn: () => rankingCargadores() });
  const leer = useMutation({
    mutationFn: (id: string) => marcarAlertaLeida({ data: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const d = kpis.data;
  const delta = d ? d.ventas - d.ventasPrev : 0;
  const deltaTickets = d ? d.tickets - d.ticketsPrev : 0;
  const rangoLabel = rango === 1 ? "hoy" : `${rango} días`;

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
    <AppShell title="" ancho="completo">
      <div className="mb-4 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">El puesto</p>
          <h1 className="mt-1 font-display text-[1.65rem] leading-none font-semibold tracking-tight">Tablero</h1>
          <IdentidadPuesto />
        </div>
        <Vitrina
          trial={d?.trial ?? null}
          productos={(d?.top ?? []).slice(0, 3).map((t) => ({ nombre: t.nombre, total: t.total }))}
          onProducto={(nombre) => setProducto((cur) => (cur === nombre ? null : nombre))}
        />
      </div>
      <MesaTurno modo="dueno" />
      <div className="space-y-4">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-ok">
              <span className="size-2 animate-pulse rounded-full bg-ok" />
              En vivo
            </span>
            <ClimaDolar />
            <Seg
              value={String(rango)}
              options={[["1", "Hoy"], ["7", "7 días"], ["30", "30 días"]]}
              onChange={(v) => {
                setRango(Number(v) as Rango);
                setDia(null);
              }}
            />
            <Seg
              value={grafico}
              options={[["barras", "Barras"], ["linea", "Línea"], ["area", "Área"]]}
              onChange={(v) => setGrafico(v as Grafico)}
            />
            <Seg
              value={metrica}
              options={[["pesos", "Pesos"], ["tickets", "Tickets"]]}
              onChange={(v) => setMetrica(v as Metrica)}
            />
          </div>

          <div className="puesto-kpis">
            <button type="button" className="px-3 py-3 text-left" onClick={() => setMetrica("pesos")}>
              <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Ventas · {rangoLabel}</p>
              <p className="mt-1 font-display text-2xl leading-none font-semibold tabular-nums">{money(d?.ventas ?? 0)}</p>
              <p className="mt-1.5 text-[11px] text-muted">{delta >= 0 ? `+${money(delta)}` : money(delta)} vs el anterior</p>
            </button>
            <button type="button" className="px-3 py-3 text-left" onClick={() => setMetrica("tickets")}>
              <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Tickets</p>
              <p className="mt-1 font-display text-2xl leading-none font-semibold tabular-nums">{d?.tickets ?? 0}</p>
              <p className="mt-1.5 text-[11px] text-muted">{deltaTickets >= 0 ? `+${deltaTickets}` : deltaTickets} vs el anterior</p>
            </button>
            <div className="px-3 py-3">
              <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Ticket promedio</p>
              <p className="mt-1 font-display text-2xl leading-none font-semibold tabular-nums">{money(d?.ticketPromedio ?? 0)}</p>
              <p className="mt-1.5 text-[11px] text-muted">{d?.tickets ?? 0} cobrados</p>
            </div>
            <button type="button" className="px-3 py-3 text-left" onClick={() => setVerCola((v) => !v)}>
              <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">En cola</p>
              <p className="mt-1 font-display text-2xl leading-none font-semibold tabular-nums">{d?.enCola ?? 0}</p>
              <p className="mt-1.5 text-[11px] text-muted">{verCola ? "Abajo está la cola" : "Tocá para verla abajo"}</p>
            </button>
          </div>

          <SucursalesPuesto />

          <QrPuesto />

          <section className="rounded-[10px] border border-line bg-surface p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">
                {rango === 1 ? (metrica === "pesos" ? "Ventas por hora" : "Tickets por hora") : metrica === "pesos" ? "Ventas" : "Tickets"}
              </h2>
              <p className="text-xs text-muted">Tocá una barra o un punto para filtrar.</p>
            </div>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                {grafico === "linea" ? (
                  <LineChart data={d?.series ?? []} onClick={(state) => elegirDesdeChart(state, elegirDia)}>
                    <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v: number) => (metrica === "pesos" ? `${Math.round(v / 1000)}k` : String(v))} stroke="var(--color-muted)" fontSize={11} width={32} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => (metrica === "pesos" ? money(Number(v)) : String(v))} labelFormatter={(l) => diaCorto(String(l))} contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey={metrica === "pesos" ? "total" : "n"} stroke="var(--color-leaf)" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : grafico === "area" ? (
                  <AreaChart data={d?.series ?? []} onClick={(state) => elegirDesdeChart(state, elegirDia)}>
                    <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v: number) => (metrica === "pesos" ? `${Math.round(v / 1000)}k` : String(v))} stroke="var(--color-muted)" fontSize={11} width={32} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => (metrica === "pesos" ? money(Number(v)) : String(v))} labelFormatter={(l) => diaCorto(String(l))} contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey={metrica === "pesos" ? "total" : "n"} stroke="var(--color-leaf)" fill="var(--color-leaf)" fillOpacity={0.16} />
                  </AreaChart>
                ) : (
                  <BarChart data={d?.series ?? []} onClick={(state) => elegirDesdeChart(state, elegirDia)}>
                    <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v: number) => (metrica === "pesos" ? `${Math.round(v / 1000)}k` : String(v))} stroke="var(--color-muted)" fontSize={11} width={32} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => (metrica === "pesos" ? money(Number(v)) : String(v))} labelFormatter={(l) => diaCorto(String(l))} contentStyle={tooltipStyle} />
                    <Bar dataKey={metrica === "pesos" ? "total" : "n"} radius={[4, 4, 0, 0]} cursor="pointer">
                      {(d?.series ?? []).map((s) => (
                        <Cell key={s.dia} fill={dia === s.dia ? "var(--color-terra)" : "var(--color-leaf)"} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            {dia || pago || producto ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {dia ? <Chip onClear={() => setDia(null)}>{rango === 1 ? `Hora ${diaCorto(dia)}` : `Día ${diaCorto(dia)}`}</Chip> : null}
                {pago ? <Chip onClear={() => setPago(null)}>{PAGO_LABEL[pago]}</Chip> : null}
                {producto ? <Chip onClear={() => setProducto(null)}>{producto}</Chip> : null}
              </div>
            ) : null}
          </section>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,4fr)_minmax(11rem,1fr)]">
            <StockBoard />
            <section id="movimientos" className="rounded-[10px] border border-line bg-surface p-2.5">
              <h2 className="text-sm font-medium">{verCola ? "Cola ahora" : "Movimientos"}</h2>
              {!verCola ? (
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Cliente o ticket"
                  className="mt-2 h-8 w-full rounded-md border border-line bg-paper px-2 text-xs outline-none focus:border-leaf"
                />
              ) : null}
              <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {verCola ? (
                  (d?.cola ?? []).length === 0 ? (
                    <li className="text-xs text-muted">No hay pedidos esperando.</li>
                  ) : (
                    (d?.cola ?? []).map((p) => (
                      <li key={p.id} className="rounded-md border border-line px-2 py-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{p.cliente}</span>
                          <span className="shrink-0 tabular-nums text-xs">{money(p.total)}</span>
                        </div>
                        <p className="truncate text-[11px] text-muted">
                          {ESTADO_LABEL[p.estado as PedidoEstado] ?? p.estado} · {clock(p.createdAt)}
                        </p>
                      </li>
                    ))
                  )
                ) : movimientos.length === 0 ? (
                  <li className="text-xs text-muted">Nada para ese filtro.</li>
                ) : (
                  movimientos.map((m) => (
                    <li key={m.id}>
                      <Link to="/ticket/$cobroId" params={{ cobroId: m.id }} className="block rounded-md border border-line px-2 py-1.5 hover:border-leaf/50">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{m.cliente}</span>
                          <span className="shrink-0 tabular-nums text-xs">{money(m.monto)}</span>
                        </div>
                        <p className="truncate text-[11px] text-muted">
                          {m.numero ? `Nº ${m.numero} · ` : ""}
                          {PAGO_LABEL[m.formaPago]} · {clock(m.createdAt)}
                        </p>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:overflow-visible">
            <section className="flex h-40 w-[min(16rem,78vw)] shrink-0 flex-col overflow-hidden rounded-[10px] border border-line bg-surface p-3 xl:w-auto">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Cola · {d?.enCola ?? 0}</h2>
                <button type="button" className="text-xs text-leaf" onClick={() => setVerCola((v) => !v)}>
                  {verCola ? "Cobros" : "Ver"}
                </button>
              </div>
              <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {(d?.cola ?? []).length === 0 ? <li className="text-xs text-muted">Nadie esperando.</li> : null}
                {(d?.cola ?? []).map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{p.cliente}</span>
                    <span className="shrink-0 tabular-nums text-muted">{money(p.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="h-40 w-[min(16rem,78vw)] shrink-0 overflow-y-auto rounded-[10px] border border-line bg-surface p-3 xl:w-auto">
              <h2 className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Medios</h2>
              <MediosChart formas={d?.formas ?? []} activo={pago} onPick={(fp) => setPago((cur) => (cur === fp ? null : fp))} />
            </section>
            <section className="flex h-40 w-[min(16rem,78vw)] shrink-0 flex-col overflow-hidden rounded-[10px] border border-line bg-surface p-3 xl:w-auto">
              <h2 className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Alertas</h2>
              <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {(alertas.data ?? []).length === 0 ? <li className="text-xs text-muted">Nada pendiente.</li> : null}
                {(alertas.data ?? []).map((a) => (
                  <li key={a.id}>
                    <p className={cn("text-xs leading-snug", a.leida ? "text-muted" : "text-ink")}>{a.mensaje}</p>
                    {!a.leida ? (
                      <button type="button" className="mt-1 text-xs font-medium text-leaf" onClick={() => leer.mutate(a.id)}>
                        Marcar leída
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex h-40 w-[min(16rem,78vw)] shrink-0 flex-col overflow-hidden rounded-[10px] border border-line bg-surface p-3 xl:w-auto">
              <h2 className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Productos</h2>
              <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {(d?.top ?? []).length === 0 ? <li className="text-xs text-muted">Todavía no hay ventas.</li> : null}
                {(d?.top ?? []).map((t) => {
                  const max = Math.max(...(d?.top ?? []).map((x) => x.total), 1);
                  const on = producto === t.nombre;
                  return (
                    <li key={t.nombre}>
                      <button type="button" onClick={() => setProducto(on ? null : t.nombre)} className="w-full text-left">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate">{t.nombre}</span>
                          <span className="shrink-0 tabular-nums text-muted">{money(t.total)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
                          <div className={cn("h-full rounded-full", on ? "bg-terra" : "bg-leaf")} style={{ width: `${Math.max(6, (t.total / max) * 100)}%` }} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="flex h-40 w-[min(16rem,78vw)] shrink-0 flex-col overflow-hidden rounded-[10px] border border-line bg-surface p-3 xl:w-auto">
              <h2 className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Cargadores</h2>
              <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto text-sm">
                {(cargadores.data?.ranking ?? []).length === 0 ? <li className="text-xs text-muted">Todavía no hay cargadores.</li> : null}
                {(cargadores.data?.ranking ?? []).map((item) => (
                  <li key={`${item.puesto}-${item.nombre}`} className="flex items-baseline gap-2">
                    <span className="w-4 shrink-0 tabular-nums text-muted">{item.puesto}</span>
                    <span className="min-w-0 flex-1 truncate">{item.nombre}</span>
                    <span className="shrink-0 text-[11px] text-muted">{etiquetaNivel(item.nivel)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
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

function etiquetaNivel(codigo: string) {
  const mapa: Record<string, string> = { nuevo: "Nuevo", bronce: "Bronce", plata: "Plata", oro: "Oro", elite: "Elite" };
  return mapa[codigo] ?? codigo;
}

function diaCorto(iso: string) {
  if (iso.length > 10) return `${iso.slice(11, 13)}h`;
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

function desplazarSlider(el: HTMLDivElement | null, n: number) {
  const tarjeta = el?.children[n] as HTMLElement | undefined;
  if (!el || !tarjeta) return;
  const left = tarjeta.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
  el.scrollTo({ left, behavior: "smooth" });
}

const FOTOS = ["/slides/citricos.jpg", "/slides/rojos.jpg", "/slides/verdura.jpg", "/slides/puesto-color.jpg"];
const TINTES = [
  { fondo: "#e6ebf5", tinta: "#263449" },
  { fondo: "#dbe7fb", tinta: "#1746a8" },
  { fondo: "#eef2f8", tinta: "#374151" },
  { fondo: "#dfe7f5", tinta: "#1d5fd4" },
];

function fotoDe(nombre: string, indice: number) {
  const n = nombre.toLowerCase();
  if (/naranj|lim[oó]n|mandarin|pomelo|c[ií]tric/.test(n)) return FOTOS[0];
  if (/tomate|morr[oó]n|piment|frutill|manzana|pera|durazn/.test(n)) return FOTOS[1];
  if (/lechuga|acelga|espinaca|zapall|cebolla|papa|r[uú]cula/.test(n)) return FOTOS[2];
  return FOTOS[indice % FOTOS.length];
}

function Vitrina({
  trial,
  productos,
  onProducto,
}: {
  trial: Awaited<ReturnType<typeof dashboardResumen>>["trial"] | null;
  productos: { nombre: string; total: number }[];
  onProducto: (nombre: string) => void;
}) {
  const laminas: {
    id: string;
    kicker: string;
    titulo: string;
    texto: string;
    fondo: string;
    tinta: string;
    imagen: string;
    producto?: string;
  }[] = productos.map((item, indice) => {
    const tono = TINTES[indice % TINTES.length];
    return {
      id: `prod-${item.nombre}`,
      kicker: indice === 0 ? "Destacado" : "También salió",
      titulo: item.nombre,
      texto: `${money(item.total)} en este período. Tocá la foto para ver esos movimientos.`,
      fondo: tono.fondo,
      tinta: tono.tinta,
      imagen: fotoDe(item.nombre, indice),
      producto: item.nombre,
    };
  });
  if (trial) {
    const puesto =
      trial.puesto == null
        ? "Hoy todavía no cobraste."
        : trial.puesto === 1
          ? `Hoy vas primero, con ${trial.liderTickets} tickets.`
          : `Estás ${trial.puesto}° del día. El líder lleva ${trial.liderTickets} tickets.`;
    laminas.push(
      {
        id: "trial-hoy",
        kicker: "Hoy",
        titulo: `${trial.ticketsHoy} tickets`,
        texto: `Llevás ${trial.ticketsTrial} en el trial.`,
        fondo: TINTES[1].fondo,
        tinta: TINTES[1].tinta,
        imagen: trial.imagenes.resultados || FOTOS[3],
      },
      {
        id: "trial-puesto",
        kicker: "El mercado",
        titulo: puesto,
        texto: `${trial.compradores} compradores con pedido. ${trial.puestos} puestos cobraron.`,
        fondo: TINTES[2].fondo,
        tinta: TINTES[2].tinta,
        imagen: trial.imagenes.ranking || FOTOS[2],
      },
      {
        id: "trial-dias",
        kicker: "Trial Pro",
        titulo: trial.diasRestantes === 1 ? "Queda 1 día" : `Quedan ${trial.diasRestantes} días`,
        texto: "Cuando termina, Pro se contrata desde Add-ons.",
        fondo: TINTES[0].fondo,
        tinta: TINTES[0].tinta,
        imagen: trial.imagenes.cuenta || FOTOS[1],
      },
    );
  }
  const scroller = useRef<HTMLDivElement>(null);
  const [pagina, setPagina] = useState(0);
  const [pausa, setPausa] = useState(false);

  const ir = (n: number) => {
    desplazarSlider(scroller.current, n);
    setPagina(n);
  };

  useEffect(() => {
    if (pausa || laminas.length < 2) return;
    const id = window.setInterval(() => {
      setPagina((actual) => {
        const next = (actual + 1) % laminas.length;
        desplazarSlider(scroller.current, next);
        return next;
      });
    }, 7000);
    return () => window.clearInterval(id);
  }, [pausa, laminas.length]);

  if (laminas.length === 0) return null;

  return (
    <div className="relative" onPointerEnter={() => setPausa(true)} onPointerLeave={() => setPausa(false)}>
      <div
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (!el) return;
          const ancho = el.firstElementChild?.getBoundingClientRect().width ?? el.clientWidth;
          setPagina(Math.min(laminas.length - 1, Math.max(0, Math.round(el.scrollLeft / (ancho + 12)))));
        }}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {laminas.map((lamina) => (
          <article
            key={lamina.id}
            className="relative h-36 w-full shrink-0 snap-start overflow-hidden rounded-[14px]"
          >
            <img src={lamina.imagen} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
            <button
              type="button"
              className="relative flex h-full w-full flex-col justify-end px-3 py-2.5 text-left text-[#f2f5f9]"
              onClick={() => {
                if (lamina.producto) onProducto(lamina.producto);
              }}
            >
              <p className="text-[10px] font-medium tracking-[0.16em] uppercase opacity-80">{lamina.kicker}</p>
              <h2 className="mt-1 font-display text-xl leading-none font-semibold tracking-tight">{lamina.titulo}</h2>
              <p className="mt-1 line-clamp-1 text-xs opacity-80">{lamina.texto}</p>
            </button>
          </article>
        ))}
      </div>
      {laminas.length > 1 ? (
        <div className="pointer-events-none absolute right-2 bottom-2 flex gap-1.5">
          {laminas.map((lamina, n) => (
            <button
              key={lamina.id}
              type="button"
              aria-label={lamina.kicker}
              onClick={() => ir(n)}
              className={cn("pointer-events-auto h-1.5 rounded-full", pagina === n ? "w-4 bg-[#f2f5f9]" : "w-1.5 bg-white/50")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function elegirDesdeChart(state: { activeLabel?: unknown }, elegir: (dia: string) => void) {
  const label = state?.activeLabel;
  if (typeof label === "string") elegir(label);
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
  if (formas.length === 0) return <p className="mt-3 text-sm text-muted">Sin cobros en este período.</p>;
  return (
    <div className="mt-2">
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={formas}
              dataKey="total"
              nameKey="formaPago"
              innerRadius={36}
              outerRadius={54}
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

function QrPuesto() {
  const me = useQuery({ queryKey: ["quien"], queryFn: () => quienSoy() });
  const marca = useQuery({ queryKey: ["marca"], queryFn: () => getMarca() });
  const [qr, setQr] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);

  const tenantId = me.data?.tipo === "staff" ? me.data.staff.tenantId : me.data?.tipo === "cliente" ? me.data.tenant?.id : null;
  const nombre = marca.data?.nombre ?? (me.data?.tipo === "staff" ? me.data.tenant?.nombre : null);
  const url = tenantId && typeof window !== "undefined" ? `${window.location.origin}/mercado?puesto=${tenantId}` : "";

  useEffect(() => {
    if (!url) return;
    void import("qrcode")
      .then((mod) => mod.default.toDataURL(url, { margin: 1, width: 240 }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  if (!tenantId || !url) return null;

  function imprimir() {
    window.print();
  }

  return (
    <section className="rounded-[10px] border border-line bg-surface p-3">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAbierta((v) => !v)}>
        <h2 className="text-sm font-medium">QR del puesto</h2>
        <span className="text-xs text-leaf">{abierta ? "Cerrar" : "Ver e imprimir"}</span>
      </button>
      {abierta ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">
            Los compradores pueden escanear este QR para entrar directo a tu puesto en Mercado al Toque.
          </p>
          <div className="flex flex-col items-center gap-3">
            {qr ? (
              <img src={qr} alt={`QR de ${nombre ?? "puesto"}`} className="size-40 rounded-md border border-line" />
            ) : (
              <div className="flex size-40 items-center justify-center rounded-md border border-line bg-paper text-xs text-muted">
                Generando…
              </div>
            )}
            <p className="max-w-full break-all text-center text-xs text-muted">{url}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={imprimir}>Imprimir QR</Button>
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(url)}
            >
              Copiar enlace
            </Button>
          </div>
        </div>
      ) : null}
      <div id="qr-print" className="hidden print:block">
        <p className="qr-nombre">{nombre ?? "Mi puesto"}</p>
        {qr ? <img src={qr} alt="" className="qr-imagen" /> : null}
        <p className="qr-url">{url}</p>
        <p className="qr-subtitulo">Escaneá para entrar en Mercado al Toque</p>
      </div>
    </section>
  );
}
