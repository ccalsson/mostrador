import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dashboardTorre } from "@/lib/torre-fn";
import { comprobantePago, habilitarPedidoAddon, listAudit, pedidosAddon, resumenComercial } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/")({ component: TorreHome });

const ESTADO: Record<string, string> = { active: "Activa", paused: "Pausada", archived: "Archivada" };
const TIPO: Record<string, string> = { version: "Versión", pago: "Pago", app: "App", deploy: "Deploy", abono: "Abono" };

function hora(iso: string) {
  return iso ? iso.slice(0, 16).replace("T", " ") : "";
}

function TorreHome() {
  const data = useQuery({ queryKey: ["torre-dash"], queryFn: () => dashboardTorre() });
  const comercial = useQuery({ queryKey: ["torre-comercial"], queryFn: () => resumenComercial() });
  const auditoria = useQuery({ queryKey: ["torre-audit"], queryFn: () => listAudit() });
  const pedidos = useQuery({ queryKey: ["torre-pedidos-addon"], queryFn: () => pedidosAddon() });
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState<{ nombre: string; data: string } | null>(null);
  const d = data.data;
  const c = comercial.data;
  const mrr = c ? Object.entries(c.mrr).map(([moneda, valor]) => `${moneda} ${valor}`).join(" · ") || "0" : "…";
  const pendiente = c ? c.pending.map((row) => `${row.currency} ${row.amount}`).join(" · ") || "0" : "…";
  const usdMes = d?.incomeByCurrency.find((row) => row.currency === "USD")?.amount ?? 0;
  const arsMes = d?.incomeByCurrency.find((row) => row.currency === "ARS")?.amount ?? 0;
  const gastos = d?.expenses ?? 0;
  const margen = arsMes - gastos;
  const margenPct = arsMes > 0 ? Math.round((margen / arsMes) * 100) : null;
  const hoy = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long" });
  const alertas = [...(d?.alertas ?? []).map((a) => ({ tipo: a.tipo, texto: a.texto })), ...(c?.alertas ?? []).map((texto) => ({ tipo: "abono", texto }))];

  return (
    <TorreShell title="Tablero">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-4 xl:grid-cols-[16rem_minmax(0,34rem)_16rem]">
        <aside className="order-2 space-y-4 xl:order-1">
          <section className="rounded-lg border border-line bg-surface p-3">
            <h2 className="text-sm font-medium">Cobrado en dólares</h2>
            <p className="text-xs text-muted">30 días, solo pagado</p>
            <Serie titulo="USD" dataKey="usd" color="var(--color-leaf)" filas={d?.serie ?? []} />
          </section>
          <Barras
            titulo="Negocios por aplicación"
            filas={(d?.aplicaciones ?? []).map((app) => ({ nombre: app.name, valor: app.tenants }))}
          />
          <section className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">Alertas</h2>
              <span className="text-xs text-muted">{alertas.length}</span>
            </div>
            {alertas.length === 0 ? <p className="mt-2 text-sm text-muted">Nada pendiente.</p> : null}
            <ul className="mt-2 space-y-1.5 text-sm">
              {alertas.map((a) => (
                <li key={a.texto} className="rounded-md bg-warn-bg px-2 py-1.5">
                  <span className="text-[10px] font-medium tracking-wide text-terra uppercase">{TIPO[a.tipo] ?? a.tipo}</span>
                  <p className="text-ink-soft">{a.texto}</p>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div className="order-1 space-y-4 xl:order-2">
          <p className="text-sm text-muted">
            {d ? `${hoy} · ${d.clients} clientes · ${d.tenants} negocios · ${d.apps} aplicaciones` : "Leyendo los negocios…"}
          </p>
          {data.error ? <p className="text-sm text-terra">{(data.error as Error).message}</p> : null}
          <div className="torre-kpis">
            <Kpi label="Negocios activos" value={String(d?.tenants ?? "…")} hint={`${d?.apps ?? 0} aplicaciones`} />
            <Kpi label="Abono mensual" value={mrr} hint={`${c?.subscriptions ?? 0} suscripciones`} />
            <Kpi label="Pendiente de cobro" value={pendiente} hint={`${c?.addons ?? 0} add-ons activos`} />
            <Kpi label="Para habilitar" value={String(pedidos.data?.length ?? "…")} hint="No se prenden solos" />
          </div>

          <section className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-medium">Corte del mes</h2>
              <p className="text-[11px] text-muted">El margen resta gastos de lo cobrado en pesos.</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-[11px] tracking-wide text-muted uppercase">Cobrado USD</dt>
                <dd className="font-display text-lg font-semibold tabular-nums">{d ? usdMes : "…"}</dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-muted uppercase">Cobrado ARS</dt>
                <dd className="font-display text-lg font-semibold tabular-nums">{d ? arsMes : "…"}</dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-muted uppercase">Gastos</dt>
                <dd className="font-display text-lg font-semibold tabular-nums">{d ? gastos : "…"}</dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-muted uppercase">Margen</dt>
                <dd className="font-display text-lg font-semibold tabular-nums">
                  {d ? margen : "…"}
                  {margenPct != null ? <span className="ml-1 text-sm text-muted">{margenPct}%</span> : null}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface p-3">
            <h2 className="font-medium">Pedidos para habilitar</h2>
            <p className="mt-1 text-sm text-muted">El dueño contrata. El servicio no se prende hasta acá.</p>
            {(pedidos.data ?? []).length === 0 ? <p className="mt-2 text-sm text-muted">No hay pedidos nuevos.</p> : null}
            <ul className="mt-2 space-y-2">
              {(pedidos.data ?? []).map((pedido) => (
                <li key={pedido.id} className="rounded-md border border-line bg-paper px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{pedido.tenant}</p>
                    <p className="text-[11px] text-muted">{hora(pedido.at)}</p>
                  </div>
                  <p className="text-muted">{pedido.product}</p>
                  <p className="mt-1 tabular-nums">
                    {pedido.currency} {pedido.amount}
                    <span className="text-muted"> · {pedido.medio === "cuenta" ? "a cargo en cuenta" : "transferencia"}</span>
                  </p>
                  {pedido.notes ? <p className="mt-1 text-xs text-muted">{pedido.notes}</p> : null}
                  {pedido.comprobanteNombre ? <p className="text-xs text-muted">{pedido.comprobanteNombre}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pedido.tieneComprobante ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          void comprobantePago({ data: pedido.id })
                            .then((archivo) => setComprobante(archivo))
                            .catch((err: Error) => toast.error(err.message));
                        }}
                      >
                        Ver comprobante
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      disabled={ocupado === pedido.id}
                      onClick={() => {
                        setOcupado(pedido.id);
                        void habilitarPedidoAddon({ data: pedido.id })
                          .then(async () => {
                            toast.success("Add-on habilitado");
                            await qc.invalidateQueries({ queryKey: ["torre-pedidos-addon"] });
                            await qc.invalidateQueries({ queryKey: ["torre-comercial"] });
                          })
                          .catch((err: Error) => toast.error(err.message))
                          .finally(() => setOcupado(null));
                      }}
                    >
                      Habilitar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {comprobante?.data.startsWith("data:image/") ? (
              <img src={comprobante.data} alt={comprobante.nombre} className="mt-3 max-h-80 rounded-md border border-line" />
            ) : null}
            {comprobante && !comprobante.data.startsWith("data:image/") ? (
              <a className="mt-3 inline-block text-sm text-leaf" href={comprobante.data} download={comprobante.nombre}>
                Bajar {comprobante.nombre}
              </a>
            ) : null}
          </section>

          <section>
            <h2 className="mb-2 font-medium">Aplicaciones</h2>
            <ul className="space-y-2">
              {(d?.aplicaciones ?? []).map((app) => (
                <li key={app.id} className="rounded-lg border border-line border-t-2 border-t-leaf bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{app.name}</p>
                      <p className="text-sm text-muted">
                        {app.tenants} {app.tenants === 1 ? "negocio" : "negocios"}
                        {d?.tenants ? ` · ${Math.round((app.tenants / d.tenants) * 100)}% del total` : ""}
                        {" · "}
                        {app.current_version || "sin versión"}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2">
                        <div className="h-full rounded-full bg-leaf" style={{ width: `${d?.tenants ? (app.tenants / d.tenants) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <Badge tone={app.status === "active" ? "ok" : "muted"}>{ESTADO[app.status] ?? app.status}</Badge>
                  </div>
                  <Link to="/torre/tenants" className="mt-2 inline-block text-sm text-leaf">Ver negocios</Link>
                </li>
              ))}
              {(d?.aplicaciones ?? []).length === 0 ? <li className="text-sm text-muted">Todavía no hay aplicaciones.</li> : null}
            </ul>
          </section>
        </div>

        <aside className="order-3 space-y-4">
          <section className="rounded-lg border border-line bg-surface p-3">
            <h2 className="text-sm font-medium">Cobrado en pesos</h2>
            <p className="text-xs text-muted">30 días, solo pagado</p>
            <Serie titulo="ARS" dataKey="ars" color="var(--color-ambar)" filas={d?.serie ?? []} />
          </section>
          <Barras
            titulo="Qué tienen contratado"
            filas={[
              { nombre: "Mostrador", valor: c?.mostrador ?? 0 },
              { nombre: "Mercado", valor: c?.mercado ?? 0 },
              { nombre: "Sucursales", valor: c?.branches ?? 0 },
              { nombre: "Publicidad", valor: c?.ads ?? 0 },
              { nombre: "Packs", valor: c?.packs ?? 0 },
              { nombre: "Aceptados", valor: c?.acceptances ?? 0 },
            ]}
          />
          <section className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">Actividad</h2>
              <Link to="/torre/auditoria" className="text-sm text-leaf">Ver todo</Link>
            </div>
            <ul className="mt-2 space-y-2 text-sm">
              {(auditoria.data ?? []).slice(0, 8).map((row, index) => (
                <li key={`${row.at}-${row.entityId}-${index}`}>
                  <p className="font-medium">{row.action}</p>
                  <p className="text-xs text-muted">{row.actor || "sin usuario"} · {row.entity} · {row.at}</p>
                </li>
              ))}
              {(auditoria.data ?? []).length === 0 ? <li className="text-muted">Sin eventos.</li> : null}
            </ul>
          </section>
        </aside>
      </div>
    </TorreShell>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl leading-none font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function Serie({
  titulo,
  dataKey,
  color,
  filas,
}: {
  titulo: string;
  dataKey: "usd" | "ars";
  color: string;
  filas: { dia: string; usd: number; ars: number }[];
}) {
  const total = filas.reduce((acc, row) => acc + row[dataKey], 0);
  return (
    <div>
      <p className="text-sm text-muted">{titulo} · {total}</p>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas}>
            <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} interval={6} />
            <YAxis stroke="var(--color-muted)" fontSize={11} width={36} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value) => [value, titulo]}
              labelFormatter={(label) => diaCorto(String(label))}
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8 }}
            />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Barras({ titulo, filas }: { titulo: string; filas: { nombre: string; valor: number }[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h2 className="text-sm font-medium">{titulo}</h2>
      <div className="mt-2 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={filas} margin={{ left: 4, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="nombre" width={78} stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8 }} />
            <Bar dataKey="valor" name="Cantidad" fill="var(--color-leaf)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {filas.map((fila) => (
          <li key={fila.nombre} className="flex justify-between gap-2">
            <span className="text-muted">{fila.nombre}</span>
            <span className="tabular-nums">{fila.valor}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function diaCorto(iso: string) {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}