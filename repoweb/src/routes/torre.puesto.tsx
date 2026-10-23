import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Field, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/money";
import {
  detallePuestoTorre,
  guardarIdentidadTorre,
  paridadPuestos,
  quitarComentarioTorre,
} from "@/lib/torre-fn";

export const Route = createFileRoute("/torre/puesto")({ component: Page });

type Solapa = "identidad" | "reputacion" | "creativos" | "reposicion" | "egresos" | "avisos" | "costos";

const SOLAPAS: { id: Solapa; label: string }[] = [
  { id: "identidad", label: "Identidad" },
  { id: "reputacion", label: "Reputación" },
  { id: "creativos", label: "Creativos" },
  { id: "reposicion", label: "Reposición" },
  { id: "egresos", label: "Egresos" },
  { id: "avisos", label: "Avisos" },
  { id: "costos", label: "Costos" },
];

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-puestos"], queryFn: () => paridadPuestos() });
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [solapa, setSolapa] = useState<Solapa>("identidad");

  const filas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (lista.data ?? []).filter((p) => !needle || `${p.nombre} ${p.bajada} ${p.direccion}`.toLowerCase().includes(needle));
  }, [lista.data, q]);

  return (
    <TorreShell title="Del puesto">
      <div className="mb-3 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar puestos" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  {["Puesto", "Bajada", "Reputación", "Créditos", "Piezas", "Egresos 30d", "Avisos", ""].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-2 py-2 font-medium">{p.nombre}</td>
                    <td className="px-2 py-2 truncate max-w-[120px]">{p.bajada || "—"}</td>
                    <td className="px-2 py-2">
                      {p.reputacion ? (
                        <span className="tabular-nums">{p.reputacion} ★</span>
                      ) : (
                        <span className="text-muted">Sin notas</span>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{p.creditos}</td>
                    <td className="px-2 py-2 tabular-nums">{p.piezas}</td>
                    <td className="px-2 py-2 tabular-nums">{money(p.egresos30d)}</td>
                    <td className="px-2 py-2">
                      {p.avisos > 0 ? <Badge tone="ok">{p.avisos}</Badge> : <span className="text-muted">0</span>}
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" className="text-leaf" onClick={() => { setSel(p.id); setSolapa("identidad"); }}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {sel ? (
          <DetallePuesto
            puestoId={sel}
            solapa={solapa}
            onSolapa={setSolapa}
            onClose={() => setSel(null)}
            onSaved={() => void qc.invalidateQueries({ queryKey: ["torre-puestos"] })}
          />
        ) : null}
      </div>
    </TorreShell>
  );
}

function DetallePuesto({
  puestoId,
  solapa,
  onSolapa,
  onClose,
  onSaved,
}: {
  puestoId: string;
  solapa: Solapa;
  onSolapa: (s: Solapa) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detalle = useQuery({
    queryKey: ["torre-puesto-detalle", puestoId],
    queryFn: () => detallePuestoTorre({ data: { puestoId } }),
  });
  const d = detalle.data;

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex justify-between">
        <h2 className="font-medium">{d?.nombre ?? "Cargando…"}</h2>
        <button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button>
      </div>
      {detalle.error ? <p className="mt-2 text-sm text-terra">{(detalle.error as Error).message}</p> : null}
      {detalle.isPending ? <p className="mt-2 text-sm text-muted">Cargando detalle…</p> : null}
      {d ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1">
            {SOLAPAS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSolapa(s.id)}
                className={s.id === solapa ? "rounded-md bg-paper-2 px-2.5 py-1.5 text-xs font-medium" : "px-2.5 py-1.5 text-xs text-muted"}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {solapa === "identidad" ? <SolapaIdentidad d={d} onSaved={onSaved} /> : null}
            {solapa === "reputacion" ? <SolapaReputacion d={d} onSaved={onSaved} /> : null}
            {solapa === "creativos" ? <SolapaCreativos d={d} /> : null}
            {solapa === "reposicion" ? <SolapaReposicion d={d} /> : null}
            {solapa === "egresos" ? <SolapaEgresos d={d} /> : null}
            {solapa === "avisos" ? <SolapaAvisos d={d} /> : null}
            {solapa === "costos" ? <SolapaCostos d={d} /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SolapaIdentidad({ d, onSaved }: { d: Awaited<ReturnType<typeof detallePuestoTorre>>; onSaved: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(d.nombre);
  const [bajada, setBajada] = useState(d.bajada);
  const [direccion, setDireccion] = useState(d.direccion);
  const [pieTicket, setPieTicket] = useState(d.pieTicket);
  const [busy, setBusy] = useState(false);

  const guardar = useMutation({
    mutationFn: () =>
      guardarIdentidadTorre({ data: { puestoId: d.id, nombre, bajada, direccion, pieTicket } }),
    onMutate: () => setBusy(true),
    onSuccess: () => {
      toast.success("Identidad guardada");
      void qc.invalidateQueries({ queryKey: ["torre-puesto-detalle", d.id] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(false),
  });

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}
    >
      <Field label="Nombre" value={nombre} onChange={setNombre} />
      <Field label="Bajada" value={bajada} onChange={setBajada} />
      <Field label="Dirección" value={direccion} onChange={setDireccion} />
      <Field label="Pie del ticket" value={pieTicket} onChange={setPieTicket} />
      <p className="text-xs text-muted">El QR sale de nombre + dirección.</p>
      <Button type="submit" className="w-full" disabled={busy || !nombre.trim()}>
        Guardar identidad
      </Button>
    </form>
  );
}

function SolapaReputacion({ d, onSaved }: { d: Awaited<ReturnType<typeof detallePuestoTorre>>; onSaved: () => void }) {
  const qc = useQueryClient();
  const quitar = useMutation({
    mutationFn: (notaId: string) => quitarComentarioTorre({ data: { notaId } }),
    onSuccess: () => {
      toast.success("Comentario quitado");
      void qc.invalidateQueries({ queryKey: ["torre-puesto-detalle", d.id] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (d.notas.length === 0) {
    return <p className="text-sm text-muted">Sin notas de compradores.</p>;
  }
  return (
    <ul className="space-y-3">
      {d.notas.map((nota) => (
        <li key={nota.id} className="rounded-md border border-line p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {"★".repeat(nota.estrellas)}{"☆".repeat(5 - nota.estrellas)}
            </span>
            <span className="text-xs text-muted">{nota.creadoAt}</span>
          </div>
          <p className="mt-1 text-sm">{nota.compradorNombre}</p>
          {nota.comentario ? (
            <div className="mt-1 flex items-start justify-between gap-2">
              <p className="text-sm text-muted">{nota.comentario}</p>
              <button
                type="button"
                className="shrink-0 text-xs text-terra"
                onClick={() => quitar.mutate(nota.id)}
                disabled={quitar.isPending}
              >
                Quitar comentario
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted italic">Sin comentario</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function SolapaCreativos({ d }: { d: Awaited<ReturnType<typeof detallePuestoTorre>> }) {
  if (d.piezas.length === 0) {
    return <p className="text-sm text-muted">Sin piezas de marketing.</p>;
  }
  return (
    <ul className="space-y-2">
      {d.piezas.map((p) => (
        <li key={p.id} className="rounded-md border border-line p-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{p.formato}</span>
            <Badge tone={p.estado === "listo" ? "ok" : "muted"}>{p.estado}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">{p.brief}</p>
          <p className="mt-1 text-xs text-muted">{p.createdAt}</p>
        </li>
      ))}
    </ul>
  );
}

function SolapaReposicion({ d }: { d: Awaited<ReturnType<typeof detallePuestoTorre>> }) {
  if (d.reposicion.length === 0) {
    return <p className="text-sm text-muted">Sin datos de reposición. No hay ventas recientes suficientes para calcular.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-2 py-1 font-medium">Producto</th>
            <th className="px-2 py-1 font-medium text-right">Días de reposición</th>
          </tr>
        </thead>
        <tbody>
          {d.reposicion.map((r) => (
            <tr key={r.productoId} className="border-t border-line">
              <td className="px-2 py-1">{r.nombre}</td>
              <td className="px-2 py-1 text-right tabular-nums">{r.dias}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SolapaEgresos({ d }: { d: Awaited<ReturnType<typeof detallePuestoTorre>> }) {
  if (d.egresos.length === 0) {
    return <p className="text-sm text-muted">Sin egresos en los últimos 30 días.</p>;
  }
  const total = d.egresos.reduce((acc, e) => acc + e.monto, 0);
  return (
    <>
      <p className="mb-2 text-sm font-medium">Total: {money(total)}</p>
      <ul className="space-y-2">
        {d.egresos.map((e) => (
          <li key={e.id} className="rounded-md border border-line p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{e.concepto}</span>
              <span className="tabular-nums">{money(e.monto)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{e.categoria} · {e.creadoAt}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function SolapaAvisos({ d }: { d: Awaited<ReturnType<typeof detallePuestoTorre>> }) {
  if (d.avisos.length === 0) {
    return <p className="text-sm text-muted">Sin avisos activos.</p>;
  }
  return (
    <ul className="space-y-2">
      {d.avisos.map((a) => (
        <li key={a.id} className="rounded-md border border-line p-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{a.placement}</span>
            <Badge tone={a.status === "active" ? "ok" : "muted"}>{a.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {a.startsOn} → {a.endsOn}
          </p>
          {a.notes ? <p className="mt-1 text-xs text-muted">{a.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function SolapaCostos({ d }: { d: Awaited<ReturnType<typeof detallePuestoTorre>> }) {
  const conCosto = d.productos.filter((p) => p.costo !== null);
  const sinCosto = d.productos.filter((p) => p.costo === null);
  return (
    <>
      <p className="mb-2 text-sm text-muted">
        {conCosto.length} con costo cargado · {sinCosto.length} sin costo
      </p>
      {sinCosto.length > 0 ? (
        <>
          <h3 className="mt-2 text-sm font-medium">Sin costo cargado</h3>
          <ul className="mt-1 space-y-1">
            {sinCosto.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{p.nombre}</span>
                <span className="shrink-0 tabular-nums text-muted">{money(p.precio)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {conCosto.length > 0 ? (
        <>
          <h3 className="mt-3 text-sm font-medium">Con costo cargado</h3>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-2 py-1 font-medium">Producto</th>
                  <th className="px-2 py-1 font-medium text-right">Precio</th>
                  <th className="px-2 py-1 font-medium text-right">Costo</th>
                  <th className="px-2 py-1 font-medium text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {conCosto.map((p) => {
                  const margen = p.precio - (p.costo ?? 0);
                  return (
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-2 py-1">{p.nombre}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(p.precio)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(p.costo ?? 0)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(margen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
