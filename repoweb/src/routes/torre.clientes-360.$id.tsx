import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { detalleCliente360, type HistorialCompra } from "@/lib/torre/cliente-360-fn";
import { TorreShell } from "@/components/torre-shell";
import { money } from "@/lib/money";

export const Route = createFileRoute("/torre/clientes-360/$id")({
  component: Page,
});

function HistorialSection({ titulo, items }: { titulo: string; items: HistorialCompra[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-4">
      <h4 className="mb-2 text-sm text-muted">{titulo}</h4>
      <div className="space-y-1">
        {items.map((c) => (
          <div
            key={c.id}
            className="flex justify-between rounded border border-line bg-surface p-2 text-sm"
          >
            <span>{String(c.fecha).slice(0, 10)}</span>
            <span>{money(c.monto)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Page() {
  const { id } = Route.useParams();
  const query = useQuery({
    queryKey: ["cliente-360", id],
    queryFn: () => detalleCliente360({ data: id }),
  });

  if (query.isPending) {
    return (
      <TorreShell title="Cargando...">
        <p>Cargando cliente...</p>
      </TorreShell>
    );
  }

  if (query.error) {
    return (
      <TorreShell title="Error">
        <p className="text-terra">{(query.error as Error).message}</p>
      </TorreShell>
    );
  }

  const { cliente, historialMostrador, historialMercado, historialSuper, historialMateriales } =
    query.data;

  return (
    <TorreShell title={cliente.nombre}>
      <div className="mb-4">
        <Link
          to="/torre/clientes-360"
          className="text-sm text-leaf hover:underline"
        >
          ← Volver a Clientes 360°
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-display text-xl">{cliente.nombre}</h2>
        <p className="text-muted">
          {cliente.email} · {cliente.telefono}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Lifetime Value</p>
            <p className="font-display text-2xl">{money(cliente.lifetimeValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Total Compras</p>
            <p className="font-display text-2xl">{cliente.totalCompras}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Ticket Promedio</p>
            <p className="font-display text-2xl">{money(cliente.ticketPromedio)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">App Preferida</p>
            <p className="font-display text-2xl">{cliente.appPreferida ?? "—"}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-1">
          {cliente.apps.map((app) => (
            <span key={app.nombre} className="rounded bg-paper-2 px-2 py-1 text-xs">
              {app.nombre} ({app.estado})
            </span>
          ))}
        </div>
        {cliente.ultimaActividad && (
          <p className="mt-3 text-xs text-muted">
            Última actividad: {String(cliente.ultimaActividad).slice(0, 10)}
          </p>
        )}
      </div>

      <h3 className="mb-2 font-medium">Historial de Compras</h3>

      <HistorialSection titulo="Mostrador" items={historialMostrador} />
      <HistorialSection titulo="Mercado al Toque" items={historialMercado} />
      <HistorialSection titulo="Super al Toque" items={historialSuper} />
      <HistorialSection titulo="Materiales Ya" items={historialMateriales} />

      {historialMostrador.length === 0 &&
        historialMercado.length === 0 &&
        historialSuper.length === 0 &&
        historialMateriales.length === 0 && (
          <p className="py-8 text-center text-muted">Sin historial de compras registrado.</p>
        )}
    </TorreShell>
  );
}
