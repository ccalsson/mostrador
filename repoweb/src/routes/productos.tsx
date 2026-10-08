import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajustarStock, canalMercado, guardarCanalMercado, historialProducto, listProductos, resumenVentasProductos, saveProducto } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import type { Producto, Unidad } from "@/lib/types";

export const Route = createFileRoute("/productos")({ component: ProductosPage });

function empty(): Omit<Producto, "id" | "stock" | "stockBajo" | "orden"> {
  return {
    nombre: "",
    unidad: "bulto",
    unidadLabel: "cajón",
    precio: 0,
    stockMinimo: 5,
    alias: [],
    activo: true,
    publicadoOnline: false,
  };
}

function ProductosPage() {
  const qc = useQueryClient();
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => listProductos() });
  const canal = useQuery({ queryKey: ["canal-mercado"], queryFn: () => canalMercado() });
  const ventas = useQuery({ queryKey: ["ventas-productos"], queryFn: () => resumenVentasProductos() });
  const publicarPuesto = useMutation({
    mutationFn: (activo: boolean) => guardarCanalMercado({ data: activo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["canal-mercado"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<(ReturnType<typeof empty> & { id?: string }) | null>(null);
  const [ajuste, setAjuste] = useState<{ id: string; cantidad: string; tipo: "ajuste" | "merma"; motivo: string } | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error("sin datos");
      return saveProducto({
        data: {
          id: edit.id,
          nombre: edit.nombre,
          unidad: edit.unidad,
          unidadLabel: edit.unidadLabel,
          precio: Number(edit.precio),
          stockMinimo: Number(edit.stockMinimo),
          alias: edit.alias,
          activo: edit.activo,
          publicadoOnline: edit.publicadoOnline,
        },
      });
    },
    onSuccess: () => {
      toast.success("Producto guardado");
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stock = useMutation({
    mutationFn: () => {
      if (!ajuste) throw new Error("sin datos");
      return ajustarStock({
        data: {
          productoId: ajuste.id,
          cantidad: Number(ajuste.cantidad),
          tipo: ajuste.tipo,
          motivo: ajuste.motivo,
        },
      });
    },
    onSuccess: () => {
      toast.success("Stock actualizado");
      setAjuste(null);
      void qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (productos.data ?? []).filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()));
  const elegido = rows.find((p) => p.id === sel) ?? (productos.data ?? []).find((p) => p.id === sel) ?? null;
  const historial = useQuery({
    queryKey: ["historial-producto", elegido?.id],
    queryFn: () => historialProducto({ data: elegido!.id }),
    enabled: Boolean(elegido),
  });

  function elegir(id: string) {
    setSel((actual) => (actual === id ? null : id));
  }

  return (
    <AppShell title="Productos">
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-sm" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => setEdit(empty())}>Nuevo producto</Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={canal.data?.activo === true}
            disabled={!canal.data?.presencia}
            onChange={(e) => publicarPuesto.mutate(e.target.checked)}
          />
          Este puesto aparece en Mercado al Toque
        </label>
      </div>
      {canal.data && !canal.data.presencia ? (
        <p className="mb-3 text-sm text-muted">Este puesto no tiene Presencia ni Pro. Publicar no alcanza para aparecer en Mercado.</p>
      ) : null}
      {canal.data?.presencia ? (
        <p className="mb-3 text-sm text-muted">
          Plan: {canal.data.tier === "pro" ? "Pro" : "Presencia"}.
          {canal.data.cuentaCorriente ? " Cuenta corriente habilitada." : " Cuenta corriente no incluida."}
          {canal.data.packs.map((pack) => ` ${pack.product}: ${pack.remaining} envíos.`)}
        </p>
      ) : null}
      <div className="mx-auto grid w-full max-w-6xl items-start gap-4 xl:grid-cols-[minmax(14rem,17rem)_minmax(0,40rem)_minmax(14rem,18rem)]">
        <RankingPanel
          titulo="Más vendidos · 7 días"
          filas={ventas.data?.semana ?? []}
          activo={sel}
          onElegir={elegir}
          className="order-2 xl:order-1"
        />
        <div className="order-1 min-w-0 xl:order-2">
          <div className="overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <div className="hidden bg-paper-2 font-medium text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_9.5rem]">
              <div className="px-3 py-2">Nombre</div>
              <div className="px-3 py-2">Precio</div>
              <div className="px-3 py-2">Stock</div>
              <div className="px-3 py-2" />
            </div>
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-muted">Ningún producto con ese nombre.</p>
            ) : (
              rows.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => elegir(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      elegir(p.id);
                    }
                  }}
                  className={cn(
                    "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-t border-line px-3 py-2 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_9.5rem] sm:px-0 sm:py-0",
                    sel === p.id ? "bg-ok-bg" : "hover:bg-paper",
                  )}
                >
                  <div className="min-w-0 sm:px-3 sm:py-2">
                    <span className="font-medium">{p.nombre}</span>
                    {p.stockBajo ? (
                      <Badge tone="terra" className="ml-2">
                        Bajo
                      </Badge>
                    ) : null}
                    {!p.activo ? <span className="ml-2 text-xs text-muted">Baja</span> : null}
                  </div>
                  <div className="tabular-nums sm:px-3">{money(p.precio)}</div>
                  <div className="col-span-2 text-muted sm:col-span-1 sm:px-3">
                    <span className="tabular-nums text-ink">{p.stock}</span> {p.unidadLabel}
                  </div>
                  <div className="col-span-2 flex justify-end gap-1 pt-1 sm:col-span-1 sm:px-2 sm:py-1.5 sm:pt-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEdit(p);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAjuste({ id: p.id, cantidad: "1", tipo: "ajuste", motivo: "" });
                      }}
                    >
                      Stock
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="order-3 space-y-4">
          <section className="rounded-lg border border-line bg-surface p-3 text-sm">
            <h2 className="font-display text-base font-semibold">
              {elegido ? `Ventas · ${elegido.nombre}` : "Historial"}
            </h2>
            <p className="mt-1 text-xs text-muted">Últimos 7 días, pedidos cobrados o entregados. Tocá un producto.</p>
            {!elegido ? (
              <p className="mt-3 text-muted">Todavía no elegiste ninguno.</p>
            ) : historial.isPending ? (
              <p className="mt-3 text-muted">Cargando…</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {(historial.data?.dias ?? []).map((dia) => (
                  <li key={dia.dia} className="flex items-baseline justify-between gap-2 py-1.5">
                    <span className="text-muted">{dia.dia.slice(8, 10)}/{dia.dia.slice(5, 7)}</span>
                    <span className="tabular-nums">
                      {dia.cantidad} · {money(dia.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <RankingPanel titulo="Más vendidos · 30 días" filas={ventas.data?.mes ?? []} activo={sel} onElegir={elegir} />
        </div>
      </div>

      {edit ? (
        <Modal title={edit.id ? "Editar producto" : "Nuevo producto"} onClose={() => setEdit(null)}>
          <Field label="Nombre" value={edit.nombre} onChange={(v) => setEdit({ ...edit, nombre: v })} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm font-medium">
              Unidad
              <select
                className="mt-1 h-11 w-full rounded-md border border-line px-3"
                value={edit.unidad}
                onChange={(e) => setEdit({ ...edit, unidad: e.target.value as Unidad })}
              >
                <option value="bulto">Bulto</option>
                <option value="kg">Kg</option>
              </select>
            </label>
            <Field label="Etiqueta" value={edit.unidadLabel} onChange={(v) => setEdit({ ...edit, unidadLabel: v })} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Precio" value={String(edit.precio)} onChange={(v) => setEdit({ ...edit, precio: Number(v) || 0 })} />
            <Field
              label="Stock mínimo"
              value={String(edit.stockMinimo)}
              onChange={(v) => setEdit({ ...edit, stockMinimo: Number(v) || 0 })}
            />
          </div>
          <Field
            label="Alias (coma)"
            value={edit.alias.join(", ")}
            onChange={(v) => setEdit({ ...edit, alias: v.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={edit.activo} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} />
            Activo
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(edit.publicadoOnline)}
              disabled={!canal.data?.presencia}
              onChange={(e) => setEdit({ ...edit, publicadoOnline: e.target.checked })}
            />
            Publicado en Mercado al Toque
          </label>
          {!canal.data?.presencia ? <p className="mt-1 text-xs text-muted">Hace falta Presencia o Pro para publicar en Mercado.</p> : null}
          <Button className="mt-4 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            Guardar
          </Button>
        </Modal>
      ) : null}

      {ajuste ? (
        <Modal title="Movimiento de stock" onClose={() => setAjuste(null)}>
          <select
            className="h-11 w-full rounded-md border border-line px-3"
            value={ajuste.tipo}
            onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value as "ajuste" | "merma" })}
          >
            <option value="ajuste">Ajuste (+/-)</option>
            <option value="merma">Merma (resta)</option>
          </select>
          <Field label="Cantidad" value={ajuste.cantidad} onChange={(v) => setAjuste({ ...ajuste, cantidad: v })} />
          <Field label="Motivo" value={ajuste.motivo} onChange={(v) => setAjuste({ ...ajuste, motivo: v })} />
          <Button className="mt-4 w-full" disabled={!ajuste.motivo || stock.isPending} onClick={() => stock.mutate()}>
            Confirmar
          </Button>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function RankingPanel({
  titulo,
  filas,
  activo,
  onElegir,
  className,
}: {
  titulo: string;
  filas: { productoId: string; nombre: string; cantidad: number; total: number }[];
  activo: string | null;
  onElegir: (id: string) => void;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface p-3 text-sm", className)}>
      <h2 className="font-display text-base font-semibold">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="mt-2 text-muted">Sin ventas cobradas en este período.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {filas.map((fila, index) => (
            <li key={fila.productoId}>
              <button
                type="button"
                onClick={() => onElegir(fila.productoId)}
                className={cn("flex w-full items-baseline gap-2 py-2 text-left", activo === fila.productoId && "text-leaf")}
              >
                <span className="w-5 shrink-0 tabular-nums text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{fila.nombre}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {fila.cantidad} · {money(fila.total)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-3 block text-sm font-medium">
      {label}
      <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
