import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { editarCalificacionPuesto, reputacionPuesto } from "@/lib/fn";
import { cn } from "@/lib/cn";

type Seccion = "clientes" | "cargadores" | "comentarios" | "editar";

const SECCIONES: { id: Seccion; label: string }[] = [
  { id: "clientes", label: "Clientes" },
  { id: "cargadores", label: "Cargadores" },
  { id: "comentarios", label: "Comentarios" },
  { id: "editar", label: "Editar" },
];

export function ReputacionPuesto({ modo = "chip" }: { modo?: "chip" | "pagina" }) {
  const datos = useQuery({ queryKey: ["reputacion-puesto"], queryFn: () => reputacionPuesto() });
  const [abierto, setAbierto] = useState(modo === "pagina");
  const [seccion, setSeccion] = useState<Seccion>("clientes");
  const promedio = datos.data?.promedio ?? null;
  const cantidad = datos.data?.cantidad ?? 0;

  return (
    <div id="reputacion" className={cn(modo === "chip" ? "relative shrink-0" : "max-w-lg")}>
      <button
        type="button"
        className={cn("flex flex-col items-center gap-1 rounded-md px-1 py-0.5", modo === "pagina" && "items-start")}
        onClick={() => {
          if (modo === "chip") setAbierto((valor) => !valor);
        }}
        aria-expanded={abierto}
      >
        <Estrellas valor={promedio} />
        <span className="text-xs tabular-nums text-muted">
          {datos.isPending ? "…" : promedio == null ? "Sin notas" : promedio.toFixed(1)}
          {cantidad > 0 ? <span className="text-muted"> · {cantidad}</span> : null}
        </span>
      </button>
      {abierto ? (
        <div className={cn("mt-2 rounded-[10px] border border-line bg-surface p-3 shadow-lg", modo === "chip" && "absolute right-0 z-30 w-[min(20rem,calc(100vw-2rem))]")}>
          <div className="flex flex-wrap gap-1">
            {SECCIONES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "h-8 rounded-md px-2 text-xs",
                  seccion === item.id ? "bg-btn text-btn-fg" : "text-muted",
                )}
                onClick={() => setSeccion(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {datos.isError ? <p className="mt-3 text-sm text-terra">{(datos.error as Error).message}</p> : null}
          {seccion === "clientes" ? <Lista filas={datos.data?.recibidas ?? []} vacio="Todavía ningún cliente calificó el puesto." /> : null}
          {seccion === "cargadores" ? (
            <ul className="mt-3 space-y-2 text-sm">
              {(datos.data?.cargadores ?? []).map((item) => (
                <li key={item.nombre} className="flex items-center justify-between gap-2">
                  <span>{item.nombre}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {item.promedio == null ? "Sin notas" : `${item.promedio.toFixed(1)} · ${item.cantidad}`}
                  </span>
                </li>
              ))}
              {(datos.data?.cargadores ?? []).length === 0 ? <li className="text-muted">No hay cargadores en los pedidos de este puesto.</li> : null}
            </ul>
          ) : null}
          {seccion === "comentarios" ? (
            <Lista
              filas={(datos.data?.recibidas ?? []).filter((item) => item.comentario)}
              vacio="No hay comentarios escritos."
            />
          ) : null}
          {seccion === "editar" ? <Editor filas={datos.data?.dadas ?? []} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Lista({
  filas,
  vacio,
}: {
  filas: { id: string; nombre: string; estrellas: number; comentario: string; cuando: string }[];
  vacio: string;
}) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-muted">{vacio}</p>;
  return (
    <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm">
      {filas.map((item) => (
        <li key={item.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{item.nombre}</span>
            <span className="text-[11px] text-muted">{item.cuando}</span>
          </div>
          <Estrellas valor={item.estrellas} />
          {item.comentario ? <p className="text-muted">{item.comentario}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Editor({
  filas,
}: {
  filas: { id: string; nombre: string; estrellas: number; comentario: string; cuando: string }[];
}) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-muted">Todavía no calificaste a un cliente. Eso se hace desde el puesto, al cerrar el pedido.</p>;
  return (
    <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto">
      {filas.map((item) => (
        <Nota key={item.id} item={item} />
      ))}
    </ul>
  );
}

function Nota({ item }: { item: { id: string; nombre: string; estrellas: number; comentario: string } }) {
  const qc = useQueryClient();
  const [estrellas, setEstrellas] = useState(item.estrellas);
  const [comentario, setComentario] = useState(item.comentario);
  const guardar = useMutation({
    mutationFn: () => editarCalificacionPuesto({ data: { id: item.id, estrellas, comentario } }),
    onSuccess: async () => {
      toast.success("Nota actualizada");
      await qc.invalidateQueries({ queryKey: ["reputacion-puesto"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <li className="rounded-md border border-line px-2 py-2">
      <p className="text-sm font-medium">{item.nombre}</p>
      <div className="mt-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={cn("text-sm", estrellas >= n ? "text-ambar" : "text-muted")}
            onClick={() => setEstrellas(n)}
            aria-label={`${n} estrellas`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="mt-2 min-h-16 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm"
        maxLength={500}
        value={comentario}
        onChange={(event) => setComentario(event.target.value)}
      />
      <Button size="sm" className="mt-2" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
        Guardar
      </Button>
    </li>
  );
}

function Estrellas({ valor }: { valor: number | null }) {
  const n = valor ?? 0;
  return (
    <span className="inline-flex gap-px text-ambar" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="size-3.5" fill={n >= i - 0.25 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4">
          <path d="M10 1.8 12.4 7l5.6.5-4.2 3.7 1.3 5.5L10 13.8 4.9 16.7 6.2 11.2 2 7.5 7.6 7 10 1.8z" />
        </svg>
      ))}
    </span>
  );
}
