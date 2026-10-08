import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { desactivarTenant, listApps, listClients, listPlans, listTenants, saveTenant } from "@/lib/torre-fn";

export const Route = createFileRoute("/torre/tenants")({ component: Page });

const VACIO = {
  appId: "",
  clientId: "",
  name: "",
  slug: "",
  status: "active",
  planId: "",
  installedVersion: "",
  operationalTenantRef: "",
};

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const apps = useQuery({ queryKey: ["torre-apps"], queryFn: () => listApps() });
  const clientes = useQuery({ queryKey: ["torre-clientes"], queryFn: () => listClients() });
  const planes = useQuery({ queryKey: ["torre-planes"], queryFn: () => listPlans() });
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((t) => t.id === sel) : null;
  const filas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (lista.data ?? []).filter((t) => !needle || `${t.name} ${t.appName} ${t.clientName}`.toLowerCase().includes(needle));
  }, [lista.data, q]);
  const base = actual
    ? {
        appId: actual.appId,
        clientId: actual.clientId,
        name: actual.name,
        slug: actual.slug,
        status: actual.status,
        planId: actual.planId,
        installedVersion: actual.installedVersion,
        operationalTenantRef: actual.operationalTenantRef,
      }
    : { ...VACIO, appId: apps.data?.[0]?.id ?? "", clientId: clientes.data?.[0]?.id ?? "" };

  return (
    <TorreShell title="Tenants">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar" />
            <Button size="sm" onClick={() => setSel("nuevo")}>Nuevo</Button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  {["Tenant", "Aplicación", "Cliente", "Plan", "Estado", "Versión", "Actividad", ""].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-2 py-2 font-medium">{t.name}</td>
                    <td className="px-2 py-2">{t.appName}</td>
                    <td className="px-2 py-2">{t.clientName}</td>
                    <td className="px-2 py-2">{t.planName || "—"}</td>
                    <td className="px-2 py-2"><Badge tone={t.status === "active" ? "ok" : "muted"}>{t.status === "active" ? "Activo" : "Inactivo"}</Badge></td>
                    <td className="px-2 py-2">{t.installedVersion || "—"} {t.atrasado ? "⚠" : t.installedVersion ? "✓" : ""}</td>
                    <td className="px-2 py-2 text-xs text-muted">{t.lastActivityAt ? t.lastActivityAt.slice(0, 10) : "—"}</td>
                    <td className="px-2 py-2">
                      <button type="button" className="text-leaf" onClick={() => setSel(t.id)}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {sel ? (
          <Forma
            key={actual?.id ?? "nuevo"}
            inicial={base}
            apps={(apps.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
            clientes={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            planes={[{ value: "", label: "Sin plan" }, ...(planes.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
            onClose={() => setSel(null)}
            onOff={actual ? async () => {
              await desactivarTenant({ data: actual.id });
              toast.success("Tenant desactivado");
              await qc.invalidateQueries({ queryKey: ["torre-tenants"] });
            } : undefined}
            onSave={async (data) => {
              await saveTenant({ data: actual ? { ...data, id: actual.id } : data });
              toast.success("Tenant guardado");
              await qc.invalidateQueries({ queryKey: ["torre-tenants"] });
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
  clientes,
  planes,
  onSave,
  onClose,
  onOff,
}: {
  inicial: typeof VACIO;
  apps: { value: string; label: string }[];
  clientes: { value: string; label: string }[];
  planes: { value: string; label: string }[];
  onSave: (data: typeof VACIO) => Promise<void>;
  onClose: () => void;
  onOff?: () => Promise<void>;
}) {
  const [form, setForm] = useState(inicial);
  const [busy, setBusy] = useState(false);
  return (
    <form className="rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); setBusy(true); void onSave(form).catch((err: Error) => toast.error(err.message)).finally(() => setBusy(false)); }}>
      <div className="flex justify-between"><h2 className="font-medium">Ficha</h2><button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button></div>
      <SelectField label="Aplicación" value={form.appId} onChange={(appId) => setForm({ ...form, appId })} options={apps} />
      <SelectField label="Cliente" value={form.clientId} onChange={(clientId) => setForm({ ...form, clientId })} options={clientes} />
      <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
      <SelectField label="Plan" value={form.planId} onChange={(planId) => setForm({ ...form, planId })} options={planes} />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "active", label: "Activo" }, { value: "inactive", label: "Inactivo" }]} />
      <Field label="Versión instalada" value={form.installedVersion} onChange={(installedVersion) => setForm({ ...form, installedVersion })} />
      <Field label="Referencia operativa" value={form.operationalTenantRef} onChange={(operationalTenantRef) => setForm({ ...form, operationalTenantRef })} />
      <p className="mt-1 text-xs text-muted">Solo texto. No es una clave hacia las tablas del puesto.</p>
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
      {onOff ? (
        <Button type="button" variant="secondary" className="mt-2 w-full" onClick={() => void onOff().catch((err: Error) => toast.error(err.message))}>
          Desactivar
        </Button>
      ) : null}
    </form>
  );
}
