import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aplicarMargen, guardarCosto, precioDesdeCosto, tomarCostosRemito } from "@/lib/costos-fn";
import { listProductos, listRemitos } from "@/lib/fn";
import { money } from "@/lib/money";

export function CostosMercaderia() {
  const qc = useQueryClient();
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => listProductos() });
  const remitos = useQuery({ queryKey: ["remitos"], queryFn: () => listRemitos() });
  const [masivo, setMasivo] = useState("");
  const [fila, setFila] = useState<Record<string, { costo: string; margen: string }>>({});
  const refrescar = () => qc.invalidateQueries({ queryKey: ["productos"] });
  const guardar = useMutation({
    mutationFn: (productoId: string) => {
      const datos = fila[productoId];
      return guardarCosto({ data: { productoId, costo: Number(datos?.costo), margenPct: Number(datos?.margen) } });
    },
    onSuccess: (res) => {
      toast.success(res.publicado ? "Precio actualizado, también en Mercado." : "Precio actualizado.");
      void refrescar();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const todos = useMutation({
    mutationFn: () => aplicarMargen({ data: { margenPct: Number(masivo) } }),
    onSuccess: (res) => {
      toast.success(`${res.actualizados} precios recalculados.${res.sinCosto ? ` ${res.sinCosto} quedaron sin costo.` : ""}`);
      void refrescar();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const tomar = useMutation({
    mutationFn: (id: string) => tomarCostosRemito({ data: id }),
    onSuccess: (res) => {
      toast.success(
        res.conPrecio
          ? `${res.conPrecio} precios salieron del costo más el porcentaje.`
          : "Costos tomados. Falta el porcentaje para calcular el precio.",
      );
      void refrescar();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const activos = (productos.data ?? []).filter((item) => item.activo);
  return (
    <section className="mb-4 rounded-[10px] border border-line bg-surface p-3">
      <h2 className="font-medium">Costo de la mercadería</h2>
      <p className="mt-1 text-sm text-muted">
        El precio de venta es el costo más el porcentaje. Si el producto está publicado, Mercado toma ese precio.
        El porcentaje se puede cambiar en uno o en todos.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          todos.mutate();
        }}
      >
        <input className="h-10 w-28 rounded-md border border-line bg-paper px-3 text-sm" inputMode="decimal" value={masivo} onChange={(event) => setMasivo(event.target.value)} placeholder="% todos" />
        <Button type="submit" disabled={todos.isPending}>Aplicar a todos</Button>
      </form>
      <ul className="mt-3 divide-y divide-line text-sm">
        {activos.map((item) => {
          const edit = fila[item.id];
          const costo = edit ? Number(edit.costo) : item.costo;
          const margen = edit ? Number(edit.margen) : item.margenPct;
          const preview = costo != null && margen != null && costo > 0 && margen >= 0 ? precioDesdeCosto(costo, margen) : null;
          return (
            <li key={item.id} className="grid items-center gap-2 py-2 md:grid-cols-[minmax(0,1.4fr)_7rem_6rem_7rem_auto]">
              <span>
                <span className="block truncate font-medium">{item.nombre}</span>
                <span className="text-xs text-muted">{item.publicadoOnline ? "Publicado" : "Solo en el puesto"} · hoy {money(item.precio)}</span>
              </span>
              <input
                className="h-10 rounded-md border border-line bg-paper px-2 text-sm"
                inputMode="decimal"
                placeholder="Costo"
                value={edit?.costo ?? (item.costo ?? "")}
                onChange={(event) => setFila((actual) => ({ ...actual, [item.id]: { costo: event.target.value, margen: actual[item.id]?.margen ?? String(item.margenPct ?? "") } }))}
              />
              <input
                className="h-10 rounded-md border border-line bg-paper px-2 text-sm"
                inputMode="decimal"
                placeholder="%"
                value={edit?.margen ?? (item.margenPct ?? "")}
                onChange={(event) => setFila((actual) => ({ ...actual, [item.id]: { costo: actual[item.id]?.costo ?? String(item.costo ?? ""), margen: event.target.value } }))}
              />
              <span className="tabular-nums">{preview != null ? money(preview) : "—"}</span>
              <Button size="sm" disabled={guardar.isPending} onClick={() => guardar.mutate(item.id)}>Aplicar</Button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-sm font-medium">Desde una factura</p>
        <p className="mt-1 text-xs text-muted">
          Papel o electrónica: cargala como remito, confirmala, y de acá se toman los precios de referencia. El total entra como mercadería, sin tocar el efectivo de la caja.
        </p>
        <ul className="mt-2 space-y-1">
          {(remitos.data ?? []).filter((item) => item.estado === "confirmado").slice(0, 6).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{item.proveedor || "Sin proveedor"} · {item.created_at.slice(0, 10)}</span>
              <Button size="sm" variant="secondary" disabled={tomar.isPending} onClick={() => tomar.mutate(item.id)}>Tomar costos</Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
