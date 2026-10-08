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

/** Mercado: si hay un documento publicado sin aceptar, no sigue. No pide la suscripción del puesto. */
export function PuertaLegal({ token, children }: { token: string; children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [estado, setEstado] = useState<"cargando" | "listo" | "pendiente" | "error">("cargando");
  const [pendientes, setPendientes] = useState<PendienteCentral[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await leerPendientes("mercado", token);
      setPendientes(data.pending);
      setEstado(data.pending.length > 0 ? "pendiente" : "listo");
    } catch (err) {
      setEstado("error");
      setError(mensaje(err));
    }
  }, [token]);

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

  async function aceptar(id: string) {
    setOcupado(id);
    setError(null);
    try {
      await aceptarContrato("mercado", id, token);
      await cargar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setOcupado(null);
    }
  }

  if (estado === "cargando") {
    return <p className="text-sm text-muted">Revisando los documentos publicados…</p>;
  }
  if (estado === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-terra">{error}</p>
        <Button onClick={() => void cargar()}>Reintentar</Button>
      </div>
    );
  }
  if (estado === "listo") return children;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Leé el documento y aceptalo para seguir.</p>
      {!online ? <p className="text-sm text-terra">Sin conexión no se puede aceptar.</p> : null}
      {error ? <p className="text-sm text-terra">{error}</p> : null}
      <ul className="space-y-3">
        {pendientes.map((item) => (
          <li key={item.id} className="rounded-md border border-line bg-surface px-3 py-3">
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted">Versión {item.version}</p>
            {item.body ? (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm">{item.body}</pre>
            ) : (
              <p className="mt-2 text-sm text-terra">El servidor no envió el texto. No se puede aceptar.</p>
            )}
            <Button className="mt-3 w-full" disabled={!online || !item.body || ocupado === item.id} onClick={() => void aceptar(item.id)}>
              {ocupado === item.id ? "Aceptando…" : "Aceptar"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
