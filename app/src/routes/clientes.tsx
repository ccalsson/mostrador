import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONDICION_LABEL, esCondicion, type Condicion } from "@/lib/afip-calc";
import { dayLabel, money } from "@/lib/money";
import { anotarPagoCuenta, guardarCliente, listarClientes, movimientosCliente } from "@/lib/portal-fn";

export const Route = createFileRoute("/clientes")({ component: ClientesPage });

function ClientesPage() {
  const lista = useQuery({ queryKey: ["fichas"], queryFn: () => listarClientes(), staleTime: 0 });
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const text = q.trim().toLowerCase();
  const rows = (lista.data ?? []).filter((c) => {
    if (!text) return true;
    return [c.nombre, c.telefono, c.cuit, c.email].some((v) => (v ?? "").toLowerCase().includes(text));
  });

  return (
    <AppShell title="Clientes">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <Input placeholder="Buscar nombre, CUIT o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
          {lista.error ? <p className="mt-2 text-sm text-terra">{(lista.error as Error).message}</p> : null}
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {rows.length === 0 ? (
              <li className="px-3 py-4 text-muted">
                Todavía no hay clientes. Se anotan solos, o el vendedor deja un nombre en el puesto.
              </li>
            ) : null}
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSel(c.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.nombre}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.cuit || "Sin CUIT"}
                      {c.telefono ? ` · ${c.telefono}` : ""}
                      {c.userId ? "" : " · sin acceso"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums">{c.cuentaCorriente ? money(c.saldo) : "—"}</span>
                    <Badge tone={c.activo ? "ok" : "muted"}>{c.activo ? "Activo" : "Baja"}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {sel ? <Editor id={sel} onClose={() => setSel(null)} /> : <p className="text-sm text-muted">Elegí un cliente para ver la ficha.</p>}
      </div>
    </AppShell>
  );
}

function Editor({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["fichas"], queryFn: () => listarClientes(), staleTime: 0 });
  const movs = useQuery({ queryKey: ["cuenta", id], queryFn: () => movimientosCliente({ data: id }), staleTime: 0 });
  const base = (lista.data ?? []).find((c) => c.id === id);
  const inicial = esCondicion(base?.condicionIva ?? "") ? (base?.condicionIva as Condicion) : "consumidor_final";
  const [nombre, setNombre] = useState(base?.nombre ?? "");
  const [telefono, setTelefono] = useState(base?.telefono ?? "");
  const [cuit, setCuit] = useState(base?.cuit ?? "");
  const [direccion, setDireccion] = useState(base?.direccion ?? "");
  const [condicion, setCondicion] = useState<Condicion>(inicial);
  const [cuenta, setCuenta] = useState(Boolean(base?.cuentaCorriente));
  const [activo, setActivo] = useState(base?.activo !== false);
  const [pago, setPago] = useState("");
  const [nota, setNota] = useState("");
  const [visto, setVisto] = useState(id);

  if (base && visto !== id) {
    setVisto(id);
    setNombre(base.nombre);
    setTelefono(base.telefono ?? "");
    setCuit(base.cuit ?? "");
    setDireccion(base.direccion ?? "");
    setCondicion(esCondicion(base.condicionIva) ? base.condicionIva : "consumidor_final");
    setCuenta(base.cuentaCorriente);
    setActivo(base.activo !== false);
    setPago("");
    setNota("");
  }

  const guardar = useMutation({
    mutationFn: () =>
      guardarCliente({
        data: { id, nombre, telefono, cuit, direccion, cuentaCorriente: cuenta, condicionIva: condicion, activo },
      }),
    onSuccess: () => {
      toast.success("Ficha guardada");
      void qc.invalidateQueries({ queryKey: ["fichas"] });
      void qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const anotar = useMutation({
    mutationFn: () => anotarPagoCuenta({ data: { clienteId: id, monto: Number(pago.replace(",", ".")), nota } }),
    onSuccess: () => {
      toast.success("Pago anotado");
      setPago("");
      setNota("");
      void qc.invalidateQueries({ queryKey: ["fichas"] });
      void qc.invalidateQueries({ queryKey: ["cuenta", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!base) return <p className="text-sm text-muted">Cargando ficha…</p>;

  return (
    <div className="space-y-3">
      <form
        className="rounded-lg border border-line border-t-2 border-t-leaf bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Ficha</h2>
          <button type="button" className="text-xs text-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="text-xs text-muted">{base.email ?? "Sin correo"}</p>
        <label className="mt-2 block text-sm font-medium">
          Nombre
          <Input className="mt-1" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label className="mt-2 block text-sm font-medium">
          Teléfono
          <Input className="mt-1" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
        <label className="mt-2 block text-sm font-medium">
          CUIT o DNI
          <Input className="mt-1" value={cuit} onChange={(e) => setCuit(e.target.value)} />
        </label>
        <label className="mt-2 block text-sm font-medium">
          Dirección
          <Input className="mt-1" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </label>
        <label className="mt-2 block text-sm font-medium">
          Condición frente al IVA
          <select
            className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
            value={condicion}
            onChange={(e) => setCondicion(e.target.value as Condicion)}
          >
            {(Object.keys(CONDICION_LABEL) as Condicion[]).map((k) => (
              <option key={k} value={k}>
                {CONDICION_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">Factura A solo si es responsable inscripto y tiene CUIT.</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cuenta} onChange={(e) => setCuenta(e.target.checked)} />
          Cuenta corriente
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo
        </label>
        <Button type="submit" className="mt-3 w-full" disabled={guardar.isPending}>
          Guardar
        </Button>
      </form>
      <section className="rounded-lg border border-line bg-surface p-3">
        <p className="text-xs text-muted">Saldo</p>
        <p className="font-display text-2xl tabular-nums">{base.cuentaCorriente ? money(base.saldo) : "Sin cuenta"}</p>
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
          {(movs.data ?? []).length === 0 ? <li className="text-muted">Sin movimientos.</li> : null}
          {(movs.data ?? []).map((m) => (
            <li key={m.id} className="flex justify-between gap-2">
              <span>
                {m.nota ?? m.tipo}
                <span className="block text-xs text-muted">{dayLabel(m.createdAt)}</span>
              </span>
              <span className="tabular-nums">{money(m.monto, true)}</span>
            </li>
          ))}
        </ul>
        {base.cuentaCorriente ? (
          <form
            className="mt-3 space-y-2 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              anotar.mutate();
            }}
          >
            <Input
              inputMode="decimal"
              placeholder="Pago recibido"
              value={pago}
              onChange={(e) => setPago(e.target.value.replace(/[^\d.,]/g, ""))}
              required
            />
            <Input placeholder="Nota" value={nota} onChange={(e) => setNota(e.target.value)} />
            <Button type="submit" variant="secondary" className="w-full" disabled={anotar.isPending}>
              Anotar pago
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
