import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ClimaDolar } from "@/components/clima-dolar";
import { TermicaBoton } from "@/components/termica-boton";
import { TicketSlip } from "@/components/ticket-slip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emitirFactura, emitirNotaCredito, getAfipConfig } from "@/lib/afip-fn";
import { numeroFiscal } from "@/lib/afip-calc";
import {
  anularCobro,
  anularPedido,
  cobrarPedido,
  crearPedido,
  estadoCaja,
  getTicket,
  listClientes,
  listPedidos,
  listProductos,
  marcarEntregado,
  updatePedidoEstado,
  updatePedidoItems,
} from "@/lib/fn";
import { cn } from "@/lib/cn";
import { clock, money } from "@/lib/money";
import { verComprobante } from "@/lib/portal-fn";
import { imprimirEnTermica, type TicketContenido } from "@/lib/termica";
import { PAGO_LABEL, type FormaPago, type Pedido, type Producto } from "@/lib/types";

export const Route = createFileRoute("/caja")({ component: CajaPage });

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 920;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.14);
  } catch {
    /* sin audio */
  }
}

function CajaPage() {
  const qc = useQueryClient();
  const bandeja = useQuery({
    queryKey: ["bandeja"],
    queryFn: () => listPedidos({ data: { estados: ["enviado", "en_preparacion", "listo"] } }),
    refetchInterval: 2000,
  });
  const porEntregar = useQuery({
    queryKey: ["por-entregar"],
    queryFn: () => listPedidos({ data: { estados: ["cobrado"] } }),
    refetchInterval: 4000,
  });
  const entregados = useQuery({
    queryKey: ["entregados"],
    queryFn: () => listPedidos({ data: { estados: ["entregado"] } }),
    refetchInterval: 8000,
  });
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => listProductos() });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => listClientes() });
  const caja = useQuery({ queryKey: ["caja"], queryFn: () => estadoCaja(), refetchInterval: 2000 });
  const afip = useQuery({ queryKey: ["afip-config"], queryFn: () => getAfipConfig(), staleTime: 30_000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [direct, setDirect] = useState(false);
  const [verMontos, setVerMontos] = useState(true);
  const [flash, setFlash] = useState(false);
  const [ticketListo, setTicketListo] = useState<{ cobroId: string; numero: number } | null>(null);
  const [anulaId, setAnulaId] = useState<string | null>(null);
  const [motivoTicket, setMotivoTicket] = useState("");
  const [pasando, setPasando] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const prevEsperado = useRef<number | null>(null);

  useEffect(() => {
    const ids = (bandeja.data ?? []).map((p) => p.id);
    if (seen.current.size === 0 && ids.length) {
      seen.current = new Set(ids);
      return;
    }
    let nuevo = false;
    for (const id of ids) {
      if (!seen.current.has(id)) {
        nuevo = true;
        toast.message("Pedido nuevo en bandeja");
      }
    }
    if (nuevo) beep();
    seen.current = new Set(ids);
  }, [bandeja.data]);

  useEffect(() => {
    const actual = caja.data?.esperado;
    if (actual == null) return;
    if (prevEsperado.current != null && actual !== prevEsperado.current) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 700);
      prevEsperado.current = actual;
      return () => window.clearTimeout(t);
    }
    prevEsperado.current = actual;
  }, [caja.data?.esperado]);

  const lista = bandeja.data ?? [];
  const pedido = lista.find((p) => p.id === selectedId) ?? lista[0] ?? null;
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["bandeja"] });
    void qc.invalidateQueries({ queryKey: ["caja"] });
    void qc.invalidateQueries({ queryKey: ["productos"] });
    void qc.invalidateQueries({ queryKey: ["por-entregar"] });
    void qc.invalidateQueries({ queryKey: ["entregados"] });
  };
  const entregar = useMutation({
    mutationFn: (id: string) => marcarEntregado({ data: id }),
    onSuccess: () => {
      toast.success("Pasó a entregados");
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPasando(null),
  });
  function confirmarEntrega(id: string) {
    if (pasando) return;
    setPasando(id);
    window.setTimeout(() => entregar.mutate(id), 450);
  }
  const anularTicket = useMutation({
    mutationFn: async () => {
      const row = (caja.data?.ultimos ?? []).find((t) => t.id === anulaId);
      if (row?.facturaId) await emitirNotaCredito({ data: { facturaId: row.facturaId } });
      return anularCobro({ data: { id: anulaId ?? "", motivo: motivoTicket } });
    },
    onSuccess: () => {
      toast.message("Venta anulada. Volvió el stock.");
      setAnulaId(null);
      setMotivoTicket("");
      refrescar();
      void qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const facturar = useMutation({
    mutationFn: (cobroId: string) => emitirFactura({ data: { cobroId } }),
    onSuccess: (f) => {
      toast.success(`${f.nombre} · CAE ${f.cae ?? ""}${f.ambiente === "homo" ? " (prueba)" : ""}`);
      refrescar();
      void qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Caja">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">{bandeja.data?.length ?? 0} en bandeja</p>
        <ClimaDolar />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant={direct ? "primary" : "secondary"} onClick={() => setDirect((v) => !v)}>
            Venta directa
          </Button>
          <TermicaBoton />
          <Link to="/cierre">
            <Button size="sm" variant="secondary">
              Cerrar caja
            </Button>
          </Link>
        </div>
      </div>
      {direct ? (
        <VentaDirecta
          productos={productos.data ?? []}
          clientes={clientes.data ?? []}
          onDone={(res) => {
            setDirect(false);
            setTicketListo(res);
            refrescar();
          }}
        />
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:overflow-x-auto">
          <section className="w-full rounded-lg border border-line bg-surface p-2 md:w-52 md:shrink-0">
            <h2 className="px-1 text-xs font-medium text-muted">Bandeja</h2>
            <ul className="mt-1 max-h-80 space-y-1 overflow-auto">
              {lista.length === 0 ? <li className="px-1 py-3 text-sm text-muted">No hay pedidos.</li> : null}
              {lista.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "w-full rounded-md border px-2 py-1.5 text-left",
                      pedido?.id === p.id ? "border-leaf bg-ok-bg/60" : "border-line bg-paper",
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{p.clienteNombre}</span>
                    {p.retiro ? (
                      <span className="block text-xs font-medium text-leaf">
                        Retirado · {p.retiro.changarin} · {clock(p.retiro.retiradoEn)}
                      </span>
                    ) : null}
                    <span className="flex justify-between gap-2 text-xs text-muted">
                      <span>{clock(p.createdAt)}</span>
                      <span className="tabular-nums">{money(p.total)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="w-full md:min-w-[22rem] md:flex-1">
            {pedido ? (
              <CobroPanel
                key={pedido.id}
                pedido={pedido}
                productos={productos.data ?? []}
                onPaid={(res) => {
                  setSelectedId(null);
                  if (res) setTicketListo(res);
                  refrescar();
                }}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">Elegí un pedido de la bandeja.</div>
            )}
          </section>
          <section className="w-full rounded-lg border border-line bg-surface p-2 md:w-56 md:shrink-0">
            <h2 className="px-1 text-xs font-medium text-muted">Últimos tickets</h2>
            <ul className="mt-1 max-h-80 space-y-1 overflow-auto">
              {(caja.data?.ultimos ?? []).length === 0 ? <li className="px-1 py-3 text-sm text-muted">Sin cobros.</li> : null}
              {(caja.data?.ultimos ?? []).slice(0, 8).map((t) => (
                <li key={t.id} className="rounded-md border border-line px-2 py-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.cliente}</p>
                      <p className="text-xs text-muted">
                        {money(t.monto)} · {clock(t.createdAt)}
                      </p>
                    </div>
                    <button type="button" className="shrink-0 text-xs text-terra" onClick={() => setAnulaId(anulaId === t.id ? null : t.id)}>
                      Anular
                    </button>
                  </div>
                  {t.facturaId ? (
                    <Link to="/factura/$id" params={{ id: t.facturaId }} className="text-xs font-medium text-leaf">
                      CAE {t.cae}
                    </Link>
                  ) : afip.data?.habilitada ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-leaf"
                      disabled={facturar.isPending}
                      onClick={() => facturar.mutate(t.id)}
                    >
                      Factura electrónica
                    </button>
                  ) : null}
                  {anulaId === t.id ? (
                    <div className="mt-1 space-y-1">
                      <Input placeholder="Motivo" value={motivoTicket} onChange={(e) => setMotivoTicket(e.target.value)} />
                      {t.facturaId ? (
                        <p className="text-xs text-muted">Primero se autoriza la nota de crédito.</p>
                      ) : null}
                      <Button
                        size="sm"
                        variant="danger"
                        className="w-full"
                        disabled={!motivoTicket.trim() || anularTicket.isPending}
                        onClick={() => anularTicket.mutate()}
                      >
                        {t.facturaId ? "Nota de crédito y anular" : "OK"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section className="w-full rounded-lg border border-line bg-surface p-2 md:w-52 md:shrink-0">
            <h2 className="px-1 text-xs font-medium text-muted">Entrega</h2>
            <p className="mt-1 px-1 text-[11px] font-medium text-terra">Por entregar</p>
            <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
              {(porEntregar.data ?? []).length === 0 ? <li className="px-1 py-2 text-xs text-muted">Nada pendiente.</li> : null}
              {(porEntregar.data ?? []).slice(0, 8).map((p) => {
                const listo = pasando === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-2 py-1.5 text-left transition-colors",
                        listo ? "border-leaf/50 bg-ok-bg" : "border-terra/40 bg-warn-bg",
                      )}
                      disabled={pasando !== null}
                      onClick={() => confirmarEntrega(p.id)}
                    >
                      <span className="block truncate text-sm font-medium">{p.clienteNombre}</span>
                      <span className={cn("text-xs", listo ? "text-ok" : "text-terra")}>
                        {listo ? "Entregado" : "Falta entregar"} · {money(p.total)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 px-1 text-[11px] font-medium text-ok">Entregados</p>
            <ul className="mt-1 max-h-36 space-y-1 overflow-auto">
              {(entregados.data ?? []).filter((p) => p.id !== pasando).length === 0 ? (
                <li className="px-1 py-2 text-xs text-muted">Todavía no.</li>
              ) : null}
              {(entregados.data ?? [])
                .filter((p) => p.id !== pasando)
                .slice(0, 6)
                .map((p) => (
                  <li key={p.id} className="rounded-md border border-leaf/30 bg-ok-bg px-2 py-1.5">
                    <span className="block truncate text-sm">{p.clienteNombre}</span>
                    <span className="text-xs text-ok">Entregado · {money(p.total)}</span>
                  </li>
                ))}
            </ul>
          </section>
          <section
            className={cn(
              "w-full rounded-lg border bg-surface p-3 transition-colors md:ml-auto md:w-44 md:shrink-0",
              flash ? "border-leaf bg-ok-bg" : "border-line",
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-xs text-ok">
                <span className="size-2 animate-pulse rounded-full bg-ok" />
                Turno
              </div>
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setVerMontos((v) => !v)}>
                {verMontos ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{verMontos ? money(caja.data?.esperado ?? 0) : "····"}</p>
            <p className="text-xs text-muted">
              esperado
              {caja.data?.abiertoAt ? ` · ${clock(caja.data.abiertoAt)}` : ""}
            </p>
            <ul className="mt-2 space-y-1">
              {(caja.data?.totales ?? []).length === 0 ? (
                <li className="text-xs text-muted">Sin cobros.</li>
              ) : (
                (caja.data?.totales ?? []).map((t) => (
                  <li key={t.formaPago} className="flex justify-between gap-2 text-xs">
                    <span>{PAGO_LABEL[t.formaPago] ?? t.formaPago}</span>
                    <span className="tabular-nums font-medium">{verMontos ? money(t.total) : "····"}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      )}
      {ticketListo ? (
        <TrasCobro
          ticket={ticketListo}
          lista={Boolean(afip.data?.habilitada)}
          homo={afip.data?.ambiente === "homo"}
          onClose={() => setTicketListo(null)}
        />
      ) : null}
    </AppShell>
  );
}

function CobroPanel({
  pedido,
  productos,
  onPaid,
}: {
  pedido: Pedido;
  productos: Producto[];
  onPaid: (res: { cobroId: string; numero: number } | null) => void;
}) {
  const [items, setItems] = useState(pedido.items);
  const [forma, setForma] = useState<FormaPago>(pedido.formaPago ?? "efectivo");
  const [recibido, setRecibido] = useState(String(Math.ceil(pedido.total / 1000) * 1000));
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [addId, setAddId] = useState("");
  const [comp, setComp] = useState<string | null>(null);
  const [compError, setCompError] = useState(false);
  const qc = useQueryClient();
  const cambiarEstado = useMutation({
    mutationFn: (estado: "en_preparacion" | "listo") => updatePedidoEstado({ data: { id: pedido.id, estado } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bandeja"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!pedido.comprobanteNombre) return;
    let vivo = true;
    void verComprobante({ data: pedido.id })
      .then((c) => {
        if (vivo) setComp(c.data);
      })
      .catch(() => {
        if (vivo) setCompError(true);
      });
    return () => {
      vivo = false;
    };
  }, [pedido.id, pedido.comprobanteNombre]);

  const total = items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0);
  const vuelto = forma === "efectivo" ? Math.max(0, Number(recibido || 0) - total) : 0;

  const saveItems = useMutation({
    mutationFn: () =>
      updatePedidoItems({
        data: {
          id: pedido.id,
          items: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
        },
      }),
  });

  const cobro = useMutation({
    mutationFn: async () => {
      await saveItems.mutateAsync();
      return cobrarPedido({
        data: {
          pedidoId: pedido.id,
          clientUuid: `cobro-${pedido.id}`,
          formaPago: forma,
          montoRecibido: forma === "efectivo" ? Number(recibido) : total,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Ticket Nº ${res.numero}`);
      onPaid({ cobroId: res.cobroId, numero: res.numero });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anular = useMutation({
    mutationFn: () => anularPedido({ data: { id: pedido.id, motivo } }),
    onSuccess: () => {
      toast.message("Pedido anulado");
      setAnulando(false);
      setMotivo("");
      onPaid(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold">{pedido.clienteNombre}</h2>
          <p className="truncate text-xs text-muted">
            {pedido.vendedorNombre ?? "Venta de mostrador"}
            {pedido.nota ? ` · ${pedido.nota}` : ""}
          </p>
          {pedido.retiro ? (
            <p className="text-xs font-medium text-leaf">
              Retirado · {pedido.retiro.changarin} · {clock(pedido.retiro.retiradoEn)}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 font-display text-xl font-semibold tabular-nums">{money(total)}</div>
      </div>
      {pedido.estado === "enviado" ? (
        <Button className="mt-2" size="sm" disabled={cambiarEstado.isPending} onClick={() => cambiarEstado.mutate("en_preparacion")}>
          Empezar a preparar
        </Button>
      ) : null}
      {pedido.estado === "en_preparacion" ? (
        <Button className="mt-2" size="sm" disabled={cambiarEstado.isPending} onClick={() => cambiarEstado.mutate("listo")}>
          Marcar listo
        </Button>
      ) : null}
      {pedido.formaPago ? (
        <p className="mt-1 text-xs text-muted">
          El cliente eligió {PAGO_LABEL[pedido.formaPago]}.
          {pedido.formaPago === "transferencia" ? " Mirá el comprobante y confirmá." : " Confirmá el pago en el puesto."}
        </p>
      ) : null}
      {pedido.formaPago === "transferencia" && pedido.comprobanteNombre ? (
        <div className="mt-2 rounded-md border border-naranja/40 bg-paper p-2">
          <p className="text-xs font-medium text-naranja">Comprobante de la transferencia</p>
          {comp?.startsWith("data:image") ? (
            <img src={comp} alt="Comprobante" className="mt-1 max-h-48 w-full object-contain" />
          ) : comp ? (
            <iframe title="Comprobante" src={comp} className="mt-1 h-40 w-full rounded-md bg-white" />
          ) : (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-leaf"
              onClick={() => {
                void verComprobante({ data: pedido.id })
                  .then((c) => {
                    setComp(c.data);
                    setCompError(false);
                  })
                  .catch((e: Error) => toast.error(e.message));
              }}
            >
              {compError ? "Reintentar" : "Cargando"} {pedido.comprobanteNombre}
            </button>
          )}
        </div>
      ) : null}
      <ul className="mt-2 max-h-52 divide-y divide-line overflow-auto">
        {items.map((it, idx) => (
          <li key={it.id} className="flex items-center gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{it.nombre}</div>
              <div className="text-xs text-muted">
                {money(it.precioUnitario)} / {it.unidadLabel}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                onClick={() =>
                  setItems((xs) =>
                    xs.map((x, i) => (i === idx ? { ...x, cantidad: Math.max(0, x.cantidad - 1) } : x)).filter((x) => x.cantidad > 0),
                  )
                }
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-6 text-center text-sm tabular-nums">{it.cantidad}</span>
              <Button
                size="icon"
                className="size-8"
                onClick={() => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, cantidad: x.cantidad + 1 } : x)))}
              >
                <Plus className="size-3.5" />
              </Button>
              <button
                type="button"
                className="text-muted hover:text-terra"
                onClick={() => setItems((xs) => xs.filter((_, i) => i !== idx))}
                aria-label="Quitar ítem"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <select
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm"
          value={addId}
          onChange={(e) => setAddId(e.target.value)}
        >
          <option value="">Agregar producto…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={!addId}
          onClick={() => {
            const p = productos.find((x) => x.id === addId);
            if (!p) return;
            setItems((xs) => {
              const found = xs.find((x) => x.productoId === p.id);
              if (found) return xs.map((x) => (x.productoId === p.id ? { ...x, cantidad: x.cantidad + 1 } : x));
              return [
                ...xs,
                {
                  id: `tmp_${p.id}`,
                  productoId: p.id,
                  nombre: p.nombre,
                  cantidad: 1,
                  precioUnitario: p.precio,
                  unidad: p.unidad,
                  unidadLabel: p.unidadLabel,
                  subtotal: p.precio,
                },
              ];
            });
            setAddId("");
          }}
        >
          Sumar
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {(Object.keys(PAGO_LABEL) as FormaPago[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setForma(k)}
            className={cn("h-9 rounded-md border text-xs font-medium", forma === k ? "border-leaf bg-ok-bg text-leaf" : "border-line bg-paper")}
          >
            {PAGO_LABEL[k]}
          </button>
        ))}
      </div>
      {forma === "efectivo" ? (
        <label className="mt-2 block text-xs font-medium">
          Recibido
          <Input className="mt-1 h-9" inputMode="numeric" value={recibido} onChange={(e) => setRecibido(e.target.value.replace(/[^\d]/g, ""))} />
          <span className="mt-1 block text-muted">
            Vuelto <span className="font-medium text-ink tabular-nums">{money(vuelto)}</span>
          </span>
        </label>
      ) : null}
      {anulando ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <Input placeholder="Motivo de anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" className="flex-1" disabled={!motivo.trim() || anular.isPending} onClick={() => anular.mutate()}>
              OK
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setAnulando(false);
                setMotivo("");
              }}
            >
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" disabled={cobro.isPending || items.length === 0} onClick={() => cobro.mutate()}>
            <Banknote className="size-4" />
            Cobrar
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setAnulando(true)}>
            Anular pedido
          </Button>
        </div>
      )}
    </section>
  );
}

function VentaDirecta({
  productos,
  clientes,
  onDone,
}: {
  productos: Producto[];
  clientes: { id: string; nombre: string }[];
  onDone: (res: { cobroId: string; numero: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [clienteNombre, setClienteNombre] = useState("Mostrador");
  const [forma, setForma] = useState<FormaPago>("efectivo");
  const [recibido, setRecibido] = useState("");
  const filtered = useMemo(() => {
    const n = q.toLowerCase();
    return productos.filter((p) => p.activo && p.nombre.toLowerCase().includes(n)).slice(0, 12);
  }, [productos, q]);
  const lines = Object.entries(cart)
    .map(([id, n]) => {
      const p = productos.find((x) => x.id === id);
      return p && n > 0 ? { p, n } : null;
    })
    .filter(Boolean) as { p: Producto; n: number }[];
  const total = lines.reduce((a, l) => a + l.p.precio * l.n, 0);

  const pay = useMutation({
    mutationFn: async () => {
      const uuid = crypto.randomUUID();
      const pedido = await crearPedido({
        data: {
          clientUuid: uuid,
          clienteNombre,
          items: lines.map((l) => ({ productoId: l.p.id, cantidad: l.n })),
        },
      });
      return cobrarPedido({
        data: {
          pedidoId: pedido.id,
          clientUuid: `cobro-${pedido.id}`,
          formaPago: forma,
          montoRecibido: forma === "efectivo" ? Number(recibido || total) : total,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Ticket Nº ${res.numero}`);
      onDone({ cobroId: res.cobroId, numero: res.numero });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <Input placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {filtered.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2">
              <div>
                <div className="font-medium">{p.nombre}</div>
                <div className="text-sm text-muted">
                  {money(p.precio)} / {p.unidadLabel}
                </div>
              </div>
              <Button size="sm" onClick={() => setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }))}>
                <Plus className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <aside className="rounded-lg border border-line bg-surface p-4">
        <h3 className="font-display text-xl font-semibold">Venta de mostrador</h3>
        <select className="mt-3 h-11 w-full rounded-md border border-line px-3" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)}>
          {clientes.map((c) => (
            <option key={c.id}>{c.nombre}</option>
          ))}
        </select>
        <ul className="mt-3 space-y-2 text-sm">
          {lines.map(({ p, n }) => (
            <li key={p.id} className="flex justify-between">
              <span>
                {n} {p.unidadLabel} {p.nombre}
              </span>
              <span className="tabular-nums">{money(p.precio * n)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 font-display text-2xl tabular-nums">{money(total)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(Object.keys(PAGO_LABEL) as FormaPago[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setForma(k)}
              className={cn("h-10 rounded-md border text-xs font-medium", forma === k ? "border-leaf bg-ok-bg" : "border-line")}
            >
              {PAGO_LABEL[k]}
            </button>
          ))}
        </div>
        {forma === "efectivo" ? <Input className="mt-2" placeholder="Recibido" value={recibido} onChange={(e) => setRecibido(e.target.value)} /> : null}
        <Button className="mt-4 w-full" disabled={lines.length === 0 || pay.isPending} onClick={() => pay.mutate()}>
          Cobrar
        </Button>
      </aside>
    </div>
  );
}

function TrasCobro({
  ticket,
  lista,
  homo,
  onClose,
}: {
  ticket: { cobroId: string; numero: number };
  lista: boolean;
  homo: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ticket", ticket.cobroId],
    queryFn: () => getTicket({ data: ticket.cobroId }),
  });
  const emitir = useMutation({
    mutationFn: () => emitirFactura({ data: { cobroId: ticket.cobroId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["caja"] });
      void qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fiscal = emitir.data;
  const contenido = q.data?.contenido as TicketContenido | null | undefined;
  const numero = contenido?.numero ?? q.data?.numero ?? ticket.numero;
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    const onAfter = () => cerrar.current();
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-4 print:static print:bg-transparent md:place-items-center">
      <div className="w-full max-w-sm rounded-lg bg-surface p-4 shadow-lg print:shadow-none">
        <p className="font-display text-xl font-semibold">Ticket Nº {numero}</p>
        <p className="text-sm text-muted">Imprimí y volvé a la caja. Papel de 80 mm.</p>
        {fiscal?.cae ? (
          <p className="mt-2 text-sm">
            {fiscal.nombre} {fiscal.numero ? numeroFiscal(fiscal.puntoVenta, fiscal.numero) : ""} · CAE {fiscal.cae}
            {fiscal.ambiente === "homo" ? " · sin validez fiscal" : ""}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          <Button
            className="flex-1"
            onClick={() => {
              if (!contenido) return;
              void imprimirEnTermica(contenido)
                .then((mando) => {
                  if (mando) {
                    toast.success("Ticket en la térmica");
                    onClose();
                  } else window.print();
                })
                .catch((e: Error) => {
                  toast.error(e.message);
                  window.print();
                });
            }}
          >
            Imprimir ticket
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Volver
          </Button>
          {lista && !fiscal ? (
            <Button className="w-full" variant="secondary" disabled={emitir.isPending} onClick={() => emitir.mutate()}>
              {emitir.isPending ? "Pidiendo CAE…" : homo ? "Factura de prueba" : "Factura electrónica"}
            </Button>
          ) : null}
          {fiscal ? (
            <Link
              to="/factura/$id"
              params={{ id: fiscal.id }}
              className="inline-flex h-11 w-full items-center justify-center rounded-md border border-line text-sm font-medium"
            >
              Imprimir factura
            </Link>
          ) : null}
          {!lista ? (
            <p className="w-full text-xs text-muted">
              ARCA está inhabilitado. El dueño lo habilita en ARCA.
            </p>
          ) : null}
        </div>
        {contenido ? <TicketSlip c={contenido} /> : <p className="mt-2 text-sm text-muted">Armando el ticket…</p>}
      </div>
    </div>
  );
}
