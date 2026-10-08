import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONDICION_LABEL, type Condicion } from "@/lib/afip-calc";
import { guardarCliente, listarClientes } from "@/lib/portal-fn";
import { canalMercado } from "@/lib/fn";
import { money } from "@/lib/money";

export const Route = createFileRoute("/clientes")({ component: ClientesPage });

const CONDICIONES = Object.keys(CONDICION_LABEL) as Condicion[];

type Ficha = Awaited<ReturnType<typeof listarClientes>>[number];

function ClientesPage() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["fichas-clientes"], queryFn: () => listarClientes() });
  const canal = useQuery({ queryKey: ["canal-mercado"], queryFn: () => canalMercado() });
  const [sel, setSel] = useState<string | null>(null);
  const actual = (lista.data ?? []).find((c) => c.id === sel) ?? null;
  const baja = useMutation({
    mutationFn: (ficha: Ficha) =>
      guardarCliente({
        data: {
          id: ficha.id,
          nombre: ficha.nombre,
          telefono: ficha.telefono ?? "",
          cuit: ficha.cuit ?? "",
          direccion: ficha.direccion ?? "",
          cuentaCorriente: ficha.cuentaCorriente,
          condicionIva: ficha.condicionIva,
          activo: !ficha.activo,
        },
      }),
    onSuccess: async (_res, ficha) => {
      toast.success(ficha.activo ? "Cliente eliminado. El historial queda." : "Cliente reactivado.");
      await qc.invalidateQueries({ queryKey: ["fichas-clientes"] });
      await qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function cambiarActivo(ficha: Ficha) {
    const pregunta = ficha.activo
      ? `¿Eliminar a ${ficha.nombre}? Deja de usarse en el puesto. Pedidos y saldo quedan.`
      : `¿Reactivar a ${ficha.nombre}?`;
    if (!window.confirm(pregunta)) return;
    baja.mutate(ficha);
  }

  return (
    <AppShell title="Clientes">
      <div className="mx-auto grid w-full max-w-5xl items-start gap-4 lg:grid-cols-[minmax(0,36rem)_22rem]">
        <section>
          <p className="mb-2 text-sm text-muted">
            Eliminar da de baja al cliente. No borra pedidos ni el saldo de cuenta corriente.
          </p>
          {lista.error ? <p className="text-sm text-terra">{(lista.error as Error).message}</p> : null}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).length === 0 ? (
              <li className="px-3 py-4 text-muted">Todavía no hay clientes.</li>
            ) : null}
            {(lista.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setSel(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.nombre}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.telefono || c.cuit || "Sin teléfono"}
                      {c.cuentaCorriente ? ` · saldo ${money(c.saldo)}` : ""}
                    </span>
                  </span>
                  <Badge tone={c.activo ? "ok" : "muted"}>{c.activo ? "Activo" : "Baja"}</Badge>
                </button>
                <Button
                  variant={c.activo ? "danger" : "secondary"}
                  size="sm"
                  className="shrink-0"
                  disabled={baja.isPending}
                  onClick={() => cambiarActivo(c)}
                >
                  {c.activo ? "Eliminar" : "Reactivar"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
        {actual ? (
          <FichaForm
            ficha={actual}
            permiteCuenta={canal.data?.cuentaCorriente === true}
            ocupado={baja.isPending}
            onClose={() => setSel(null)}
            onEliminar={() => cambiarActivo(actual)}
            onSaved={async () => {
              toast.success("Ficha guardada");
              await qc.invalidateQueries({ queryKey: ["fichas-clientes"] });
              await qc.invalidateQueries({ queryKey: ["clientes"] });
            }}
          />
        ) : (
          <p className="hidden text-sm text-muted lg:block">Elegí un cliente para editar su ficha.</p>
        )}
      </div>
    </AppShell>
  );
}

function FichaForm({
  ficha,
  permiteCuenta,
  ocupado,
  onSaved,
  onClose,
  onEliminar,
}: {
  ficha: Ficha;
  permiteCuenta: boolean;
  ocupado: boolean;
  onSaved: () => Promise<void>;
  onClose: () => void;
  onEliminar: () => void;
}) {
  const [form, setForm] = useState(ficha);
  const [clave, setClave] = useState(ficha.id);
  const [busy, setBusy] = useState(false);
  if (ficha.id !== clave) {
    setClave(ficha.id);
    setForm(ficha);
  }
  return (
    <form
      className="rounded-lg border border-line border-t-2 border-t-naranja bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.nombre.trim()) {
          toast.error("El nombre es obligatorio.");
          return;
        }
        setBusy(true);
        void guardarCliente({
          data: {
            id: ficha.id,
            nombre: form.nombre,
            telefono: form.telefono ?? "",
            cuit: form.cuit ?? "",
            direccion: form.direccion ?? "",
            cuentaCorriente: form.cuentaCorriente,
            condicionIva: form.condicionIva,
            activo: form.activo,
          },
        })
          .then(() => onSaved())
          .catch((err: Error) => toast.error(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Ficha</h2>
        <button type="button" className="text-xs text-muted" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {ficha.email ? <p className="mt-1 text-xs text-muted">Cuenta del portal: {ficha.email}</p> : null}
      <p className="mt-1 text-sm text-muted">
        Saldo {money(ficha.saldo)}
        {form.cuentaCorriente ? "" : " · sin cuenta corriente"}
      </p>
      <Campo label="Nombre" value={form.nombre} onChange={(nombre) => setForm({ ...form, nombre })} />
      <Campo label="Teléfono" value={form.telefono ?? ""} onChange={(telefono) => setForm({ ...form, telefono })} />
      <Campo label="CUIT" value={form.cuit ?? ""} onChange={(cuit) => setForm({ ...form, cuit })} />
      <Campo label="Dirección" value={form.direccion ?? ""} onChange={(direccion) => setForm({ ...form, direccion })} />
      <label className="mt-2 block text-sm font-medium">
        Condición frente al IVA
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          value={form.condicionIva}
          onChange={(e) => setForm({ ...form, condicionIva: e.target.value })}
        >
          {CONDICIONES.map((c) => (
            <option key={c} value={c}>
              {CONDICION_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.cuentaCorriente}
          disabled={!permiteCuenta && !form.cuentaCorriente}
          onChange={(e) => setForm({ ...form, cuentaCorriente: e.target.checked })}
        />
        Cuenta corriente
      </label>
      {!permiteCuenta ? <p className="mt-1 text-xs text-muted">La cuenta corriente está en el plan Pro. Este puesto no lo tiene.</p> : null}
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
        Activo en el puesto
      </label>
      <Button type="submit" className="mt-3 w-full" disabled={busy}>
        Guardar ficha
      </Button>
      <Button type="button" variant={ficha.activo ? "danger" : "secondary"} className="mt-2 w-full" disabled={ocupado} onClick={onEliminar}>
        {ficha.activo ? "Eliminar cliente" : "Reactivar cliente"}
      </Button>
    </form>
  );
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-2 block text-sm font-medium">
      {label}
      <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
