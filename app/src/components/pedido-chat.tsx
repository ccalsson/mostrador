import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { clock, dayLabel } from "@/lib/money";
import { useMensajesVivo } from "@/lib/mensajes-en-vivo";
import {
  conversacionesNegocio,
  enviarMensajePedido,
  mensajesDelPedido,
  type Mensaje,
} from "@/lib/mensajes-fn";
import { ESTADO_LABEL } from "@/lib/types";

export function PedidoChat({
  pedidoId,
  titulo,
  lado,
}: {
  pedidoId: string;
  titulo: string;
  lado: "cliente" | "negocio";
}) {
  const qc = useQueryClient();
  const vivo = useMensajesVivo({ tipo: "ver", pedidoId });
  const lista = useQuery({
    queryKey: ["mensajes", pedidoId],
    queryFn: () => mensajesDelPedido({ data: { pedidoId } }),
    refetchInterval: vivo ? false : 4000,
    staleTime: 0,
  });
  const [viejos, setViejos] = useState<Mensaje[]>([]);
  const [hayMasViejos, setHayMasViejos] = useState(false);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const scroller = useRef<HTMLUListElement>(null);
  const marco = useRef(false);

  useEffect(() => {
    setViejos([]);
    setHayMasViejos(false);
    setTexto("");
    marco.current = false;
  }, [pedidoId]);

  useEffect(() => {
    if (!lista.data || marco.current) return;
    marco.current = true;
    void qc.invalidateQueries({ queryKey: lado === "cliente" ? ["mis-sin-leer"] : ["conversaciones"] });
  }, [lista.data, lado, qc]);

  const mensajes = useMemo(() => {
    const map = new Map<string, Mensaje>();
    for (const m of [...viejos, ...(lista.data?.mensajes ?? [])]) map.set(m.id, m);
    return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [viejos, lista.data?.mensajes]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length, pedidoId]);

  const enviar = useMutation({
    mutationFn: () => enviarMensajePedido({ data: { pedidoId, cuerpo: texto } }),
    onSuccess: () => {
      setTexto("");
      void qc.invalidateQueries({ queryKey: ["mensajes", pedidoId] });
      void qc.invalidateQueries({ queryKey: ["conversaciones"] });
      void qc.invalidateQueries({ queryKey: ["mis-sin-leer"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hayMas = viejos.length > 0 ? hayMasViejos : Boolean(lista.data?.hayMas);

  async function anteriores() {
    const primero = mensajes[0];
    if (!primero || cargando) return;
    setCargando(true);
    try {
      const page = await mensajesDelPedido({ data: { pedidoId, antes: primero.createdAt } });
      setViejos((prev) => [...page.mensajes, ...prev]);
      setHayMasViejos(page.hayMas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-line bg-paper">
      <p className="border-b border-line px-2 py-1.5 text-xs font-medium text-ink">{titulo}</p>
      {hayMas ? (
        <button type="button" className="px-2 py-1 text-xs text-leaf" disabled={cargando} onClick={() => void anteriores()}>
          {cargando ? "Cargando…" : "Mensajes anteriores"}
        </button>
      ) : null}
      <ul ref={scroller} className="max-h-56 min-h-24 space-y-1.5 overflow-y-auto px-2 py-2">
        {mensajes.length === 0 ? (
          <li className="text-xs text-muted">
            {lado === "cliente" ? "Escribile al puesto sobre este pedido." : "Todavía no hay mensajes."}
          </li>
        ) : null}
        {mensajes.map((m) => {
          const mio = m.emisor === lado;
          return (
            <li key={m.id} className={cn("max-w-[85%]", mio ? "ml-auto text-right" : "mr-auto")}>
              <p className="text-[10px] text-muted">
                {m.emisor === "cliente" ? "Cliente" : "Puesto"} · {dayLabel(m.createdAt)} {clock(m.createdAt)}
              </p>
              <p
                className={cn(
                  "mt-0.5 inline-block rounded-md px-2 py-1 text-left text-sm",
                  mio ? "bg-ok-bg text-ink" : "border border-line bg-surface",
                )}
              >
                {m.cuerpo}
              </p>
            </li>
          );
        })}
      </ul>
      <form
        className="flex gap-1 border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!texto.trim() || enviar.isPending) return;
          enviar.mutate();
        }}
      >
        <Input
          value={texto}
          maxLength={500}
          placeholder="Mensaje"
          onChange={(e) => setTexto(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!texto.trim() || enviar.isPending}>
          Enviar
        </Button>
      </form>
    </div>
  );
}

export function BandejaMensajes() {
  const vivo = useMensajesVivo({ tipo: "bandeja" });
  const lista = useQuery({
    queryKey: ["conversaciones"],
    queryFn: () => conversacionesNegocio(),
    refetchInterval: vivo ? false : 8000,
    staleTime: 0,
  });
  const [sel, setSel] = useState<string | null>(null);
  const filas = lista.data ?? [];
  const actual = filas.find((c) => c.pedidoId === sel) ?? null;
  const sinLeer = filas.reduce((acc, c) => acc + c.sinLeer, 0);

  return (
    <section className="mt-4 rounded-lg border border-line border-t-2 border-t-ambar bg-surface p-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        Mensajes
        {sinLeer > 0 ? <span className="text-sm font-medium text-terra">{sinLeer} sin leer</span> : null}
      </h2>
      <div className="mt-3 grid items-start gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {filas.length === 0 ? <li className="text-sm text-muted">Cuando un cliente escriba, aparece acá.</li> : null}
          {filas.map((c) => (
            <li key={c.pedidoId}>
              <button
                type="button"
                onClick={() => setSel(c.pedidoId)}
                className={cn(
                  "w-full rounded-md border px-2 py-1.5 text-left",
                  actual?.pedidoId === c.pedidoId ? "border-leaf bg-ok-bg" : "border-line bg-paper",
                  c.sinLeer > 0 && actual?.pedidoId !== c.pedidoId ? "border-terra/40" : "",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{c.clienteNombre}</span>
                  {c.sinLeer > 0 ? <span className="text-xs text-terra">{c.sinLeer}</span> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  {ESTADO_LABEL[c.estado]} · {c.ultimo}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {actual ? (
          <PedidoChat
            pedidoId={actual.pedidoId}
            lado="negocio"
            titulo={`${actual.clienteNombre} · ${ESTADO_LABEL[actual.estado]} · ${dayLabel(actual.pedidoAt)} ${clock(actual.pedidoAt)}`}
          />
        ) : (
          <p className="text-sm text-muted">Elegí un pedido para leer y responder.</p>
        )}
      </div>
    </section>
  );
}
