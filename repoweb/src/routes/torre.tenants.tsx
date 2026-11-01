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
  clientName: "",
  name: "",
  slug: "",
  status: "active",
  planId: "",
  installedVersion: "",
  operationalTenantRef: "",
  ownerEmail: "",
  ownerPassword: "",
  direccion: "",
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
        clientName: "",
        name: actual.name,
        slug: actual.slug,
        status: actual.status,
        planId: actual.planId,
        installedVersion: actual.installedVersion,
        operationalTenantRef: actual.operationalTenantRef,
        ownerEmail: "",
        ownerPassword: "",
        direccion: "",
      }
    : { ...VACIO, appId: apps.data?.find((a) => a.slug === "mostrador")?.id ?? "" };

  return (
    <TorreShell title="Tenants">
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="flex gap-2">
            <Input className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar" />
            <Button className="shrink-0" size="sm" onClick={() => setSel("nuevo")}>Nuevo</Button>
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
            clientes={[{value:"",label:"Crear cliente nuevo"},...(clientes.data ?? []).filter(c=>c.status==='active' || c.id===actual?.clientId).map((c) => ({ value: c.id, label: c.name }))]}
            planes={[{ value: "", label: "Elegí un plan" }, ...(planes.data ?? []).filter(p=>p.status==='active' || p.id===actual?.planId).map((p) => ({ value: p.id, label: p.name }))]}
            onClose={() => setSel(null)}
            onOff={actual ? async () => {
              await desactivarTenant({ data: actual.id });
              toast.success("Tenant desactivado");
              await qc.invalidateQueries({ queryKey: ["torre-tenants"] });
              await qc.invalidateQueries({ queryKey: ["torre-clientes"] });
              await qc.invalidateQueries({ queryKey: ["torre-subs"] });
            } : undefined}
            onSave={async (data) => {
              await saveTenant({ data: actual ? { ...data, id: actual.id } : data });
              toast.success("Tenant guardado");
              await qc.invalidateQueries({ queryKey: ["torre-tenants"] });
              await qc.invalidateQueries({ queryKey: ["torre-clientes"] });
              await qc.invalidateQueries({ queryKey: ["torre-subs"] });
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
      {!onOff && !form.clientId ? <Field label="Nombre del cliente (si es distinto del negocio)" value={form.clientName} onChange={(clientName)=>setForm({...form,clientName})}/> : null}
      <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
      <SelectField label="Plan" value={form.planId} onChange={(planId) => setForm({ ...form, planId })} options={planes} />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "active", label: "Activo" }, { value: "inactive", label: "Inactivo" }]} />
      <p className="mt-2 text-xs text-muted">Al guardar se vinculan el cliente, el negocio, su suscripción y el plan elegido. Las herramientas y los cupos se aplican en web, Windows y Android. El precio de un abono ya contratado se conserva hasta cambiar de plan.</p>
      {!onOff ? (
        <>
          <Field label="Dirección o mercado del puesto" value={form.direccion} onChange={(direccion) => setForm({ ...form, direccion })} />
          <p className="mt-1 text-xs text-muted">La escribís vos. No sale de una lista. Con eso el puesto arma el QR y el comprador queda vinculado a ese mostrador.</p>
          <Field label="Mail del dueño" value={form.ownerEmail} onChange={(ownerEmail) => setForm({ ...form, ownerEmail })} />
          <label className="mt-2 block text-xs text-muted">
            Contraseña del dueño
            <Input className="mt-1" type="password" autoComplete="new-password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} required minLength={8} />
          </label>
          <p className="mt-1 text-xs text-muted">Con ese mail entra a Mostrador. Después, en Usuarios, crea al vendedor y al cajero.</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">La contraseña del puesto la cambia el dueño, no Torre.</p>
      )}
      <Button type="submit" className="mt-3 w-full" disabled={busy || !form.planId}>{busy ? "Guardando…" : onOff ? "Guardar negocio y plan" : "Crear negocio y acceso"}</Button>
      {onOff ? (
        <Button type="button" variant="secondary" className="mt-2 w-full" onClick={() => void onOff().catch((err: Error) => toast.error(err.message))}>
          Desactivar
        </Button>
      ) : null}
    </form>
  );
}
