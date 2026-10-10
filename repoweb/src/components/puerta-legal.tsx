import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type DocumentoPendiente = {
  id: string;
  title: string;
  version: number;
  hash: string;
  body: string;
};

class MercadoLegalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function pedirMercado<T>(path: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/mercado/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string; message?: string }) | null;
  if (!response.ok) {
    throw new MercadoLegalError(
      response.status,
      payload?.error ?? "market_api_error",
      payload?.message ?? `La API devolvió el código ${response.status}.`,
    );
  }
  if (!payload)
    throw new MercadoLegalError(502, "invalid_response", "La API devolvió una respuesta vacía.");
  return payload;
}

/** Mercado: si hay un documento publicado sin aceptar, no sigue. No pide la suscripción del puesto. */
export function PuertaLegal({ token, children }: { token: string; children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [estado, setEstado] = useState<"cargando" | "listo" | "pendiente" | "error">("cargando");
  const [pendientes, setPendientes] = useState<DocumentoPendiente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await pedirMercado<{
        documentos: {
          documentoId: string;
          titulo: string;
          versionVigente: number;
          hash: string;
          estado: string;
        }[];
      }>("legal/documentos", token);
      const pendientesPublicados = data.documentos.filter(
        (documento) => documento.estado === "pendiente",
      );
      const detalles = await Promise.all(
        pendientesPublicados.map(async (documento) => {
          const detalle = await pedirMercado<{
            documentoId: string;
            version: number;
            hash: string;
            titulo: string;
            contenido: { valor: string };
          }>(
            `legal/documentos/${encodeURIComponent(documento.documentoId)}?version=${documento.versionVigente}`,
            token,
          );
          return {
            id: detalle.documentoId,
            title: detalle.titulo,
            version: detalle.version,
            hash: detalle.hash,
            body: detalle.contenido.valor,
          };
        }),
      );
      setPendientes(detalles);
      setEstado(detalles.length > 0 ? "pendiente" : "listo");
    } catch (err) {
      if (err instanceof MercadoLegalError && err.status === 404 && err.code === "sin_documentos") {
        setPendientes([]);
        setEstado("listo");
        return;
      }
      setEstado("error");
      setError(err instanceof Error ? err.message : "No se pudo completar.");
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
      const documento = pendientes.find((item) => item.id === id);
      if (!documento)
        throw new Error("El documento ya no está disponible. Volvé a cargar la lista.");
      await pedirMercado(`legal/documentos/${encodeURIComponent(id)}/aceptar`, token, {
        version: documento.version,
        hash: documento.hash,
      });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar.");
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
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm">
                {item.body}
              </pre>
            ) : (
              <p className="mt-2 text-sm text-terra">
                El servidor no envió el texto. No se puede aceptar.
              </p>
            )}
            <Button
              className="mt-3 w-full"
              disabled={!online || !item.body || ocupado === item.id}
              onClick={() => void aceptar(item.id)}
            >
              {ocupado === item.id ? "Aceptando…" : "Aceptar"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
