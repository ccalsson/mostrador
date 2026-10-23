import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckSquare, ChevronDown, Copy, Minus, Package, Plus, Search, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calificarCompradorMercado, crearPedido, createCliente, entregarParcial, listClientes, listPedidos, listProductos, marcarEntregado } from "@/lib/fn";
import { enqueuePedido, readQueue, removeQueued } from "@/lib/offline-queue";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { ESTADO_LABEL, type Pedido, type Producto } from "@/lib/types";

export const Route = createFileRoute("/vendedor")({ component: VendedorPage });

function VendedorPage() {
  const qc = useQueryClient();
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => listProductos() });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => listClientes() });
  const pedidos = useQuery({
    queryKey: ["mis-pedidos"],
    queryFn: () => listPedidos({ data: { mine: true } }),
    refetchInterval: 2500,
  });
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [clienteId, setClienteId] = useState<string>("");
  const [clienteNombre, setClienteNombre] = useState("Mostrador");
  const [nota, setNota] = useState("");
  const [tab, setTab] = useState<"catalogo" | "pedidos">("catalogo");
  const [queued, setQueued] = useState(readQueue);
  const [pasando, setPasando] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [deliveryQty, setDeliveryQty] = useState<Record<string, number>>({});
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [entregandoParcial, setEntregandoParcial] = useState<string | null>(null);

  useEffect(() => {
    if (!clienteId && clientes.data?.length) {
      const mostrador = clientes.data.find((c) => c.nombre === "Mostrador") ?? clientes.data[0];
      setClienteId(mostrador.id);
      setClienteNombre(mostrador.nombre);
    }
  }, [clienteId, clientes.data]);

  const opciones = useMemo(() => {
    const todos = clientes.data ?? [];
    return todos.filter((c) => c.activo !== false || c.id === clienteId);
  }, [clientes.data, clienteId]);

  const list = useMemo(() => {
    const all = (productos.data ?? []).filter((p) => p.activo);
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (p) =>
        p.nombre.toLowerCase().includes(needle) ||
        p.alias.some((a) => a.toLowerCase().includes(needle)),
    );
  }, [productos.data, q]);

  const lines = Object.entries(cart)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => {
      const p = productos.data?.find((x) => x.id === id);
      return p ? { p, n } : null;
    })
    .filter(Boolean) as { p: Producto; n: number }[];
  const total = lines.reduce((acc, l) => acc + l.p.precio * l.n, 0);

  function add(id: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  const send = useMutation({
    mutationFn: async () => {
      const payload = {
        clientUuid: crypto.randomUUID(),
        clienteId: clienteId || null,
        clienteNombre: clienteNombre || "Mostrador",
        nota: nota || undefined,
        items: lines.map((l) => ({ productoId: l.p.id, cantidad: l.n })),
      };
      try {
        return await crearPedido({ data: payload });
      } catch (err) {
        enqueuePedido({ ...payload, createdAt: new Date().toISOString() });
        setQueued(readQueue());
        throw err;
      }
    },
    onSuccess: () => {
      setCart({});
      setNota("");
      toast.success("Pedido en caja");
      void qc.invalidateQueries({ queryKey: ["mis-pedidos"] });
    },
    onError: () => {
      if (readQueue().length) toast.message("Sin red: el pedido quedó en cola local.");
    },
  });

  useEffect(() => {
    const flush = async () => {
      if (!navigator.onLine) return;
      for (const item of readQueue()) {
        try {
          await crearPedido({ data: item });
          removeQueued(item.clientUuid);
        } catch {
          break;
        }
      }
      setQueued(readQueue());
      void qc.invalidateQueries({ queryKey: ["mis-pedidos"] });
    };
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    void flush();
    return () => window.removeEventListener("online", onOnline);
  }, [qc]);

  function loadPedido(p: Pedido) {
    const next: Record<string, number> = {};
    for (const it of p.items) next[it.productoId] = it.cantidad;
    setCart(next);
    setClienteNombre(p.clienteNombre);
    setTab("catalogo");
    toast.message("Pedido duplicado en el carrito");
  }

  return (
    <AppShell>
      <h1 className="mt-1 font-display text-[1.65rem] leading-none font-semibold tracking-tight">Vendedor</h1>
      <div className="mb-3 mt-3 flex gap-1 rounded-md bg-paper-2 p-1">
        <button
          className={cn(
            "h-10 flex-1 rounded-[10px] text-sm font-medium",
            tab === "catalogo" ? "bg-surface text-ink shadow-sm" : "text-muted",
          )}
          onClick={() => setTab("catalogo")}
        >
          Catálogo
        </button>
        <button
          className={cn(
            "h-10 flex-1 rounded-[10px] text-sm font-medium",
            tab === "pedidos" ? "bg-surface text-ink shadow-sm" : "text-muted",
          )}
          onClick={() => setTab("pedidos")}
        >
          Mis pedidos
        </button>
      </div>

      {tab === "catalogo" ? (
        <>
          <div className="mb-3 rounded-lg border border-line bg-surface p-2.5">
            <label className="block text-sm font-medium">
              Cliente
              <select
                className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
                value={clienteId}
                onChange={(e) => {
                  const id = e.target.value;
                  setClienteId(id);
                  const c = clientes.data?.find((x) => x.id === id);
                  setClienteNombre(c?.nombre ?? "Mostrador");
                }}
              >
                {opciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <QuickCliente
              onCreate={async (nombre) => {
                const created = await createCliente({ data: { nombre } });
                await clientes.refetch();
                setClienteId(created.id);
                setClienteNombre(created.nombre);
                toast.success(`${created.nombre} quedó cargado`);
              }}
            />
          </div>
          <div className="md:grid md:grid-cols-2 md:items-start md:gap-4">
          <section className={cn("min-w-0 md:pb-0", lines.length ? "pb-[40vh]" : "pb-28")}>
            <div className="sticky top-[5.4rem] z-20 mb-2 bg-paper pb-2 md:top-[4.25rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-10"
                  placeholder="Buscar banana, papa, lechuga…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {list.map((p) => {
                const n = cart[p.id] ?? 0;
                return (
                  <li key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2">
                    {p.fotoUrl ? (
                      <img
                        src={p.fotoUrl}
                        alt={p.nombre}
                        className="h-10 w-10 shrink-0 rounded object-cover"
                        loading="lazy"
                        style={{ maxWidth: 800 }}
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-paper-2 text-xs text-muted">
                        --
                      </div>
                    )}
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => add(p.id, 1)}>
                      <span className="block truncate font-medium leading-tight">{p.nombre}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                        {money(p.precio)} / {p.unidadLabel}
                        {p.stockBajo ? (
                          <Badge tone="terra">
                            <AlertTriangle className="mr-1 size-3" />
                            stock {p.stock}
                          </Badge>
                        ) : (
                          <span className="tabular-nums">
                            {p.stock} {p.unidadLabel}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-9 sm:size-10"
                        onClick={() => add(p.id, -1)}
                        disabled={n === 0}
                        aria-label="Quitar"
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-7 text-center font-medium tabular-nums">{n || ""}</span>
                      <Button size="icon" className="size-9 sm:size-10" onClick={() => add(p.id, 1)} aria-label="Agregar">
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
              {list.length === 0 ? (
                <li className="px-3 py-6 text-sm text-muted">Ningún producto con ese nombre.</li>
              ) : null}
            </ul>
          </section>

          <aside
            className={cn(
              "fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden border-t border-line bg-surface px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(26,22,18,0.06)] md:sticky md:inset-auto md:top-[4.25rem] md:z-auto md:max-h-[calc(100dvh-7.5rem)] md:self-start md:overflow-auto md:rounded-lg md:border md:p-4 md:pb-4 md:shadow-none",
              lines.length ? "max-h-[40vh]" : "max-h-28",
            )}
          >
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Pedido</h2>
              <span className="font-display text-2xl font-semibold tabular-nums">{money(total)}</span>
            </div>
            {lines.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Tocá un producto. El total queda a la vista.</p>
            ) : (
              <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-auto md:max-h-64 md:flex-none">
                {lines.map(({ p, n }) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.nombre}</div>
                      <div className="text-muted tabular-nums">
                        {n} {p.unidadLabel} · {money(p.precio * n)}
                      </div>
                    </div>
                    <button type="button" className="text-muted hover:text-terra" onClick={() => add(p.id, -n)}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={cn("shrink-0", lines.length ? "mt-2" : "mt-3 hidden md:block")}>
              <Input
                className={cn("mb-2", lines.length ? "" : "hidden md:block")}
                placeholder="Nota (opcional)"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
              <Button
                className="mt-2 w-full md:mt-3"
                size="lg"
                disabled={lines.length === 0 || send.isPending}
                onClick={() => send.mutate()}
              >
                <Send className="size-4" />
                Mandar a caja
              </Button>
              {queued.length > 0 ? (
                <p className="mt-2 text-xs text-terra">{queued.length} pedido(s) esperando red.</p>
              ) : null}
            </div>
          </aside>
        </div>
        </>
      ) : (
        <ul className="space-y-2">
          {queued.map((qItem) => (
            <li key={qItem.clientUuid} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{qItem.clienteNombre}</span>
                <Badge tone="terra">En cola local</Badge>
              </div>
            </li>
          ))}
          {(pedidos.data ?? [])
            .filter((p) => p.estado !== "entregado")
            .map((p) => {
              const listo = pasando === p.id;
              const expanded = expandedOrder === p.id;
              const entregando = entregandoParcial === p.id;
              return (
            <li
              key={p.id}
              className={cn("rounded-lg border bg-surface transition-colors", listo ? "border-leaf bg-ok-bg" : "border-line")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <div className="font-medium">{p.clienteNombre}</div>
                  <div className="text-sm text-muted">
                    {p.items.length} ítems · {money(p.total)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={listo || p.estado === "cobrado" ? "ok" : p.estado === "anulado" ? "terra" : "leaf"}>
                    {listo ? "Entregado" : ESTADO_LABEL[p.estado]}
                  </Badge>
                  {p.estado === "cobrado" ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (expanded) {
                            setExpandedOrder(null);
                          } else {
                            setExpandedOrder(p.id);
                            // Initialize defaults: all items checked with full pending qty
                            const next = new Set<string>();
                            const qty: Record<string, number> = {};
                            for (const it of p.items) {
                              const pendiente = it.cantidad - it.cantidadEntregada;
                              if (pendiente > 0) {
                                next.add(it.id);
                                qty[it.id] = pendiente;
                              }
                            }
                            setCheckedItems(next);
                            setDeliveryQty(qty);
                          }
                        }}
                      >
                        <Package className="mr-1 size-3.5" />
                        {expanded ? "Cerrar" : "Entrega"}
                        {expanded ? <ChevronDown className="ml-1 size-3.5 rotate-180" /> : <ChevronDown className="ml-1 size-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        disabled={pasando !== null}
                        onClick={() => {
                          if (pasando) return;
                          setPasando(p.id);
                          window.setTimeout(() => {
                            void marcarEntregado({ data: p.id })
                              .then(() => {
                                toast.success("Pasó a entregados");
                                void qc.invalidateQueries({ queryKey: ["mis-pedidos"] });
                              })
                              .catch((e: Error) => toast.error(e.message))
                              .finally(() => setPasando(null));
                          }, 450);
                        }}
                      >
                        Entregado
                      </Button>
                    </>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => loadPedido(p)}>
                    <Copy className="size-3.5" />
                    Duplicar
                  </Button>
                </div>
              </div>
              {expanded && p.estado === "cobrado" ? (
                <EntregaChecklist
                  pedido={p}
                  checkedItems={checkedItems}
                  deliveryQty={deliveryQty}
                  deliveryNotes={deliveryNotes}
                  onToggleItem={(itemId) => {
                    setCheckedItems((prev) => {
                      const next = new Set(prev);
                      if (next.has(itemId)) {
                        next.delete(itemId);
                        setDeliveryQty((q) => { const n = { ...q }; delete n[itemId]; return n; });
                        setDeliveryNotes((n) => { const m = { ...n }; delete m[itemId]; return m; });
                      } else {
                        next.add(itemId);
                        const it = p.items.find((x) => x.id === itemId);
                        if (it) {
                          const pendiente = it.cantidad - it.cantidadEntregada;
                          setDeliveryQty((q) => ({ ...q, [itemId]: pendiente }));
                        }
                      }
                      return next;
                    });
                  }}
                  onQtyChange={(itemId, qty) => setDeliveryQty((prev) => ({ ...prev, [itemId]: qty }))}
                  onNoteChange={(itemId, nota) => setDeliveryNotes((prev) => ({ ...prev, [itemId]: nota }))}
                  onEntregar={async () => {
                    const items = Array.from(checkedItems)
                      .map((itemId) => {
                        const it = p.items.find((x) => x.id === itemId);
                        if (!it) return null;
                        return {
                          itemId,
                          cantidad: deliveryQty[itemId] ?? (it.cantidad - it.cantidadEntregada),
                          nota: deliveryNotes[itemId]?.trim() || undefined,
                        };
                      })
                      .filter((x): x is { itemId: string; cantidad: number; nota: string | undefined } => x !== null && x.cantidad > 0);
                    if (!items.length) {
                      toast.error("Marcá al menos un ítem con cantidad > 0.");
                      return;
                    }
                    setEntregandoParcial(p.id);
                    try {
                      await entregarParcial({ data: { pedidoId: p.id, items } });
                      toast.success("Entrega registrada");
                      setExpandedOrder(null);
                      void qc.invalidateQueries({ queryKey: ["mis-pedidos"] });
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : "Error al entregar");
                    } finally {
                      setEntregandoParcial(null);
                    }
                  }}
                  entregando={entregando}
                />
              ) : null}
            </li>
              );
            })}
          {(pedidos.data ?? []).some((p) => p.estado === "entregado") ? (
            <li className="pt-2 text-xs font-medium text-ok">Entregados</li>
          ) : null}
          {(pedidos.data ?? [])
            .filter((p) => p.estado === "entregado" && p.id !== pasando)
            .map((p) => {
              const conNota = p.items.filter((it) => it.notaEntrega);
              return (
            <li key={p.id} className="rounded-lg border border-leaf/40 bg-ok-bg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{p.clienteNombre}</div>
                  <div className="text-sm text-ok">
                    Entregado · {p.items.length} ítems · {money(p.total)}
                  </div>
                  {conNota.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {conNota.map((it) => (
                        <div key={it.id} className="text-xs text-muted">
                          <span className="font-medium">{it.nombre}</span>: {it.notaEntrega}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button variant="secondary" size="sm" onClick={() => loadPedido(p)}>
                  <Copy className="size-3.5" />
                  Duplicar
                </Button>
                <span className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((estrella) => (
                    <button
                      key={estrella}
                      type="button"
                      className="h-8 w-8 rounded-md border border-line text-xs"
                      onClick={() => {
                        void calificarCompradorMercado({ data: { pedidoId: p.id, estrellas: estrella, comentario: "" } })
                          .then(() => toast.success("Calificaste al comprador"))
                          .catch((e: Error) => toast.error(e.message));
                      }}
                    >
                      {estrella}
                    </button>
                  ))}
                </span>
              </div>
            </li>
              );
            })}
        </ul>
      )}
    </AppShell>
  );
}

function EntregaChecklist({
  pedido,
  checkedItems,
  deliveryQty,
  deliveryNotes,
  onToggleItem,
  onQtyChange,
  onNoteChange,
  onEntregar,
  entregando,
}: {
  pedido: Pedido;
  checkedItems: Set<string>;
  deliveryQty: Record<string, number>;
  deliveryNotes: Record<string, string>;
  onToggleItem: (itemId: string) => void;
  onQtyChange: (itemId: string, qty: number) => void;
  onNoteChange: (itemId: string, nota: string) => void;
  onEntregar: () => void;
  entregando: boolean;
}) {
  const itemsConPendiente = pedido.items.filter((it) => it.cantidad - it.cantidadEntregada > 0);
  const seleccionados = Array.from(checkedItems).length;

  return (
    <div className="border-t border-line px-4 pt-3 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Checklist de entrega</h3>
        <span className="text-xs text-muted">{seleccionados} de {itemsConPendiente.length} seleccionados</span>
      </div>
      <ul className="space-y-2">
        {pedido.items.map((it) => {
          const pendiente = it.cantidad - it.cantidadEntregada;
          const yaEntregado = it.cantidadEntregada;
          const checked = checkedItems.has(it.id);
          return (
            <li
              key={it.id}
              className={cn(
                "rounded-md border p-2.5 transition-colors",
                checked ? "border-leaf/50 bg-ok-bg/40" : "border-line bg-paper",
                pendiente <= 0 && "opacity-60",
              )}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="mt-0.5 shrink-0 text-leaf"
                  onClick={() => onToggleItem(it.id)}
                  disabled={pendiente <= 0}
                  aria-label={checked ? "Desmarcar" : "Marcar"}
                >
                  {checked
                    ? <CheckSquare className="size-5" />
                    : <Square className="size-5 text-muted" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{it.nombre}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {it.cantidad} {it.unidadLabel}
                    </span>
                  </div>
                  {yaEntregado > 0 ? (
                    <div className="mt-0.5 text-xs text-ok">
                      {yaEntregado} {it.unidadLabel} ya entregado(s)
                    </div>
                  ) : null}
                  {pendiente <= 0 ? (
                    <div className="mt-0.5 text-xs text-ok font-medium">Completo</div>
                  ) : checked ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <span className="text-muted">Entregar:</span>
                        <input
                          type="number"
                          min={0.001}
                          max={pendiente}
                          step={it.unidad === "kg" ? 0.01 : 1}
                          value={deliveryQty[it.id] ?? pendiente}
                          onChange={(e) => onQtyChange(it.id, parseFloat(e.target.value) || 0)}
                          className="h-7 w-16 rounded border border-line bg-surface px-1.5 text-xs tabular-nums"
                        />
                        <span className="text-muted">{it.unidadLabel}</span>
                      </label>
                    </div>
                  ) : null}
                  {checked && pendiente > 0 ? (
                    <input
                      type="text"
                      placeholder="Nota / observación (opcional)"
                      value={deliveryNotes[it.id] ?? ""}
                      onChange={(e) => onNoteChange(it.id, e.target.value)}
                      className="mt-1.5 h-7 w-full rounded border border-line bg-surface px-2 text-xs"
                      maxLength={500}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {seleccionados > 0
            ? `${seleccionados} ítem(s) a entregar`
            : "Marcá los ítems que entregás"}
        </p>
        <Button
          size="sm"
          disabled={seleccionados === 0 || entregando}
          onClick={onEntregar}
        >
          <Package className="mr-1 size-3.5" />
          {entregando ? "Entregando..." : "Entregar seleccionados"}
        </Button>
      </div>
    </div>
  );
}

function QuickCliente({ onCreate }: { onCreate: (nombre: string) => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  return (
    <div className="mt-2 flex gap-2">
      <Input
        placeholder="Alta rápida de cliente"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <Button
        variant="secondary"
        disabled={!nombre.trim()}
        onClick={async () => {
          try {
            await onCreate(nombre.trim());
            setNombre("");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo dar de alta.");
          }
        }}
      >
        Alta
      </Button>
    </div>
  );
}
