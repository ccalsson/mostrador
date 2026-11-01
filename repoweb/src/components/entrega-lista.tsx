import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cerrarEntrega } from "@/lib/fn";
import { qty } from "@/lib/money";
import type { Pedido } from "@/lib/types";

type Linea = { visto: boolean; cantidad: string; nota: string };

export function EntregaLista({
  pedido,
  onClose,
  onDone,
}: {
  pedido: Pedido;
  onClose: () => void;
  onDone: () => void;
}) {
  const [lineas, setLineas] = useState<Record<string, Linea>>(() =>
    Object.fromEntries(
      pedido.items.map((item) => [item.id, { visto: false, cantidad: String(item.cantidad), nota: "" }]),
    ),
  );
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  function editar(id: string, cambio: Partial<Linea>) {
    setLineas((actual) => ({ ...actual, [id]: { ...actual[id], ...cambio } }));
  }

  const diferencias = pedido.items.filter((item) => {
    const linea = lineas[item.id];
    return Number(linea?.cantidad) !== item.cantidad || Boolean(linea?.nota.trim());
  });
  const todosVistos = pedido.items.every((item) => lineas[item.id]?.visto);
  const totalHabilitada = todosVistos && diferencias.length === 0 && !observacion.trim();
  const parcialHabilitada = todosVistos && diferencias.length > 0 && observacion.trim().length > 0;

  async function cerrar(modo: "total" | "parcial") {
    setGuardando(true);
    try {
      await cerrarEntrega({
        data: {
          pedidoId: pedido.id,
          modo,
          observacion,
          lineas: pedido.items.map((item) => ({
            itemId: item.id,
            cantidad: Number(lineas[item.id]?.cantidad),
            observacion: lineas[item.id]?.nota ?? "",
          })),
        },
      });
      toast.success(modo === "parcial" ? "Entregado. El dueño tiene la observación." : "Entrega completa.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cerrar la entrega.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <header className="border-b border-line px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] text-muted">Entregar</p>
          <h2 className="truncate font-display text-lg leading-tight font-semibold sm:text-2xl">{pedido.clienteNombre}</h2>
          <p className="text-xs text-muted">Solo lo que compró. Tildá cada uno.</p>
        </header>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 sm:space-y-2 sm:px-4 sm:py-3">
          {pedido.items.map((item) => {
            const linea = lineas[item.id];
            return (
              <li key={item.id} className="rounded-lg border border-line bg-surface p-2 sm:p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => editar(item.id, { visto: !linea?.visto })}
                  >
                    <span className={`grid size-6 shrink-0 place-items-center rounded-md border text-sm ${linea?.visto ? "border-leaf bg-ok-bg text-ok" : "border-line"}`}>
                      {linea?.visto ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.nombre}</span>
                      <span className="text-xs text-muted">Compró {qty(item.cantidad, item.unidadLabel)}</span>
                    </span>
                  </button>
                  <input
                    className="h-9 w-16 shrink-0 rounded-md border border-line bg-paper px-2 text-sm"
                    inputMode="decimal"
                    aria-label={`Cantidad de ${item.nombre}`}
                    value={linea?.cantidad ?? ""}
                    onChange={(event) => editar(item.id, { cantidad: event.target.value, visto: true })}
                  />
                </div>
                <input
                  className="mt-1.5 h-9 w-full rounded-md border border-line bg-paper px-2 text-xs sm:text-sm"
                  placeholder="Nota de este producto"
                  value={linea?.nota ?? ""}
                  onChange={(event) => editar(item.id, { nota: event.target.value, visto: true })}
                />
              </li>
            );
          })}
        </ul>
        <footer className="space-y-1.5 border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-3">
          <input
            className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm sm:h-11"
            placeholder="Observación, solo si es parcial"
            value={observacion}
            onChange={(event) => setObservacion(event.target.value)}
          />
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="secondary" className="px-1" disabled={guardando} onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" variant="warn" className="px-1" disabled={!parcialHabilitada || guardando} onClick={() => void cerrar("parcial")}>
              Parcial
            </Button>
            <Button size="sm" className="px-1" disabled={!totalHabilitada || guardando} onClick={() => void cerrar("total")}>
              Entrega total
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
