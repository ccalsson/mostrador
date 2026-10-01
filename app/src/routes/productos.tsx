import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajustarStock, listProductos, saveProducto } from "@/lib/fn";
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
  };
}

function ProductosPage() {
  const qc = useQueryClient();
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => listProductos() });
  const [q, setQ] = useState("");
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

  return (
    <AppShell title="Productos">
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-sm" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => setEdit(empty())}>Nuevo producto</Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <div className="hidden bg-paper-2 font-medium text-muted md:grid md:grid-cols-[minmax(0,1.5fr)_7rem_8rem_auto]">
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
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,1.5fr)_7rem_8rem_auto] md:px-0 md:py-0"
            >
              <div className="min-w-0 md:px-3 md:py-2">
                <span className="font-medium">{p.nombre}</span>
                {p.stockBajo ? (
                  <Badge tone="terra" className="ml-2">
                    Bajo
                  </Badge>
                ) : null}
              </div>
              <div className="tabular-nums md:px-3">{money(p.precio)}</div>
              <div className="col-span-2 text-muted md:col-span-1 md:px-3">
                <span className="tabular-nums text-ink">{p.stock}</span> {p.unidadLabel}
              </div>
              <div className="col-span-2 flex justify-end gap-1 pt-1 md:col-span-1 md:px-1 md:py-1 md:pt-0">
                <Button variant="ghost" size="sm" onClick={() => setEdit(p)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAjuste({ id: p.id, cantidad: "1", tipo: "ajuste", motivo: "" })}
                >
                  Stock
                </Button>
              </div>
            </div>
          ))
        )}
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
