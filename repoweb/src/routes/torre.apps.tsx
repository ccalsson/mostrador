import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TorreShell, Field, SelectField } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listApps, saveApp } from "@/lib/torre-fn";

export const Route = createFileRoute("/torre/apps")({ component: Page });

const VACIO = { name: "", slug: "", description: "", status: "active", repositoryUrl: "", productionUrl: "", currentVersion: "" };

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-apps"], queryFn: () => listApps() });
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((a) => a.id === sel) : null;
  return (
    <TorreShell title="Aplicaciones">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Button size="sm" onClick={() => setSel("nuevo")}>Nueva</Button>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).map((a) => (
              <li key={a.id}>
                <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setSel(a.id)}>
                  <span>
                    <span className="block font-medium">{a.name}</span>
                    <span className="text-xs text-muted">{a.slug} · {a.currentVersion || "sin versión"}</span>
                  </span>
                  <Badge tone={a.status === "active" ? "ok" : "muted"}>{a.status}</Badge>
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
              await saveApp({ data: actual ? { ...data, id: actual.id } : data });
              toast.success("Aplicación guardada");
              await qc.invalidateQueries({ queryKey: ["torre-apps"] });
              setSel(null);
            }}
          />
        ) : null}
      </div>
    </TorreShell>
  );
}

function Forma({
  inicial,
  onSave,
  onClose,
}: {
  inicial: typeof VACIO;
  onSave: (data: typeof VACIO) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="rounded-lg border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void onSave(form).catch((err: Error) => toast.error(err.message)).finally(() => setBusy(false));
      }}
    >
      <div className="flex justify-between"><h2 className="font-medium">Ficha</h2><button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button></div>
      <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
      <Field label="Descripción" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <Field label="Repositorio" value={form.repositoryUrl} onChange={(repositoryUrl) => setForm({ ...form, repositoryUrl })} />
      <Field label="Producción" value={form.productionUrl} onChange={(productionUrl) => setForm({ ...form, productionUrl })} />
      <Field label="Versión actual" value={form.currentVersion} onChange={(currentVersion) => setForm({ ...form, currentVersion })} />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "active", label: "Activa" }, { value: "paused", label: "Pausada" }, { value: "archived", label: "Archivada" }]} />
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
    </form>
  );
}
