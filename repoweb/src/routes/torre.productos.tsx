import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listApps } from "@/lib/torre-fn";
import { listProducts, saveProduct } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/productos")({ component: Page });

const VACIO = {
  name: "",
  slug: "",
  description: "",
  kind: "addon",
  appId: "",
  billing: "recurring",
  frequency: "monthly",
  setupUsd: "",
  setupArs: "",
  recurringUsd: "",
  recurringArs: "",
  onceUsd: "",
  onceArs: "",
  unitLabel: "",
  config: "{}",
  status: "active",
};

const TIPOS = [
  { value: "base_product", label: "Producto base" },
  { value: "addon", label: "Add-on" },
  { value: "branch", label: "Sucursal" },
  { value: "subscription", label: "Suscripción" },
  { value: "advertising", label: "Publicidad" },
  { value: "messaging", label: "Mensajería" },
  { value: "commission", label: "Comisión" },
  { value: "free", label: "Sin cargo" },
];
const COBROS = [
  { value: "once", label: "Único" },
  { value: "recurring", label: "Recurrente" },
  { value: "commission", label: "Comisión" },
  { value: "free", label: "Sin cargo" },
];
const FREC = [
  { value: "once", label: "Única" },
  { value: "monthly", label: "Mensual" },
  { value: "yearly", label: "Anual" },
];

function catalogo(p: { setupUsd: number | null; setupArs: number | null; recurringUsd: number | null; recurringArs: number | null; onceUsd: number | null; onceArs: number | null }) {
  const partes = [
    p.setupUsd == null && p.setupArs == null ? "" : `impl. ${[p.setupUsd == null ? "" : `USD ${p.setupUsd}`, p.setupArs == null ? "" : `ARS ${p.setupArs}`].filter(Boolean).join(" / ")}`,
    p.recurringUsd == null && p.recurringArs == null ? "" : `abono ${[p.recurringUsd == null ? "" : `USD ${p.recurringUsd}`, p.recurringArs == null ? "" : `ARS ${p.recurringArs}`].filter(Boolean).join(" / ")}`,
    p.onceUsd == null && p.onceArs == null ? "" : `único ${[p.onceUsd == null ? "" : `USD ${p.onceUsd}`, p.onceArs == null ? "" : `ARS ${p.onceArs}`].filter(Boolean).join(" / ")}`,
  ].filter(Boolean);
  return partes.join(" · ") || "sin precio";
}

function pista(configJson: string) {
  try {
    const cfg = JSON.parse(configJson) as { family?: string; placement?: string; percentMin?: number; percentMax?: number; sends?: number };
    return [cfg.family, cfg.placement, cfg.sends ? `${cfg.sends} envíos` : "", cfg.percentMin != null ? `${cfg.percentMin}–${cfg.percentMax ?? cfg.percentMin}%` : ""].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-productos"], queryFn: () => listProducts() });
  const apps = useQuery({ queryKey: ["torre-apps"], queryFn: () => listApps() });
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((p) => p.id === sel) : null;
  const inicial = actual
    ? {
        name: actual.name,
        slug: actual.slug,
        description: actual.description,
        kind: actual.kind,
        appId: actual.appId,
        billing: actual.billing,
        frequency: actual.frequency,
        setupUsd: actual.setupUsd == null ? "" : String(actual.setupUsd),
        setupArs: actual.setupArs == null ? "" : String(actual.setupArs),
        recurringUsd: actual.recurringUsd == null ? "" : String(actual.recurringUsd),
        recurringArs: actual.recurringArs == null ? "" : String(actual.recurringArs),
        onceUsd: actual.onceUsd == null ? "" : String(actual.onceUsd),
        onceArs: actual.onceArs == null ? "" : String(actual.onceArs),
        unitLabel: actual.unitLabel,
        config: actual.configJson,
        status: actual.status,
      }
    : VACIO;
  return (
    <TorreShell title="Productos">
      <p className="mb-3 text-sm text-muted">Catálogo comercial. Cambiar un precio no reescribe contratos ya firmados.</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <Button size="sm" onClick={() => setSel("nuevo")}>Nuevo</Button>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setSel(p.id)}>
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="text-xs text-muted">{TIPOS.find((t) => t.value === p.kind)?.label ?? p.kind} · {p.slug}{pista(p.configJson) ? ` · ${pista(p.configJson)}` : ""}</span>
                  </span>
                  <span className="text-right text-xs">
                    <span className="block">{catalogo(p)}</span>
                    <Badge tone={p.status === "active" ? "ok" : "muted"}>{p.status}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {sel ? (
          <Forma
            key={actual?.id ?? "nuevo"}
            inicial={inicial}
            apps={[{ value: "", label: "Sin aplicación" }, ...(apps.data ?? []).map((a) => ({ value: a.id, label: a.name }))]}
            onClose={() => setSel(null)}
            onSave={async (data) => {
              await saveProduct({ data: actual ? { ...data, id: actual.id } : data });
              toast.success("Producto guardado");
              await qc.invalidateQueries({ queryKey: ["torre-productos"] });
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
  apps,
  onSave,
  onClose,
}: {
  inicial: typeof VACIO;
  apps: { value: string; label: string }[];
  onSave: (data: typeof VACIO) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof VACIO) => (value: string) => setForm({ ...form, [key]: value });
  return (
    <form className="rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); setBusy(true); void onSave(form).catch((err: Error) => toast.error(err.message)).finally(() => setBusy(false)); }}>
      <div className="flex justify-between"><h2 className="font-medium">Ficha</h2><button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button></div>
      <Field label="Nombre" value={form.name} onChange={set("name")} />
      <Field label="Slug" value={form.slug} onChange={set("slug")} />
      <Field label="Descripción" value={form.description} onChange={set("description")} />
      <SelectField label="Tipo" value={form.kind} onChange={set("kind")} options={TIPOS} />
      <SelectField label="Aplicación" value={form.appId} onChange={set("appId")} options={apps} />
      <SelectField label="Modalidad" value={form.billing} onChange={set("billing")} options={COBROS} />
      <SelectField label="Frecuencia" value={form.frequency} onChange={set("frequency")} options={FREC} />
      <Field label="Implementación USD" value={form.setupUsd} onChange={set("setupUsd")} />
      <Field label="Implementación ARS" value={form.setupArs} onChange={set("setupArs")} />
      <Field label="Recurrente USD" value={form.recurringUsd} onChange={set("recurringUsd")} />
      <Field label="Recurrente ARS" value={form.recurringArs} onChange={set("recurringArs")} />
      <Field label="Único USD" value={form.onceUsd} onChange={set("onceUsd")} />
      <Field label="Único ARS" value={form.onceArs} onChange={set("onceArs")} />
      <Field label="Unidad" value={form.unitLabel} onChange={set("unitLabel")} />
      <Field label="Configuración JSON" value={form.config} onChange={set("config")} />
      <SelectField label="Estado" value={form.status} onChange={set("status")} options={[{ value: "active", label: "Activo" }, { value: "archived", label: "Archivado" }]} />
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
    </form>
  );
}
