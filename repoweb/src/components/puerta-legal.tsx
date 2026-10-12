import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  CentralClientError,
  aceptarContrato,
  leerPendientes,
  type PendienteCentral,
} from "@/lib/central/cliente";

function mensaje(err: unknown) {
  if (err instanceof CentralClientError) return err.message;
  return err instanceof Error ? err.message : "No se pudo completar.";
}

function frase(item: PendienteCentral) {
  if (item.audience === "privacy") return "Acepto que mis datos se usen para la cuenta, los pedidos y los cobros.";
  return "Acepto las condiciones de uso de esta cuenta.";
}

/** Dos checks, cortos. No entra hasta marcar los dos. El texto largo está, pero no hay que leerlo para seguir. */
export function PuertaLegal({
  modo,
  token,
  children,
}: {
  modo: "mostrador" | "mercado";
  token?: string;
  children: ReactNode;
}) {
  const [online, setOnline] = useState(true);
  const [estado, setEstado] = useState<"cargando" | "listo" | "pendiente" | "error">("cargando");
  const [pendientes, setPendientes] = useState<PendienteCentral[]>([]);
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await leerPendientes(modo, token);
      setPendientes(data.pending);
      setEstado(data.pending.length > 0 ? "pendiente" : "listo");
    } catch (err) {
      setEstado("error");
      setError(mensaje(err));
    }
  }, [modo, token]);

  useEffect(() => {
    const marcar = () => setOnline(navigator.onLine);
    marcar();
    window.addEventListener("online", marcar);
    window.addEventListener("offline", marcar);
    return () => {
      window.removeEventListener("online", marcar);
      window.removeEventListener("offline", marcar);
    };
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function empezar() {
    setOcupado(true);
    setError(null);
    try {
      for (const item of pendientes) {
        await aceptarContrato(modo, item.id, token);
      }
      setMarcas({});
      await cargar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "cargando") return <p className="text-sm text-muted">Revisando condiciones…</p>;
  if (estado === "listo") return children;
  if (estado === "error") {
    return (
      <div className="space-y-3">
        {children}
        <p className="text-sm text-terra">{error}</p>
        <Button onClick={() => void cargar()}>Reintentar</Button>
      </div>
    );
  }

  const listos = pendientes.length > 0 && pendientes.every((item) => marcas[item.id]);

  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-xl font-semibold">Antes de empezar</h2>
      <p className="text-sm text-muted">Dos checks. El texto está ahí si lo querés abrir.</p>
      {!online ? <p className="text-sm text-terra">Sin conexión no se puede aceptar.</p> : null}
      {error ? <p className="text-sm text-terra">{error}</p> : null}
      <ul className="space-y-3">
        {pendientes.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(marcas[item.id])}
                onChange={(event) => setMarcas((prev) => ({ ...prev, [item.id]: event.target.checked }))}
              />
              <span>{frase(item)}</span>
            </label>
            {item.body ? (
              <details className="mt-1 ml-6">
                <summary className="cursor-pointer text-xs text-leaf">{item.title}</summary>
                <p className="mt-1 text-xs text-muted">{item.body}</p>
              </details>
            ) : (
              <p className="mt-1 ml-6 text-xs text-terra">Falta el texto. No se puede aceptar.</p>
            )}
          </li>
        ))}
      </ul>
      <Button className="w-full" disabled={!online || !listos || ocupado || pendientes.some((item) => !item.body)} onClick={() => void empezar()}>
        {ocupado ? "Guardando…" : "Empezar"}
      </Button>
    </div>
  );
}
