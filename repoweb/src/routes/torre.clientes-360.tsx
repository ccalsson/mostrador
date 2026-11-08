import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listarClientes360 } from "@/lib/torre/cliente-360-fn";
import { TorreShell } from "@/components/torre-shell";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/money";

export const Route = createFileRoute("/torre/clientes-360")({
  component: Page,
});

function Page() {
  const [busqueda, setBusqueda] = useState("");
  const [appFiltro, setAppFiltro] = useState<string | undefined>();
  const [minLTV, setMinLTV] = useState<number | undefined>();

  const query = useQuery({
    queryKey: ["clientes-360", busqueda, appFiltro, minLTV],
    queryFn: () => listarClientes360({ data: { busqueda, app: appFiltro, minLTV } }),
  });

  return (
    <TorreShell title="Clientes 360°">
      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Buscar por nombre, email o teléfono..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1"
        />
        <select
          value={appFiltro ?? ""}
          onChange={(e) => setAppFiltro(e.target.value || undefined)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="">Todas las apps</option>
          <option value="Mostrador">Mostrador</option>
          <option value="Mercado">Mercado</option>
          <option value="Super">Super al Toque</option>
          <option value="Materiales">Materiales Ya</option>
        </select>
        <Input
          type="number"
          placeholder="LTV mínimo"
          value={minLTV ?? ""}
          onChange={(e) => setMinLTV(e.target.value ? Number(e.target.value) : undefined)}
          className="w-32"
        />
      </div>

      {query.isPending && <p>Cargando clientes...</p>}
      {query.error && <p className="text-terra">{(query.error as Error).message}</p>}

      {query.data && (
        <div className="space-y-2">
          {query.data.map((cliente) => (
            <Link
              key={cliente.id}
              to="/torre/clientes-360/$id"
              params={{ id: cliente.id }}
              className="block rounded-lg border border-line bg-surface p-4 hover:bg-paper-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{cliente.nombre}</h3>
                  <p className="text-sm text-muted">
                    {cliente.email} · {cliente.telefono}
                  </p>
                  <div className="mt-2 flex gap-1">
                    {cliente.apps.map((app) => (
                      <span key={app.nombre} className="rounded bg-paper-2 px-2 py-0.5 text-xs">
                        {app.nombre}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg">{money(cliente.lifetimeValue)}</p>
                  <p className="text-xs text-muted">
                    {cliente.totalCompras} compras · {money(cliente.ticketPromedio)} promedio
                  </p>
                  {cliente.appPreferida && (
                    <p className="text-xs text-leaf">{cliente.appPreferida}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {query.data.length === 0 && (
            <p className="py-8 text-center text-muted">No se encontraron clientes.</p>
          )}
        </div>
      )}
    </TorreShell>
  );
}
