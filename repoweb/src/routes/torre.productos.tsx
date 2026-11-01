import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listApps } from "@/lib/torre-fn";
import { listProducts, saveProduct, leerMedioPago } from "@/lib/torre/control-fn";
import { textoArs } from "@/lib/torre/reglas";

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

function catalogo(
  p: { setupUsd: number | null; recurringUsd: number | null; onceUsd: number | null },
  venta: number | null,
) {
  const par = (titulo: string, usd: number | null) => {
    if (usd == null) return "";
    const pesos = textoArs(usd, venta);
    return `${titulo} USD ${usd}${pesos ? ` · ${pesos}` : ""}`;
  };
  const partes = [par("impl.", p.setupUsd), par("abono", p.recurringUsd), par("único", p.onceUsd)].filter(Boolean);
  return partes.join(" · ") || "sin precio";
}

function pista(configJson: string) {
  try {
    const cfg = JSON.parse(configJson) as Record<string, unknown>;
    return [
      cfg.family,
      cfg.tier,
      cfg.placement,
      cfg.sends ? `${cfg.sends} envíos` : "",
      cfg.credits ? `${cfg.credits} créditos` : "",
      cfg.days ? `${cfg.days} días` : "",
      cfg.percentMin != null ? `${cfg.percentMin}–${cfg.percentMax ?? cfg.percentMin}%` : "",
    ].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-productos"], queryFn: () => listProducts() });
  const cambio = useQuery({ queryKey: ["torre-medio"], queryFn: () => leerMedioPago() });
  const venta = cambio.data?.dolar?.venta ?? null;
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
      <p className="mb-3 text-sm text-muted">
        Catálogo en dólares. El peso sale del mismo oficial que ve el mostrador
        {cambio.data?.dolar ? ` (${cambio.data.dolar.source} ${cambio.data.dolar.venta}).` : ". Sin cotización, no se convierte."}
        {" "}Cambiar un precio no reescribe contratos ya firmados.
      </p>
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
                    <span className="block">{catalogo(p, venta)}</span>
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
      <ConfigClicks kind={form.kind} value={form.config} onChange={set("config")} />
      <SelectField label="Estado" value={form.status} onChange={set("status")} options={[{ value: "active", label: "Activo" }, { value: "archived", label: "Archivado" }]} />
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
    </form>
  );
}

const CLAVES = ["family", "tier", "plan", "placement", "replaces", "billedAs", "sends", "credits", "days", "includedBranches", "extraBranches", "percentMin", "percentMax"] as const;
const TEXTO = new Set(["family", "tier", "plan", "placement", "replaces", "billedAs"]);

function partirConfig(raw: string) {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
  } catch {
    obj = {};
  }
  const campos: Record<string, string> = {};
  for (const clave of CLAVES) campos[clave] = obj[clave] == null ? "" : String(obj[clave]);
  const extras: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(obj)) {
    if (!(CLAVES as readonly string[]).includes(clave)) extras[clave] = valor;
  }
  return { campos, extras };
}

function juntarConfig(campos: Record<string, string>, extras: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...extras };
  for (const clave of CLAVES) {
    const valor = campos[clave]?.trim() ?? "";
    if (!valor) continue;
    if (TEXTO.has(clave)) out[clave] = valor;
    else if (Number.isFinite(Number(valor))) out[clave] = Number(valor);
  }
  return JSON.stringify(out);
}

function conActual(opciones: { value: string; label: string }[], actual: string) {
  if (!actual || opciones.some((item) => item.value === actual)) return opciones;
  return [...opciones, { value: actual, label: actual }];
}

function ConfigClicks({ kind, value, onChange }: { kind: string; value: string; onChange: (value: string) => void }) {
  const { campos, extras } = partirConfig(value);
  const set = (clave: string, valor: string) => onChange(juntarConfig({ ...campos, [clave]: valor }, extras));
  const ver = (claves: string[], kinds: string[]) => kinds.includes(kind) || claves.some((clave) => campos[clave]);
  const familias = conActual(
    [
      { value: "", label: "Sin familia" },
      { value: "mostrador", label: "Mostrador" },
      { value: "mercado", label: "Mercado" },
      { value: "ads", label: "Publicidad" },
      { value: "messaging", label: "Mensajería" },
      { value: "creativos", label: "Créditos" },
      { value: "commission", label: "Comisión" },
      { value: "servicio", label: "Servicio" },
      { value: "free", label: "Sin cargo" },
    ],
    campos.family,
  );
  return (
    <div className="mt-3 space-y-1 border-t border-line pt-2">
      <p className="text-sm font-medium">Qué hace este producto</p>
      <SelectField label="Familia" value={campos.family} onChange={(valor) => set("family", valor)} options={familias} />
      {campos.family === "mercado" || campos.tier || campos.plan || campos.replaces ? (
        <>
          <SelectField
            label="Nivel"
            value={campos.tier}
            onChange={(valor) => set("tier", valor)}
            options={conActual(
              [
                { value: "", label: "Sin nivel" },
                { value: "presencia", label: "Presencia" },
                { value: "pro", label: "Pro" },
              ],
              campos.tier,
            )}
          />
          <Field label="Plan interno" value={campos.plan} onChange={(valor) => set("plan", valor)} />
          <Field label="Reemplaza al slug" value={campos.replaces} onChange={(valor) => set("replaces", valor)} />
        </>
      ) : null}
      {ver(["placement", "days"], ["advertising"]) || campos.family === "ads" ? (
        <>
          <SelectField
            label="Dónde se muestra"
            value={campos.placement}
            onChange={(valor) => set("placement", valor)}
            options={conActual(
              [
                { value: "", label: "Elegir" },
                { value: "home", label: "Portada" },
                { value: "category", label: "Categoría" },
                { value: "search", label: "Búsqueda" },
              ],
              campos.placement,
            )}
          />
          <Field label="Días" value={campos.days} onChange={(valor) => set("days", valor)} type="number" />
        </>
      ) : null}
      {ver(["sends"], ["messaging"]) || campos.family === "messaging" ? (
        <Field label="Envíos del pack" value={campos.sends} onChange={(valor) => set("sends", valor)} type="number" />
      ) : null}
      {campos.family === "creativos" || campos.credits ? (
        <Field label="Créditos que suma al habilitar" value={campos.credits} onChange={(valor) => set("credits", valor)} type="number" />
      ) : null}
      {ver(["percentMin", "percentMax"], ["commission"]) ? (
        <>
          <Field label="Comisión mínima %" value={campos.percentMin} onChange={(valor) => set("percentMin", valor)} type="number" />
          <Field label="Comisión máxima %" value={campos.percentMax} onChange={(valor) => set("percentMax", valor)} type="number" />
        </>
      ) : null}
      {ver(["includedBranches", "extraBranches", "billedAs"], ["base_product", "branch"]) ? (
        <>
          <Field label="Sucursales incluidas" value={campos.includedBranches} onChange={(valor) => set("includedBranches", valor)} type="number" />
          <Field label="Sucursales extra" value={campos.extraBranches} onChange={(valor) => set("extraBranches", valor)} type="number" />
          <Field label="Se factura como" value={campos.billedAs} onChange={(valor) => set("billedAs", valor)} />
        </>
      ) : null}
    </div>
  );
}
