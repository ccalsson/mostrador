import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarProveedor, listarProveedores, productosDelProveedor } from "@/lib/portal-fn";

export const Route = createFileRoute("/proveedores")({ component: ProveedoresPage });

const VACIO = {
  nombre: "",
  cuit: "",
  telefono: "",
  email: "",
  direccion: "",
  observaciones: "",
  activo: true,
};

function ProveedoresPage() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["proveedores"], queryFn: () => listarProveedores() });
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((p) => p.id === sel) : null;

  return (
    <AppShell title="Proveedores">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm text-muted">Directorio del puesto. Se elige al cargar un remito.</p>
            <Button size="sm" onClick={() => setSel("nuevo")}>
              Nuevo
            </Button>
          </div>
          {lista.error ? <p className="text-sm text-terra">{(lista.error as Error).message}</p> : null}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).length === 0 ? (
              <li className="px-3 py-4 text-muted">Todavía no hay proveedores.</li>
            ) : null}
            {(lista.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSel(p.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.nombre}</span>
                    <span className="block truncate text-xs text-muted">{p.cuit || p.telefono || "Sin datos"}</span>
                  </span>
                  <Badge tone={p.activo ? "ok" : "muted"}>{p.activo ? "Activo" : "Baja"}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {sel === "nuevo" ? (
          <Formulario
            titulo="Alta"
            inicial={VACIO}
            onCancel={() => setSel(null)}
            onSave={async (data) => {
              const res = await guardarProveedor({ data });
              toast.success("Proveedor cargado");
              await qc.invalidateQueries({ queryKey: ["proveedores"] });
              setSel(res.id);
            }}
          />
        ) : null}
        {actual ? (
          <div className="space-y-3">
            <Formulario
              titulo="Ficha"
              inicial={{
                id: actual.id,
                nombre: actual.nombre,
                cuit: actual.cuit ?? "",
                telefono: actual.telefono ?? "",
                email: actual.email ?? "",
                direccion: actual.direccion ?? "",
                observaciones: actual.observaciones ?? "",
                activo: actual.activo,
              }}
              onCancel={() => setSel(null)}
              onSave={async (data) => {
                await guardarProveedor({ data: { ...data, id: actual.id } });
                toast.success("Proveedor guardado");
                await qc.invalidateQueries({ queryKey: ["proveedores"] });
              }}
            />
            <Productos id={actual.id} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function Formulario({
  titulo,
  inicial,
  onSave,
  onCancel,
}: {
  titulo: string;
  inicial: typeof VACIO & { id?: string };
  onSave: (data: typeof VACIO & { id?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [clave, setClave] = useState(inicial.id ?? "nuevo");
  const [busy, setBusy] = useState(false);
  if ((inicial.id ?? "nuevo") !== clave) {
    setClave(inicial.id ?? "nuevo");
    setForm(inicial);
  }
  return (
    <form
      className="rounded-lg border border-line border-t-2 border-t-naranja bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void onSave(form)
          .catch((err: Error) => toast.error(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{titulo}</h2>
        <button type="button" className="text-xs text-muted" onClick={onCancel}>
          Cerrar
        </button>
      </div>
      <Campo label="Nombre" value={form.nombre} onChange={(nombre) => setForm({ ...form, nombre })} />
      <Campo label="CUIT" value={form.cuit} onChange={(cuit) => setForm({ ...form, cuit })} />
      <Campo label="Teléfono" value={form.telefono} onChange={(telefono) => setForm({ ...form, telefono })} />
      <Campo label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
      <Campo label="Dirección" value={form.direccion} onChange={(direccion) => setForm({ ...form, direccion })} />
      <label className="mt-2 block text-sm font-medium">
        Observaciones
        <Input
          className="mt-1"
          value={form.observaciones}
          onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
        />
      </label>
      {inicial.id ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
          Activo
        </label>
      ) : null}
      <Button type="submit" className="mt-3 w-full" disabled={busy}>
        Guardar
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

function Productos({ id }: { id: string }) {
  const nombres = useQuery({
    queryKey: ["proveedor-productos", id],
    queryFn: () => productosDelProveedor({ data: id }),
  });
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h3 className="text-sm font-medium">Productos en sus remitos</h3>
      {(nombres.data ?? []).length === 0 ? (
        <p className="mt-1 text-sm text-muted">Todavía no hay un remito confirmado de este proveedor.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {(nombres.data ?? []).map((nombre) => (
            <li key={nombre}>{nombre}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
