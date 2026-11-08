import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TorreShell } from "@/components/torre-shell";
import { consultarInstitucionesSire, modificarInstitucionSire } from "@/lib/torre/sire-fn";
import type { SireSite } from "@/lib/torre/sire-bridge";

export const Route = createFileRoute("/torre/sire")({ component: SirePage });

function SirePage() {
  const query = useQuery({ queryKey: ["torre-sire"], queryFn: () => consultarInstitucionesSire(), retry: false });
  const result = query.data;
  return <TorreShell title="SIRE · Instituciones">
    <p className="mb-4 text-sm text-muted">Instituciones, sedes y accesos registrados en SIRE.</p>
    {query.isPending && <p>Cargando información institucional…</p>}
    {query.isError && <p role="alert">No tenés permiso para consultar esta información.</p>}
    {result && !result.disponible && <p role="status">{result.motivo}</p>}
    {result?.disponible && <>
      <AltaInstitucion />
      {result.data.limited && <p role="alert">La lista está limitada. Faltan resultados.</p>}
      {result.data.institutions.length === 0 && <p>No hay instituciones registradas.</p>}
      <div className="space-y-4">{result.data.institutions.map((institution) => {
        const sites = result.data.sites.filter((site) => site.institution_id === institution.id);
        const members = result.data.members.filter((member) => member.institution_id === institution.id);
        return <section key={institution.id} className="rounded-lg border border-line bg-surface p-4">
          <h2 className="font-display text-lg font-semibold">{institution.name}</h2>
          <p className="mt-1 text-sm text-muted">{sites.length} sedes y extensiones · {members.length} accesos</p>
          <h3 className="mt-4 font-medium">Sedes y extensiones</h3>
          {sites.length ? <ul className="divide-y divide-line text-sm">{sites.map((site) => <li className="py-2" key={site.id}>{site.name} · {site.kind}{site.active ? "" : " · Inactiva"}</li>)}</ul> : <p className="text-sm text-muted">Sin sedes.</p>}
          <h3 className="mt-4 font-medium">Usuarios y roles</h3>
          {members.length ? <ul className="divide-y divide-line text-sm">{members.map((member) => <li className="py-2" key={member.id}>
            <span className="font-medium">{member.name}</span> · {member.role} · {member.site_id ? sites.find((s) => s.id === member.site_id)?.name ?? "Sede no disponible" : "Toda la institución"}{member.active ? "" : " · Inactivo"}<br /><span className="text-muted">{member.email}</span>
            {["docente", "preceptor", "secretaria", "coordinador"].includes(member.role) && <CambiarAcceso institutionId={institution.id} membershipId={member.id} active={member.active} />}
          </li>)}</ul> : <p className="text-sm text-muted">Sin usuarios vinculados.</p>}
          <Gestion institutionId={institution.id} sites={sites} />
        </section>;
      })}</div>
    </>}
  </TorreShell>;
}

function AltaInstitucion() {
  const cache = useQueryClient();
  const [name, setName] = useState("");
  const [siteName, setSiteName] = useState("Sede central");
  const [rectorEmail, setRectorEmail] = useState("");
  const [ids, setIds] = useState(() => ({ operationId: crypto.randomUUID(), resourceId: crypto.randomUUID(), siteId: crypto.randomUUID() }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await modificarInstitucionSire({ data: { ...ids, action: "create-institution", institutionName: name, siteName, rectorEmail } });
      setMessage(result.mensaje);
      if (result.ok) { setIds({ operationId: crypto.randomUUID(), resourceId: crypto.randomUUID(), siteId: crypto.randomUUID() }); setName(""); setRectorEmail(""); await cache.invalidateQueries({ queryKey: ["torre-sire"] }); }
    } catch { setMessage("No se pudo completar el alta. Verificá las cuentas y volvé a consultar."); }
    finally { setBusy(false); }
  };
  return <details className="mb-4 rounded-lg border border-line bg-surface p-4">
    <summary className="cursor-pointer font-medium">Crear institución</summary>
    <p className="mt-2 text-sm text-muted">La cuenta de rectoría y tu cuenta de Torre deben existir con correo verificado en SIRE.</p>
    <form className="mt-3 grid gap-3" onSubmit={submit}>
      <label className="grid gap-1 text-sm">Nombre de la institución<input className="rounded border border-line bg-surface p-2" value={name} onChange={(event) => setName(event.target.value)} maxLength={180} required /></label>
      <label className="grid gap-1 text-sm">Nombre de la sede principal<input className="rounded border border-line bg-surface p-2" value={siteName} onChange={(event) => setSiteName(event.target.value)} maxLength={180} required /></label>
      <label className="grid gap-1 text-sm">Correo de la primera rectoría<input className="rounded border border-line bg-surface p-2" type="email" value={rectorEmail} onChange={(event) => setRectorEmail(event.target.value)} required /></label>
      <button className="justify-self-start rounded border border-line px-4 py-2 text-sm" type="submit" disabled={busy}>{busy ? "Guardando…" : "Crear institución"}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </details>;
}

function CambiarAcceso({ institutionId, membershipId, active }: { institutionId: string; membershipId: string; active: boolean }) {
  const cache = useQueryClient();
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const change = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await modificarInstitucionSire({ data: { action: "set-member-state", operationId, institutionId, membershipId, active: !active } });
      setMessage(result.mensaje);
      if (result.ok) { setOperationId(crypto.randomUUID()); await cache.invalidateQueries({ queryKey: ["torre-sire"] }); }
    } catch { setMessage("No se pudo cambiar el acceso."); }
    finally { setBusy(false); }
  };
  return <div className="mt-1"><button className="rounded border border-line px-2 py-1 text-sm" type="button" disabled={busy} onClick={() => void change()}>{busy ? "Guardando…" : active ? "Suspender acceso" : "Reactivar acceso"}</button>{message && <span role="status" className="ml-2 text-muted">{message}</span>}</div>;
}

function Gestion({ institutionId, sites }: { institutionId: string; sites: SireSite[] }) {
  const cache = useQueryClient();
  const [mode, setMode] = useState<"create-site" | "link-member">("create-site");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [siteId, setSiteId] = useState("");
  const [kind, setKind] = useState<"subsede" | "extension">("subsede");
  const [role, setRole] = useState<"docente" | "preceptor" | "secretaria" | "coordinador">("docente");
  const [ids, setIds] = useState(() => ({ operationId: crypto.randomUUID(), resourceId: crypto.randomUUID() }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = sites.filter((site) => site.active);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const data = mode === "create-site"
        ? { ...ids, action: mode, institutionId, parentSiteId: siteId, name, kind }
        : { ...ids, action: mode, institutionId, siteId: siteId || null, email, role };
      const result = await modificarInstitucionSire({ data });
      setMessage(result.mensaje);
      if (result.ok) { setIds({ operationId: crypto.randomUUID(), resourceId: crypto.randomUUID() }); setName(""); setEmail(""); await cache.invalidateQueries({ queryKey: ["torre-sire"] }); }
    } catch { setMessage("No se pudo completar. Verificá los permisos y los datos."); }
    finally { setBusy(false); }
  };
  return <details className="mt-4 border-t border-line pt-4">
    <summary className="cursor-pointer font-medium">Administrar institución</summary>
    <p className="mt-2 text-sm text-muted">Requiere administración en Torre y una cuenta verificada en SIRE.</p>
    <form className="mt-3 grid gap-3" onSubmit={submit}>
      <label className="grid gap-1 text-sm">Acción<select className="rounded border border-line bg-surface p-2" value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setSiteId(""); }}><option value="create-site">Crear subsede o extensión</option><option value="link-member">Vincular usuario</option></select></label>
      {mode === "create-site" ? <>
        <label className="grid gap-1 text-sm">Nombre<input className="rounded border border-line bg-surface p-2" value={name} onChange={(e) => setName(e.target.value)} required maxLength={180} /></label>
        <label className="grid gap-1 text-sm">Tipo<select className="rounded border border-line bg-surface p-2" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="subsede">Subsede</option><option value="extension">Extensión</option></select></label>
      </> : <>
        <label className="grid gap-1 text-sm">Correo de una cuenta verificada en SIRE<input className="rounded border border-line bg-surface p-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="grid gap-1 text-sm">Rol<select className="rounded border border-line bg-surface p-2" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="docente">Docente</option><option value="preceptor">Preceptoría</option><option value="secretaria">Secretaría</option><option value="coordinador">Coordinación</option></select></label>
      </>}
      <label className="grid gap-1 text-sm">{mode === "create-site" ? "Sede de la que depende" : "Alcance"}<select className="rounded border border-line bg-surface p-2" value={siteId} onChange={(e) => setSiteId(e.target.value)} required={mode === "create-site"}><option value="">{mode === "create-site" ? "Elegí una sede" : "Toda la institución"}</option>{active.filter((site) => mode !== "create-site" || site.kind === "sede" || (kind === "extension" && site.kind === "subsede")).map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label>
      <button className="justify-self-start rounded border border-line px-4 py-2 text-sm" disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar en SIRE"}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </details>;
}
