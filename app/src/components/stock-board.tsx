import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listProductos, ordenarProductos, quitarProducto, saveProducto } from "@/lib/fn";
import { cn } from "@/lib/cn";
import type { Producto, Unidad } from "@/lib/types";

const UNIDADES: { label: string; unidad: Unidad }[] = [
  { label: "cajón", unidad: "bulto" },
  { label: "bolsa", unidad: "bulto" },
  { label: "atado", unidad: "bulto" },
  { label: "bulto", unidad: "bulto" },
  { label: "kg", unidad: "kg" },
];

type Tono = "ok" | "mid" | "low" | "out";

function nivel(stock: number, minimo: number): { pct: number; tono: Tono; texto: string } {
  if (stock <= 0) return { pct: 100, tono: "out", texto: "Sin stock" };
  const capacidad = Math.max(minimo, 1) * 4;
  const ratio = stock / capacidad;
  const pct = Math.max(8, Math.min(100, Math.round(ratio * 100)));
  if (ratio > 0.5) return { pct, tono: "ok", texto: "Más de la mitad" };
  if (ratio > 0.25) return { pct, tono: "mid", texto: "Rango medio" };
  return { pct, tono: "low", texto: "Queda poco" };
}

const BARRA: Record<Tono, string> = {
  ok: "bg-leaf",
  mid: "bg-naranja",
  low: "bg-ambar",
  out: "bg-alerta",
};

function cantidadTexto(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

function mover(list: Producto[], fromId: string, toId: string) {
  const next = list.slice();
  const from = next.findIndex((p) => p.id === fromId);
  const to = next.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function StockBoard() {
  const qc = useQueryClient();
  const productos = useQuery({
    queryKey: ["productos"],
    queryFn: () => listProductos(),
  });
  const [buscar, setBuscar] = useState("");
  const [alta, setAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("10");
  const [precio, setPrecio] = useState("");
  const [unidadLabel, setUnidadLabel] = useState("cajón");
  const [quitarId, setQuitarId] = useState<string | null>(null);
  const [orden, setOrden] = useState<Producto[] | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const ordenInicial = useRef<string>("");

  const base = useMemo(() => (productos.data ?? []).filter((p) => p.activo), [productos.data]);

  useEffect(() => {
    if (dragId.current) return;
    setOrden(null);
  }, [productos.data]);

  const lista = orden ?? base;
  const q = buscar.trim().toLowerCase();
  const celdas = q ? lista.filter((p) => p.nombre.toLowerCase().includes(q)) : lista;
  const vacios = base.filter((p) => p.stock <= 0).length;

  const crear = useMutation({
    mutationFn: () => {
      const cant = Number(cantidad.replace(",", "."));
      if (!nombre.trim()) throw new Error("Poné el nombre.");
      if (!Number.isFinite(cant) || cant < 0) throw new Error("La cantidad no es válida.");
      const unidad = UNIDADES.find((u) => u.label === unidadLabel)?.unidad ?? "bulto";
      const minimo = cant > 0 ? Math.max(unidad === "kg" ? 0.5 : 1, cant / 4) : 1;
      return saveProducto({
        data: {
          nombre: nombre.trim(),
          unidad,
          unidadLabel,
          precio: Number(precio.replace(",", ".")) || 0,
          stockMinimo: minimo,
          alias: [],
          activo: true,
          stockInicial: cant,
        },
      });
    },
    onSuccess: () => {
      toast.success("Celda agregada");
      setNombre("");
      setCantidad("10");
      setPrecio("");
      setAlta(false);
      void qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quitar = useMutation({
    mutationFn: (id: string) => quitarProducto({ data: id }),
    onSuccess: () => {
      toast.success("Celda quitada");
      setQuitarId(null);
      void qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarOrden = useMutation({
    mutationFn: (ids: string[]) => ordenarProductos({ data: ids }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["productos"] }),
  });

  function empezarArrastre(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (q) return;
    dragId.current = id;
    ordenInicial.current = lista.map((p) => p.id).join("|");
    setArrastrando(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moverArrastre(event: React.PointerEvent<HTMLButtonElement>) {
    const from = dragId.current;
    if (!from) return;
    const bajo = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-prod]");
    const to = bajo?.getAttribute("data-prod");
    if (!to || to === from) return;
    setOrden((curr) => mover(curr ?? base, from, to));
  }

  function soltarArrastre() {
    const from = dragId.current;
    dragId.current = null;
    setArrastrando(null);
    if (!from) return;
    const ids = (orden ?? base).map((p) => p.id);
    if (ids.join("|") === ordenInicial.current) return;
    guardarOrden.mutate(ids);
  }

  return (
    <section className="mt-4 rounded-lg border border-line border-t-2 border-t-leaf bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Stock</h2>
          <p className="text-xs text-muted">
            {base.length} celdas
            {vacios ? ` · ${vacios} en cero` : ""}
          </p>
        </div>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar producto"
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm outline-none focus:border-leaf sm:max-w-xs"
        />
        <Button size="sm" variant={alta ? "secondary" : "primary"} onClick={() => setAlta((v) => !v)}>
          {alta ? "Cerrar" : "Agregar"}
        </Button>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <Leyenda tono="ok" texto="Más de la mitad" />
        <Leyenda tono="mid" texto="Medio" />
        <Leyenda tono="low" texto="Poco" />
        <Leyenda tono="out" texto="Cero" />
      </ul>

      {alta ? (
        <form
          className="mt-3 grid max-w-3xl gap-2 sm:grid-cols-[1fr_5.5rem_6.5rem_6.5rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Producto" aria-label="Nombre del producto" />
          <Input
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            inputMode="decimal"
            placeholder="Cant."
            aria-label="Cantidad inicial"
          />
          <select
            className="h-11 rounded-md border border-line bg-paper px-2 text-sm"
            value={unidadLabel}
            aria-label="Unidad"
            onChange={(e) => setUnidadLabel(e.target.value)}
          >
            {UNIDADES.map((u) => (
              <option key={u.label} value={u.label}>
                {u.label}
              </option>
            ))}
          </select>
          <Input
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            inputMode="decimal"
            placeholder="Precio"
            aria-label="Precio"
          />
          <Button type="submit" size="sm" disabled={crear.isPending}>
            Sumar celda
          </Button>
        </form>
      ) : null}

      <div className="mt-3 max-h-72 overflow-auto">
        {celdas.length === 0 ? (
          <p className="py-6 text-sm text-muted">No hay productos para mostrar.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
            {celdas.map((p) => {
              const n = nivel(p.stock, p.stockMinimo);
              const confirmando = quitarId === p.id;
              return (
                <li key={p.id} data-prod={p.id}>
                  <article
                    className={cn(
                      "flex h-16 items-stretch gap-1 rounded-md border bg-paper p-1",
                      n.tono === "out" ? "border-alerta/50" : "border-line",
                      arrastrando === p.id && "border-leaf",
                    )}
                    title={`${p.nombre}: ${cantidadTexto(p.stock)} ${p.unidadLabel}. ${n.texto}`}
                  >
                    {q ? null : (
                      <button
                        type="button"
                        aria-label={`Mover ${p.nombre}`}
                        className="flex w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
                        onPointerDown={(event) => empezarArrastre(event, p.id)}
                        onPointerMove={moverArrastre}
                        onPointerUp={soltarArrastre}
                        onPointerCancel={soltarArrastre}
                      >
                        <span className="flex flex-col gap-0.5" aria-hidden>
                          <span className="h-px w-2.5 bg-muted" />
                          <span className="h-px w-2.5 bg-muted" />
                          <span className="h-px w-2.5 bg-muted" />
                        </span>
                      </button>
                    )}
                    <div className="min-w-0 flex-1 py-0.5">
                      <div className="flex items-start gap-1">
                        <p className="min-w-0 flex-1 truncate text-xs font-medium leading-tight">{p.nombre}</p>
                        {confirmando ? (
                          <span className="flex shrink-0 gap-1 text-[10px] leading-none">
                            <button
                              type="button"
                              className="font-medium text-alerta"
                              disabled={quitar.isPending}
                              onClick={() => quitar.mutate(p.id)}
                            >
                              Sí
                            </button>
                            <button type="button" className="text-muted" onClick={() => setQuitarId(null)}>
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="shrink-0 text-sm leading-none text-muted"
                            aria-label={`Quitar ${p.nombre}`}
                            onClick={() => setQuitarId(p.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs tabular-nums leading-none text-ink-soft">
                        {cantidadTexto(p.stock)} {p.unidadLabel}
                      </p>
                    </div>
                    <Medidor pct={n.pct} tono={n.tono} />
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Medidor({ pct, tono }: { pct: number; tono: Tono }) {
  return (
    <div className="relative my-0.5 w-2.5 shrink-0 self-stretch rounded-sm border border-line bg-paper-2" aria-hidden>
      <div className={cn("absolute inset-x-px bottom-px rounded-[1px]", BARRA[tono])} style={{ height: `${pct}%` }} />
      {[0, 25, 50, 75, 100].map((marca) => (
        <span
          key={marca}
          className="absolute left-px z-10 h-px w-1.5 bg-ink/35"
          style={{ bottom: `calc(${marca}% - 1px)` }}
        />
      ))}
    </div>
  );
}

function Leyenda({ tono, texto }: { tono: Tono; texto: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", BARRA[tono])} />
      {texto}
    </li>
  );
}
