import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClientShell } from "@/components/client-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { clock, dayLabel, money } from "@/lib/money";
import {
  catalogoCliente,
  guardarMiFicha,
  miFicha,
  misMovimientos,
  misPedidos,
  pedirComoCliente,
} from "@/lib/portal-fn";
import { ESTADO_LABEL, PAGO_LABEL, type FormaPago } from "@/lib/types";

export const Route = createFileRoute("/portal")({ component: PortalPage });

type Tab = "catalogo" | "pedidos" | "cuenta";

function PortalPage() {
  const [tab, setTab] = useState<Tab>("catalogo");
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const ficha = useQuery({ queryKey: ["mi-ficha"], queryFn: () => miFicha(), staleTime: 30_000 });
  return (
    <ClientShell>
      <div className="mb-3 flex shrink-0 gap-1">
        {(
          [
            ["catalogo", "Catálogo"],
            ["pedidos", "Pedidos"],
            ["cuenta", "Cuenta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-9 rounded-[10px] px-3 text-sm",
              tab === id ? "bg-leaf text-leaf-fg" : "bg-surface text-ink-soft",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "catalogo" ? (
          <Catalogo
            cuenta={Boolean(ficha.data?.cuentaCorriente && ficha.data?.puedeCuentaCorriente)}
            onListo={(id) => {
              setPedidoId(id);
              setTab("pedidos");
            }}
          />
        ) : null}
        {tab === "pedidos" ? <Pedidos abierto={pedidoId} onAbrir={setPedidoId} /> : null}
        {tab === "cuenta" ? (
          <div className="h-full overflow-y-auto">
            <Cuenta />
          </div>
        ) : null}
      </div>
    </ClientShell>
  );
}

function Catalogo({ cuenta, onListo }: { cuenta: boolean; onListo: (id: string) => void }) {
  const qc = useQueryClient();
  const productos = useQuery({
    queryKey: ["catalogo-cliente"],
    queryFn: () => catalogoCliente(),
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [forma, setForma] = useState<FormaPago>("efectivo");
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState<{ nombre: string; data: string } | null>(null);

  const lista = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (productos.data ?? []).filter((p) => !text || p.nombre.toLowerCase().includes(text) || p.alias.some((a) => a.includes(text)));
  }, [productos.data, q]);
  const elegidos = (productos.data ?? []).flatMap((p) => (cart[p.id] ? [{ p, n: cart[p.id] }] : []));
  const total = elegidos.reduce((acc, l) => acc + l.p.precio * l.n, 0);

  const pedir = useMutation({
    mutationFn: () =>
      pedirComoCliente({
        data: {
          items: elegidos.map((l) => ({ productoId: l.p.id, cantidad: l.n })),
          nota,
          formaPago: forma,
          comprobanteNombre: archivo?.nombre,
          comprobanteData: archivo?.data,
        },
      }),
    onSuccess: (pedido) => {
      toast.success("Pedido en caja. El stock quedó comprometido.");
      setCart({});
      setNota("");
      setArchivo(null);
      void qc.invalidateQueries({ queryKey: ["catalogo-cliente"] });
      void qc.invalidateQueries({ queryKey: ["mis-pedidos"] });
      if (pedido?.id) onListo(pedido.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)]">
      <section className="flex min-h-0 flex-1 flex-col">
        <Input className="shrink-0" placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.nombre}</p>
                <p className="text-xs text-muted">
                  {money(p.precio)} / {p.unidadLabel} · {p.stock} en stock
                </p>
              </div>
              <Cantidad n={cart[p.id] ?? 0} max={p.stock} onChange={(n) => setCart((c) => ({ ...c, [p.id]: n }))} />
            </li>
          ))}
        </ul>
      </section>
      <aside className="max-h-[42%] shrink-0 overflow-y-auto rounded-lg border border-line border-t-2 border-t-terra bg-surface p-3 lg:h-full lg:max-h-none lg:min-h-0">
        <h2 className="font-medium">Pedido</h2>
        {elegidos.length === 0 ? <p className="mt-2 text-sm text-muted">Todavía no elegiste.</p> : null}
        <ul className="mt-2 space-y-1 text-sm">
          {elegidos.map(({ p, n }) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>
                {n} {p.unidadLabel} {p.nombre}
              </span>
              <span className="tabular-nums">{money(p.precio * n)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-right font-display text-xl tabular-nums">{money(total)}</p>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {(cuenta
            ? (["efectivo", "transferencia", "tarjeta", "cuenta_corriente"] as FormaPago[])
            : (["efectivo", "transferencia", "tarjeta"] as FormaPago[])
          ).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setForma(k)}
              className={cn("h-9 rounded-md border text-xs", forma === k ? "border-leaf bg-ok-bg" : "border-line")}
            >
              {PAGO_LABEL[k]}
            </button>
          ))}
        </div>
        {forma === "transferencia" ? (
          <label className="mt-2 block text-xs text-muted">
            Comprobante
            <input
              className="mt-1 block w-full text-sm"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 700_000) {
                  toast.error("El archivo tiene que pesar menos de 700 KB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setArchivo({ nombre: file.name, data: String(reader.result) });
                reader.readAsDataURL(file);
              }}
            />
          </label>
        ) : (
          <p className="mt-2 text-xs text-muted">El pago se confirma en el puesto. El stock se reserva ahora.</p>
        )}
        <Input className="mt-2" placeholder="Nota del pedido" value={nota} onChange={(e) => setNota(e.target.value)} />
        <Button className="mt-3 w-full" disabled={elegidos.length === 0 || pedir.isPending} onClick={() => pedir.mutate()}>
          Confirmar pedido
        </Button>
        <p className="mt-2 text-xs text-muted">Después, en Pedidos, le podés escribir al puesto.</p>
      </aside>
    </div>
  );
}

function Cantidad({ n, max, onChange }: { n: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="secondary" className="size-8" onClick={() => onChange(Math.max(0, n - 1))}>
        −
      </Button>
      <span className="w-6 text-center text-sm tabular-nums">{n}</span>
      <Button size="icon" variant="secondary" className="size-8" disabled={n >= max} onClick={() => onChange(n + 1)}>
        +
      </Button>
    </div>
  );
}

function Pedidos({ abierto, onAbrir }: { abierto: string | null; onAbrir: (id: string | null) => void }) {
  const pedidos = useQuery({
    queryKey: ["mis-pedidos"],
    queryFn: () => misPedidos(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const [soloCompras, setSoloCompras] = useState(false);
  const rows = (pedidos.data ?? []).filter((p) => !soloCompras || p.estado === "cobrado" || p.estado === "entregado");
  return (
    <section className="h-full max-w-2xl overflow-y-auto">
      <button type="button" className="mb-2 text-sm text-leaf" onClick={() => setSoloCompras((v) => !v)}>
        {soloCompras ? "Ver todos los pedidos" : "Ver solo compras"}
      </button>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {rows.length === 0 ? <li className="px-3 py-4 text-sm text-muted">No hay pedidos.</li> : null}
        {rows.map((p) => {
          return (
            <li key={p.id}>
              <button type="button" className="flex w-full justify-between gap-2 px-3 py-2 text-left" onClick={() => onAbrir(abierto === p.id ? null : p.id)}>
                <span>
                  <span className="block text-sm font-medium">
                    {ESTADO_LABEL[p.estado]}
                  </span>
                  <span className="text-xs text-muted">
                    {dayLabel(p.createdAt)} {clock(p.createdAt)}
                    {p.formaPago ? ` · ${PAGO_LABEL[p.formaPago]}` : ""}
                  </span>
                </span>
                <span className="tabular-nums">{money(p.total)}</span>
              </button>
              {abierto === p.id ? (
                <div className="space-y-2 bg-paper px-3 py-2">
                  <ul className="space-y-1 text-sm">
                    {p.items.map((it) => (
                      <li key={it.id} className="flex justify-between">
                        <span>
                          {it.cantidad} {it.unidadLabel} {it.nombre}
                        </span>
                        <span>{money(it.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Cuenta() {
  const qc = useQueryClient();
  const ficha = useQuery({ queryKey: ["mi-ficha"], queryFn: () => miFicha(), staleTime: 0 });
  const movs = useQuery({ queryKey: ["mi-cuenta"], queryFn: () => misMovimientos(), staleTime: 0 });
  const c = ficha.data;
  const [form, setForm] = useState<{ nombre: string; telefono: string; cuit: string; direccion: string } | null>(null);
  const actual = form ?? {
    nombre: c?.nombre ?? "",
    telefono: c?.telefono ?? "",
    cuit: c?.cuit ?? "",
    direccion: c?.direccion ?? "",
  };
  const guardar = useMutation({
    mutationFn: () => guardarMiFicha({ data: actual }),
    onSuccess: () => {
      toast.success("Datos guardados");
      void qc.invalidateQueries({ queryKey: ["mi-ficha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!c) return <p className="text-sm text-muted">Cargando…</p>;
  return (
    <div className="grid max-w-3xl gap-3 md:grid-cols-2">
      <section className="rounded-lg border border-line bg-surface p-3">
        <p className="text-xs text-muted">Saldo de cuenta corriente</p>
        <p className="font-display text-2xl tabular-nums">{c.cuentaCorriente ? money(c.saldo) : "Sin cuenta"}</p>
        <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-sm">
          {(movs.data ?? []).map((m) => (
            <li key={m.id} className="flex justify-between gap-2">
              <span>
                {m.nota ?? m.tipo}
                <span className="block text-xs text-muted">{dayLabel(m.createdAt)}</span>
              </span>
              <span className="tabular-nums">{money(m.monto)}</span>
            </li>
          ))}
        </ul>
      </section>
      <form
        className="space-y-2 rounded-lg border border-line bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <h2 className="font-medium">Mis datos</h2>
        <Input value={actual.nombre} onChange={(e) => setForm({ ...actual, nombre: e.target.value })} />
        <Input value={actual.telefono} onChange={(e) => setForm({ ...actual, telefono: e.target.value })} placeholder="Teléfono" />
        <Input value={actual.cuit} onChange={(e) => setForm({ ...actual, cuit: e.target.value })} placeholder="CUIT o DNI" />
        <Input value={actual.direccion} onChange={(e) => setForm({ ...actual, direccion: e.target.value })} placeholder="Dirección" />
        <p className="text-xs text-muted">{c.email}</p>
        <Button type="submit" disabled={guardar.isPending}>
          Guardar
        </Button>
      </form>
    </div>
  );
}
