import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearRemito, listRemitos } from "@/lib/fn";
import { listarProveedores } from "@/lib/portal-fn";
import { dayLabel } from "@/lib/money";
import { FacturacionAfip } from "@/components/facturacion-afip";

export const Route = createFileRoute("/remitos")({ component: FacturarPage });

function FacturarPage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path !== "/remitos") return <Outlet />;
  return (
    <AppShell title="ARCA">
      <FacturacionAfip />
      <Ingreso />
    </AppShell>
  );
}

function Ingreso() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const proveedores = useQuery({ queryKey: ["proveedores"], queryFn: () => listarProveedores() });
  const remitos = useQuery({ queryKey: ["remitos"], queryFn: () => listRemitos() });
  const [proveedorId, setProveedorId] = useState("");
  const [lineas, setLineas] = useState([{ descripcion: "", cantidad: "1" }]);
  const crear = useMutation({
    mutationFn: () =>
      crearRemito({
        data: {
          proveedorId,
          fuente: "manual",
          lineas: lineas
            .filter((l) => l.descripcion.trim() && Number(l.cantidad) > 0)
            .map((l) => ({ descripcion: l.descripcion.trim(), cantidad: Number(l.cantidad) })),
        },
      }),
    onSuccess: (res) => {
      toast.success("Remito cargado. Confirmá el match.");
      void qc.invalidateQueries({ queryKey: ["remitos"] });
      nav({ to: "/remitos/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const activos = (proveedores.data ?? []).filter((p) => p.activo);

  return (
    <section className="mt-4 max-w-xl rounded-lg border border-line border-t-2 border-t-naranja bg-surface p-4">
      <h2 className="font-display text-lg font-semibold">Ingreso de mercadería</h2>
      <p className="mt-1 text-sm text-muted">Elegí el proveedor y las líneas. No es una compra: solo entra stock.</p>
      <label className="mt-3 block text-sm font-medium">
        Proveedor
        <select
          className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
          value={proveedorId}
          onChange={(e) => setProveedorId(e.target.value)}
        >
          <option value="">Elegir…</option>
          {activos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      {activos.length === 0 ? <p className="mt-1 text-xs text-muted">El dueño carga el directorio en Proveedores.</p> : null}
      <div className="mt-3 space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="Producto del papel"
              value={l.descripcion}
              onChange={(e) => setLineas((xs) => xs.map((x, n) => (n === i ? { ...x, descripcion: e.target.value } : x)))}
            />
            <Input
              className="w-24"
              inputMode="decimal"
              value={l.cantidad}
              onChange={(e) => setLineas((xs) => xs.map((x, n) => (n === i ? { ...x, cantidad: e.target.value } : x)))}
            />
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 text-sm text-leaf" onClick={() => setLineas((xs) => [...xs, { descripcion: "", cantidad: "1" }])}>
        Otra línea
      </button>
      <Button className="mt-3" disabled={!proveedorId || crear.isPending} onClick={() => crear.mutate()}>
        Cargar remito
      </Button>
      <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
        {(remitos.data ?? []).slice(0, 8).map((r) => (
          <li key={r.id}>
            <Link to="/remitos/$id" params={{ id: r.id }} className="flex justify-between gap-2 py-2">
              <span className="truncate">{r.proveedor ?? "Sin proveedor"}</span>
              <span className="shrink-0 text-xs text-muted">
                {r.estado} · {dayLabel(r.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
