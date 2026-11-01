import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PRECIO_COMPRA_ARS } from "@/lib/mercado/compra-reglas";
import { money } from "@/lib/money";

type LineaLista = {
  texto: string;
  cantidad: number;
  encontrada: boolean;
  tenantId?: string;
  tenantNombre?: string;
  productoId?: string;
  nombre?: string;
  precio?: number;
  unidad?: string;
  unidadLabel?: string;
};

async function pedir<T>(ruta: string, token: string, body?: unknown) {
  const respuesta = await fetch(`/api/mercado/v1/${ruta}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await respuesta.json().catch(() => null)) as { message?: string } & T;
  if (!respuesta.ok) throw new Error(data?.message || "No se pudo completar.");
  return data;
}

export function CompraInteligente({
  token,
  onUsar,
}: {
  token: string;
  onUsar: (lineas: { tenantId: string; tenantNombre: string; productoId: string; nombre: string; cantidad: number; precio: number; unidad: string; unidadLabel: string }[]) => void;
}) {
  const [estado, setEstado] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [lineas, setLineas] = useState<LineaLista[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const data = await pedir<{ estado: string }>("compra", token);
    setEstado(data.estado);
  }

  async function enviarComprobante(archivo: File) {
    if (archivo.size > 700_000) {
      setError("El comprobante tiene que pesar menos de 700 KB.");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => reject(new Error("No se pudo leer el comprobante."));
      lector.readAsDataURL(archivo);
    });
    setOcupado(true);
    setError(null);
    try {
      await pedir("compra/comprobante", token, { nombre: archivo.name, data });
      setAviso("Torre recibe el comprobante y habilita el mes.");
      await cargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo enviar.");
    } finally {
      setOcupado(false);
    }
  }

  async function armar() {
    setOcupado(true);
    setError(null);
    try {
      const data = await pedir<{ lineas: LineaLista[] }>("compra/armar", token, { texto });
      setLineas(data.lineas);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo armar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Compra inteligente</h2>
          <p className="text-sm text-muted">{money(PRECIO_COMPRA_ARS)} por mes. Elige el puesto más barato con stock. Vos confirmás antes de pagar.</p>
        </div>
        {estado == null ? (
          <Button variant="secondary" onClick={() => void cargar().catch((falla: Error) => setError(falla.message))}>Ver</Button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-terra">{error}</p> : null}
      {aviso ? <p className="mt-2 text-sm text-muted">{aviso}</p> : null}
      {estado === "pendiente" ? <p className="mt-2 text-sm text-muted">Esperando que Torre habilite el pago.</p> : null}
      {estado === "sin_alta" || estado === "vencida" ? (
        <label className="mt-3 block text-sm">
          Comprobante de la transferencia
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept="image/*,.pdf"
            disabled={ocupado}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0];
              if (archivo) void enviarComprobante(archivo);
            }}
          />
        </label>
      ) : null}
      {estado === "activa" ? (
        <div className="mt-3 space-y-2">
          <textarea
            className="min-h-24 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
            placeholder={"2 banana\nlechuga"}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
          />
          <Button disabled={ocupado || texto.trim().length < 2} onClick={() => void armar()}>Armar la lista</Button>
          {lineas.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {lineas.map((linea) => (
                <li key={`${linea.texto}-${linea.productoId ?? "no"}`}>
                  {linea.encontrada
                    ? `${linea.cantidad} ${linea.nombre} · ${linea.tenantNombre} · ${money(linea.precio ?? 0)}`
                    : `${linea.texto}: no está publicado con stock`}
                </li>
              ))}
            </ul>
          ) : null}
          {lineas.some((linea) => linea.encontrada) ? (
            <Button
              variant="secondary"
              onClick={() =>
                onUsar(
                  lineas.flatMap((linea) =>
                    linea.encontrada && linea.tenantId && linea.productoId
                      ? [{
                          tenantId: linea.tenantId,
                          tenantNombre: linea.tenantNombre ?? "",
                          productoId: linea.productoId,
                          nombre: linea.nombre ?? linea.texto,
                          cantidad: linea.cantidad,
                          precio: linea.precio ?? 0,
                          unidad: linea.unidad ?? "bulto",
                          unidadLabel: linea.unidadLabel ?? "",
                        }]
                      : [],
                  ),
                )
              }
            >
              Pasar al pedido
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
