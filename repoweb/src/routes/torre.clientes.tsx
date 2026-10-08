import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listClients, saveClient } from "@/lib/torre-fn";

export const Route = createFileRoute("/torre/clientes")({ component: Page });

const VACIO = { name: "", businessName: "", contactName: "", phone: "", email: "", notes: "", status: "active" };

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-clientes"], queryFn: () => listClients() });
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((c) => c.id === sel) : null;
  return (
    <TorreShell title="Clientes">
      <p className="mb-3 text-sm text-muted">Clientes de la software house. No son los clientes del puesto.</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Button size="sm" onClick={() => setSel("nuevo")}>Nuevo</Button>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).map((c) => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setSel(c.id)}>
                  <span>
                    <span className="block font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{c.businessName || c.email || "Sin datos"}</span>
                  </span>
                  <Badge tone={c.status === "active" ? "ok" : "muted"}>{c.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {sel === "nuevo" || actual ? (
          <Forma
            key={actual?.id ?? "nuevo"}
            inicial={actual ?? VACIO}
            onClose={() => setSel(null)}
            onSave={async (data) => {
              await saveClient({ data: actual ? { ...data, id: actual.id } : data });
              toast.success("Cliente guardado");
              await qc.invalidateQueries({ queryKey: ["torre-clientes"] });
              setSel(null);
            }}
          />
        ) : null}
      </div>
    </TorreShell>
  );
}

function Forma({ inicial, onSave, onClose }: { inicial: typeof VACIO; onSave: (data: typeof VACIO) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState(inicial);
  const [busy, setBusy] = useState(false);
  return (
    <form className="rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); setBusy(true); void onSave(form).catch((err: Error) => toast.error(err.message)).finally(() => setBusy(false)); }}>
      <div className="flex justify-between"><h2 className="font-medium">Ficha</h2><button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button></div>
      <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Razón social" value={form.businessName} onChange={(businessName) => setForm({ ...form, businessName })} />
      <Field label="Contacto" value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} />
      <Field label="Teléfono" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
      <Field label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
      <Field label="Notas" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "active", label: "Activo" }, { value: "paused", label: "Pausado" }, { value: "archived", label: "Archivado" }]} />
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
    </form>
  );
}
