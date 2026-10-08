import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listApps, listDeployments, listTenants, listVersions, saveDeployment } from "@/lib/torre-fn";

export const Route = createFileRoute("/torre/deployments")({ component: Page });

const ESTADO: Record<string, string> = {
  pending: "Pendiente",
  deployed: "Publicado",
  failed: "Fallido",
  rolled_back: "Revertido",
};

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-deps"], queryFn: () => listDeployments() });
  const apps = useQuery({ queryKey: ["torre-apps"], queryFn: () => listApps() });
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const versions = useQuery({ queryKey: ["torre-versiones"], queryFn: () => listVersions() });
  const [nuevo, setNuevo] = useState(false);
  return (
    <TorreShell title="Deployments">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Torre anota el deployment. No instala el dispositivo. Publicado en infraestructura solo si el registro dice que se confirmó.</p>
        <Button size="sm" onClick={() => setNuevo((v) => !v)}>Registrar</Button>
      </div>
      {nuevo ? (
        <Forma
          apps={(apps.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
          tenants={[{ value: "", label: "Sin tenant" }, ...(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          versions={(versions.data ?? []).map((v) => ({ value: v.id, label: `${v.appName} ${v.version} ${v.platform}` }))}
          onSave={async (data) => {
            await saveDeployment({ data });
            toast.success("Deployment registrado");
            setNuevo(false);
            await qc.invalidateQueries({ queryKey: ["torre-deps"] });
          }}
        />
      ) : null}
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(lista.data ?? []).map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              <span className="block font-medium">{d.appName} · {d.version}</span>
              <span className="text-xs text-muted">{d.tenantName || "General"} · {d.platform} · {ESTADO[d.status] ?? d.status} · {d.origin} · {d.deployedAt || "sin fecha"}</span>
              {d.notes ? <span className="block text-xs text-muted">{d.notes}</span> : null}
              {d.logExcerpt ? <span className="block text-xs text-muted">{d.logExcerpt}</span> : null}
            </span>
            <Badge tone={d.infraConfirmed ? "ok" : d.status === "failed" ? "terra" : "muted"}>
              {d.infraConfirmed ? "Infraestructura confirmó" : "Publicado o anotado en Torre, sin confirmación"}
            </Badge>
          </li>
        ))}
      </ul>
    </TorreShell>
  );
}

function Forma({
  apps,
  tenants,
  versions,
  onSave,
}: {
  apps: { value: string; label: string }[];
  tenants: { value: string; label: string }[];
  versions: { value: string; label: string }[];
  onSave: (data: { appId: string; tenantId: string; versionId: string; platform: string; status: string; notes: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    appId: apps[0]?.value ?? "",
    tenantId: "",
    versionId: versions[0]?.value ?? "",
    platform: "web",
    status: "pending",
    notes: "",
  });
  return (
    <form className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); void onSave(form).catch((err: Error) => toast.error(err.message)); }}>
      <SelectField label="Aplicación" value={form.appId} onChange={(appId) => setForm({ ...form, appId })} options={apps} />
      <SelectField label="Tenant" value={form.tenantId} onChange={(tenantId) => setForm({ ...form, tenantId })} options={tenants} />
      <SelectField label="Versión" value={form.versionId} onChange={(versionId) => setForm({ ...form, versionId })} options={versions} />
      <SelectField label="Plataforma" value={form.platform} onChange={(platform) => setForm({ ...form, platform })} options={[{ value: "web", label: "Web" }, { value: "android", label: "Android" }, { value: "windows", label: "Windows" }]} />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "pending", label: "Pendiente" }, { value: "failed", label: "Fallido observado" }]} />
      <Field label="Notas" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
      <Button type="submit" className="mt-3 w-full">Guardar</Button>
    </form>
  );
}
