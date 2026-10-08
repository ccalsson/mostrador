import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { actualizarRemitoItem, confirmarRemito, getRemito, listProductos } from "@/lib/fn";
import { asignarProveedorRemito, listarProveedores } from "@/lib/portal-fn";

export const Route = createFileRoute("/remitos/$id")({ component: RemitoDetalle });

function RemitoDetalle() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const remito = useQuery({ queryKey: ["remito", id], queryFn: () => getRemito({ data: id }) });
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => listProductos() });
  const proveedores = useQuery({ queryKey: ["proveedores"], queryFn: () => listarProveedores() });
  const r = remito.data;

  const save = useMutation({
    mutationFn: (input: { id: string; productoId: string | null; cantidad: number; confirmado: boolean }) =>
      actualizarRemitoItem({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remito", id] }),
  });

  const asignar = useMutation({
    mutationFn: (proveedorId: string) => asignarProveedorRemito({ data: { remitoId: id, proveedorId } }),
    onSuccess: () => {
      toast.success("Proveedor del remito");
      void qc.invalidateQueries({ queryKey: ["remito", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conf = useMutation({
    mutationFn: () => confirmarRemito({ data: id }),
    onSuccess: (res) => {
      toast.success(`Stock ingresado · ${res.lineas} líneas`);
      void qc.invalidateQueries({ queryKey: ["productos"] });
      nav({ to: "/remitos" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (remito.isPending) {
    return (
      <AppShell title="Remito">
        <p className="text-muted">Cargando…</p>
      </AppShell>
    );
  }
  if (!r) {
    return (
      <AppShell title="Remito">
        <p className="text-muted">No encontramos este remito.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Remito · ${r.proveedor ?? "sin proveedor"}`}>
      <p className="mb-3 text-sm text-muted">Revisá el match antes de confirmar. Sin tilde, esa línea no entra al stock.</p>
      <label className="mb-4 block max-w-md text-sm font-medium">
        Proveedor
        <select
          className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
          value={r.proveedor_id ?? ""}
          disabled={r.estado === "confirmado" || asignar.isPending}
          onChange={(e) => {
            if (e.target.value) asignar.mutate(e.target.value);
          }}
        >
          <option value="">Elegir proveedor</option>
          {(proveedores.data ?? [])
            .filter((p) => p.activo)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
        </select>
      </label>
      <div className="overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <div className="hidden bg-paper-2 font-medium text-muted md:grid md:grid-cols-[minmax(0,1fr)_minmax(9rem,1.2fr)_4.5rem_4rem_2.5rem]">
          <div className="px-3 py-2">Original</div>
          <div className="px-3 py-2">Producto</div>
          <div className="px-3 py-2">Cant.</div>
          <div className="px-3 py-2">Match</div>
          <div className="px-2 py-2">OK</div>
        </div>
        {r.items.map((it) => (
          <div
            key={it.id}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 border-t border-line px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(9rem,1.2fr)_4.5rem_4rem_2.5rem] md:gap-0 md:px-0 md:py-0"
          >
            <div className="col-span-3 min-w-0 md:col-span-1 md:px-3 md:py-2">{it.descripcionOriginal}</div>
            <div className="col-span-3 md:col-span-1 md:px-2 md:py-1">
              <select
                className="h-10 w-full min-w-0 rounded-md border border-line bg-surface px-2"
                value={it.productoId ?? ""}
                disabled={r.estado === "confirmado"}
                onChange={(e) =>
                  save.mutate({
                    id: it.id,
                    productoId: e.target.value || null,
                    cantidad: it.cantidad,
                    confirmado: it.confirmado,
                  })
                }
              >
                <option value="">Sin match</option>
                {(productos.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="tabular-nums md:px-3">{it.cantidad}</div>
            <div className="tabular-nums text-muted md:px-3">{Math.round(it.confianza * 100)}%</div>
            <div className="md:px-2">
              <input
                type="checkbox"
                checked={it.confirmado}
                disabled={r.estado === "confirmado"}
                onChange={(e) =>
                  save.mutate({
                    id: it.id,
                    productoId: it.productoId,
                    cantidad: it.cantidad,
                    confirmado: e.target.checked,
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
      {r.estado !== "confirmado" ? (
        <Button className="mt-4" onClick={() => conf.mutate()} disabled={conf.isPending}>
          Confirmar e ingresar stock
        </Button>
      ) : (
        <p className="mt-4 text-sm text-ok">Este remito ya está confirmado.</p>
      )}
    </AppShell>
  );
}
