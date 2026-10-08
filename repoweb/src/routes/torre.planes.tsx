import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Button } from "@/components/ui/button";
import { listPlans, savePlan } from "@/lib/torre-fn";

export const Route = createFileRoute("/torre/planes")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-planes"], queryFn: () => listPlans() });
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((p) => p.id === sel) : null;
  const inicial = actual
    ? {
        name: actual.name,
        code: actual.code,
        description: actual.description,
        monthlyPrice: String(actual.monthlyPrice),
        setupPrice: String(actual.setupPrice),
        currency: actual.currency,
        periodicity: actual.periodicity,
        status: actual.status,
        features: actual.features,
        limits: actual.limits,
        metadata: actual.metadata,
        validFrom: actual.validFrom,
        validTo: actual.validTo,
      }
    : {
        name: "",
        code: "",
        description: "",
        monthlyPrice: "0",
        setupPrice: "0",
        currency: "USD",
        periodicity: "monthly",
        status: "active",
        features: "[]",
        limits: "{}",
        metadata: "{}",
        validFrom: "",
        validTo: "",
      };
  return (
    <TorreShell title="Planes">
      <p className="mb-3 max-w-2xl text-sm text-muted">Un plan se crea acá, no en el cliente. El precio que paga un puesto ya contratado está en sus líneas. Cambiar este importe no las reescribe.</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Button size="sm" onClick={() => setSel("nuevo")}>Nuevo</Button>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setSel(p.id)}>
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums text-muted">{p.currency} {p.monthlyPrice} / {p.periodicity === "monthly" ? "mes" : p.periodicity}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {sel ? (
          <Forma
            key={actual?.id ?? "nuevo"}
            inicial={inicial}
            onClose={() => setSel(null)}
            onSave={async (data) => {
              await savePlan({
                data: {
                  id: actual?.id,
                  name: data.name,
                  description: data.description,
                  monthlyPrice: Number(data.monthlyPrice) || 0,
                  setupPrice: Number(data.setupPrice) || 0,
                  code: data.code,
                  currency: data.currency,
                  periodicity: data.periodicity,
                  status: data.status,
                  features: data.features,
                  limits: data.limits,
                  metadata: data.metadata,
                  validFrom: data.validFrom,
                  validTo: data.validTo,
                },
              });
              toast.success("Plan guardado");
              await qc.invalidateQueries({ queryKey: ["torre-planes"] });
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
  inicial: {
    name: string;
    code: string;
    description: string;
    monthlyPrice: string;
    setupPrice: string;
    currency: string;
    periodicity: string;
    status: string;
    features: string;
    limits: string;
    metadata: string;
    validFrom: string;
    validTo: string;
  };
  onSave: (data: {
    name: string;
    code: string;
    description: string;
    monthlyPrice: string;
    setupPrice: string;
    currency: string;
    periodicity: string;
    status: string;
    features: string;
    limits: string;
    metadata: string;
    validFrom: string;
    validTo: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [busy, setBusy] = useState(false);
  return (
    <form className="rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); setBusy(true); void onSave(form).catch((err: Error) => toast.error(err.message)).finally(() => setBusy(false)); }}>
      <div className="flex justify-between"><h2 className="font-medium">Ficha</h2><button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button></div>
      <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Código" value={form.code} onChange={(code) => setForm({ ...form, code })} />
      <Field label="Descripción" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <SelectField label="Moneda" value={form.currency} onChange={(currency) => setForm({ ...form, currency })} options={[{ value: "USD", label: "USD" }, { value: "ARS", label: "ARS" }]} />
      <SelectField label="Periodicidad" value={form.periodicity} onChange={(periodicity) => setForm({ ...form, periodicity })} options={[{ value: "monthly", label: "Mensual" }, { value: "yearly", label: "Anual" }, { value: "once", label: "Única" }]} />
      <Field label="Precio mensual" value={form.monthlyPrice} onChange={(monthlyPrice) => setForm({ ...form, monthlyPrice })} type="number" />
      <Field label="Puesta en marcha" value={form.setupPrice} onChange={(setupPrice) => setForm({ ...form, setupPrice })} type="number" />
      <Field label="Vigente desde" value={form.validFrom} onChange={(validFrom) => setForm({ ...form, validFrom })} type="date" />
      <Field label="Vigente hasta" value={form.validTo} onChange={(validTo) => setForm({ ...form, validTo })} type="date" />
      <label className="mt-2 block text-sm font-medium">Funcionalidades JSON
        <textarea className="mt-1 w-full rounded-md border border-line bg-paper p-2 font-mono text-xs" rows={3} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
      </label>
      <label className="mt-2 block text-sm font-medium">Límites JSON
        <textarea className="mt-1 w-full rounded-md border border-line bg-paper p-2 font-mono text-xs" rows={3} value={form.limits} onChange={(e) => setForm({ ...form, limits: e.target.value })} />
      </label>
      <label className="mt-2 block text-sm font-medium">Metadata JSON
        <textarea className="mt-1 w-full rounded-md border border-line bg-paper p-2 font-mono text-xs" rows={3} value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} />
      </label>
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "active", label: "Activo" }, { value: "archived", label: "Archivado" }]} />
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
    </form>
  );
}
