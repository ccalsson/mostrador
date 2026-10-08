import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Button } from "@/components/ui/button";
import { listApps, listTenants, listVersions, saveVersion } from "@/lib/torre-fn";
import { listBranches, listTargets, publicarRelease, recomendarAnterior } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/versiones")({ component: Page });

function cmp(a: string, b: string) {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function Page() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ["torre-apps"], queryFn: () => listApps() });
  const versions = useQuery({ queryKey: ["torre-versiones"], queryFn: () => listVersions() });
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const targets = useQuery({ queryKey: ["torre-targets"], queryFn: () => listTargets() });
  const branches = useQuery({ queryKey: ["torre-sucursales"], queryFn: () => listBranches() });
  const [appId, setAppId] = useState("");
  const chosen = appId || apps.data?.[0]?.id || "";
  const app = (apps.data ?? []).find((a) => a.id === chosen);
  const propias = (versions.data ?? []).filter((v) => v.appId === chosen);
  const puestos = (tenants.data ?? []).filter((t) => t.appId === chosen && t.status === "active");
  const [nueva, setNueva] = useState(false);
  const [publicar, setPublicar] = useState<{ id: string; version: string } | null>(null);
  const [alcance, setAlcance] = useState("all");
  const [tenantId, setTenantId] = useState("");
  const [branchId, setBranchId] = useState("");
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <TorreShell title="Versiones">
      <SelectField
        label="Aplicación"
        value={chosen}
        onChange={setAppId}
        options={(apps.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
      />
      <p className="mt-3 text-sm">Versión disponible: <span className="font-medium">{app?.currentVersion || "sin cargar"}</span></p>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {puestos.map((t) => {
          const ok = Boolean(app?.currentVersion) && cmp(t.installedVersion || "0", app?.currentVersion || "0") >= 0;
          return (
            <li key={t.id} className="flex items-center justify-between px-3 py-2">
              <span>{t.name}</span>
              <span>{t.installedVersion || "—"} {ok ? "✓" : "⚠"}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between">
        <h2 className="font-medium">Historial</h2>
        <Button size="sm" onClick={() => setNueva((v) => !v)}>Nueva versión</Button>
      </div>
      {nueva ? (
        <Nueva
          appId={chosen}
          hoy={hoy}
          onSave={async (data) => {
            await saveVersion({ data });
            toast.success("Versión registrada");
            setNueva(false);
            await qc.invalidateQueries({ queryKey: ["torre-versiones"] });
          }}
        />
      ) : null}
      <ul className="mt-2 space-y-2 text-sm">
        {propias.map((v) => (
          <li key={v.id} className="rounded-lg border border-line bg-surface px-3 py-2">
            <span className="font-medium">{v.version}</span>
            <span className="ml-2 text-muted">{v.platform} · {v.status} · {v.releaseDate}</span>
            {v.mandatory ? <span className="ml-2 text-xs text-terra">Obligatoria</span> : null}
            {v.minimumSupportedVersion ? <p className="text-xs text-muted">Mínima soportada {v.minimumSupportedVersion}</p> : null}
            {v.checksum ? <p className="break-all font-mono text-[11px] text-muted">{v.checksum}</p> : null}
            {v.downloadUrl ? <p className="break-all text-xs text-muted">{v.downloadUrl}</p> : null}
            {v.changelog ? <p className="text-muted">{v.changelog}</p> : null}
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setPublicar({ id: v.id, version: v.version })}>Publicar en Torre</Button>
              {v.status === "published" ? (
                <Button size="sm" variant="secondary" onClick={() => {
                  if (!window.confirm("Esto solo cambia el manifest. No revierte un deploy que ya esté corriendo.")) return;
                  void recomendarAnterior({ data: v.id })
                    .then((res) => { toast.message(res.message); return qc.invalidateQueries({ queryKey: ["torre-versiones"] }); })
                    .catch((err: Error) => toast.error(err.message));
                }}>Recomendar anterior</Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {publicar ? (
        <form
          className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void publicarRelease({
              data: {
                versionId: publicar.id,
                scope: alcance as "all" | "tenant" | "branch" | "beta",
                tenantId,
                branchId,
              },
            })
              .then(async (res) => {
                toast.message(res.message);
                setPublicar(null);
                await qc.invalidateQueries({ queryKey: ["torre-versiones"] });
                await qc.invalidateQueries({ queryKey: ["torre-targets"] });
              })
              .catch((err: Error) => toast.error(err.message));
          }}
        >
          <p className="text-sm font-medium">Publicar {publicar.version}</p>
          <p className="mt-1 text-xs text-muted">Si no hay hook de Vercel, queda publicado en Torre y el deployment no se marca como confirmado.</p>
          <SelectField label="Quién la recibe" value={alcance} onChange={setAlcance} options={[
            { value: "all", label: "Todos" },
            { value: "tenant", label: "Un tenant" },
            { value: "branch", label: "Una sucursal" },
            { value: "beta", label: "Canal beta" },
          ]} />
          {alcance !== "all" ? <SelectField label="Tenant" value={tenantId} onChange={setTenantId} options={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))} /> : null}
          {alcance === "branch" ? <SelectField label="Sucursal" value={branchId} onChange={setBranchId} options={(branches.data ?? []).map((b) => ({ value: b.id, label: `${b.tenantName} · ${b.name}` }))} /> : null}
          <Button type="submit" className="mt-3 w-full">Publicar</Button>
        </form>
      ) : null}
      <h2 className="mt-4 font-medium">Quién puede actualizar</h2>
      <ul className="mt-2 text-sm">
        {(targets.data ?? []).map((t) => (
          <li key={t.id}>{t.appName} {t.version} {t.platform} · {t.scope} {t.tenantName} {t.branchName} · {t.status}</li>
        ))}
      </ul>
    </TorreShell>
  );
}

function Nueva({
  appId,
  hoy,
  onSave,
}: {
  appId: string;
  hoy: string;
  onSave: (data: { appId: string; version: string; platform: string; releaseDate: string; changelog: string; downloadUrl: string; status: string; checksum?: string; minimumSupportedVersion?: string; mandatory?: boolean }) => Promise<void>;
}) {
  const [form, setForm] = useState({ version: "", platform: "web", releaseDate: hoy, changelog: "", downloadUrl: "", checksum: "", minimum: "", status: "ready", mandatory: false });
  return (
    <form className="mt-2 rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); void onSave({ ...form, appId, minimumSupportedVersion: form.minimum, mandatory: form.mandatory }).catch((err: Error) => toast.error(err.message)); }}>
      <Field label="Versión" value={form.version} onChange={(version) => setForm({ ...form, version })} />
      <SelectField label="Plataforma" value={form.platform} onChange={(platform) => setForm({ ...form, platform })} options={[{ value: "web", label: "Web" }, { value: "android", label: "Android" }, { value: "windows", label: "Windows" }]} />
      <Field label="Fecha" value={form.releaseDate} onChange={(releaseDate) => setForm({ ...form, releaseDate })} type="date" />
      <Field label="Cambios" value={form.changelog} onChange={(changelog) => setForm({ ...form, changelog })} />
      <Field label="Descarga" value={form.downloadUrl} onChange={(downloadUrl) => setForm({ ...form, downloadUrl })} />
      <Field label="SHA-256" value={form.checksum} onChange={(checksum) => setForm({ ...form, checksum })} />
      <Field label="Versión mínima soportada" value={form.minimum} onChange={(minimum) => setForm({ ...form, minimum })} />
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} />
        Actualización obligatoria
      </label>
      <Button type="submit" className="mt-3 w-full">Guardar como lista</Button>
    </form>
  );
}
