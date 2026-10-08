import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listTenants } from "@/lib/torre-fn";
import { listLegal, offerContract, publishVersion, saveDocument } from "@/lib/torre/legal-fn";

export const Route = createFileRoute("/torre/legal")({ component: Page });

const AUDIENCIAS = [
  { value: "saas_b2b", label: "Puesto (SaaS)" },
  { value: "mercado_comprador", label: "Comprador" },
  { value: "mercado_cargador", label: "Cargador" },
  { value: "privacy", label: "Privacidad" },
  { value: "other", label: "Otro" },
];

function Page() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["torre-legal"], queryFn: () => listLegal() });
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const [doc, setDoc] = useState({ id: "", code: "", title: "", audience: "saas_b2b", reacceptOnChange: true, status: "draft" });
  const [ver, setVer] = useState({ documentId: "", label: "1.0", body: "" });
  const [offer, setOffer] = useState({ tenantId: "", versionId: "" });
  const recargar = () => qc.invalidateQueries({ queryKey: ["torre-legal"] });
  const titulo = (id: string) => data.data?.documents.find((item) => item.id === id)?.title ?? id;
  const publicadas = (data.data?.versions ?? []).filter((v) => v.status === "published");
  return (
    <TorreShell title="Legal">
      <p className="mb-3 max-w-2xl text-sm text-muted">Un borrador no se ofrece y no aparece para aceptar. Publicar calcula el hash en el servidor. Una versión publicada no se reescribe. La aceptación es electrónica, no una firma certificada, y Torre no genera PDF.</p>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Documentos</h2>
        <Button size="sm" variant="secondary" onClick={() => setDoc({ id: "", code: "", title: "", audience: "saas_b2b", reacceptOnChange: true, status: "draft" })}>Nuevo</Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(data.data?.documents ?? []).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              onClick={() => setDoc({ id: item.id, code: item.code, title: item.title, audience: item.audience, reacceptOnChange: item.reacceptOnChange, status: item.status })}
            >
              <span>
                <span className="block font-medium">{item.title}</span>
                <span className="text-xs text-muted">{item.code} · {AUDIENCIAS.find((a) => a.value === item.audience)?.label ?? item.audience} · reaceptar: {item.reacceptOnChange ? "sí" : "no"}</span>
              </span>
              <Badge tone={item.status === "published" ? "ok" : "muted"}>{item.status}</Badge>
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => {
        e.preventDefault();
        void saveDocument({ data: { ...doc, id: doc.id || undefined } }).then(() => { toast.success("Documento guardado"); return recargar(); }).catch((err: Error) => toast.error(err.message));
      }}>
        <Field label="Código" value={doc.code} onChange={(code) => setDoc({ ...doc, code })} />
        <Field label="Título" value={doc.title} onChange={(title) => setDoc({ ...doc, title })} />
        <SelectField label="Audiencia" value={doc.audience} onChange={(audience) => setDoc({ ...doc, audience })} options={AUDIENCIAS} />
        <SelectField label="Estado" value={doc.status} onChange={(status) => setDoc({ ...doc, status })} options={[{ value: "draft", label: "Borrador" }, { value: "published", label: "Publicado" }, { value: "archived", label: "Archivado" }]} />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={doc.reacceptOnChange} onChange={(e) => setDoc({ ...doc, reacceptOnChange: e.target.checked })} />
          Exigir nueva aceptación si cambia
        </label>
        <Button type="submit" className="mt-3 w-full">{doc.id ? "Guardar cambios" : "Guardar documento"}</Button>
      </form>

      <h2 className="mt-4 font-medium">Versiones</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {(data.data?.versions ?? []).map((item) => (
          <li key={item.id} className="rounded-lg border border-line bg-surface px-3 py-2">
            <span className="font-medium">{titulo(item.documentId)} · {item.label}</span>
            <Badge className="ml-2" tone={item.status === "published" ? "ok" : "muted"}>{item.status}</Badge>
            <p className="text-xs text-muted">{item.publishedAt ? `Publicada ${item.publishedAt}` : "Sin fecha de publicación"}</p>
            <p className="break-all font-mono text-[11px] text-muted">{item.hash}</p>
            {item.body ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-leaf">Texto publicado</summary>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted">{item.body}</pre>
              </details>
            ) : null}
          </li>
        ))}
        {(data.data?.versions ?? []).length === 0 ? <li className="text-muted">Todavía no hay versiones. Un documento en borrador no se puede aceptar.</li> : null}
      </ul>
      <h2 className="mt-4 font-medium">Publicar versión</h2>
      <form className="mt-2 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => {
        e.preventDefault();
        void publishVersion({ data: ver }).then((res) => { toast.success(`Publicada. Hash ${res.hash}`); return recargar(); }).catch((err: Error) => toast.error(err.message));
      }}>
        <SelectField label="Documento" value={ver.documentId} onChange={(documentId) => setVer({ ...ver, documentId })} options={(data.data?.documents ?? []).filter((item) => item.status !== "archived").map((item) => ({ value: item.id, label: item.title }))} />
        <Field label="Etiqueta" value={ver.label} onChange={(label) => setVer({ ...ver, label })} />
        <label className="mt-2 block text-sm">Texto
          <textarea className="mt-1 w-full rounded-md border border-line bg-paper p-2 text-sm" rows={6} value={ver.body} onChange={(e) => setVer({ ...ver, body: e.target.value })} />
        </label>
        <Button type="submit" className="mt-3 w-full">Publicar</Button>
      </form>

      <h2 className="mt-4 font-medium">Contratos del puesto</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {(data.data?.contracts ?? []).map((item) => (
          <li key={item.id} className="rounded-lg border border-line bg-surface px-3 py-2">
            <span className="font-medium">{item.tenantName}</span>
            <span className="ml-2 text-xs text-muted">{titulo(item.documentId)} · {item.status}</span>
            <p className="break-all font-mono text-[11px] text-muted">{item.hash}</p>
          </li>
        ))}
        {(data.data?.contracts ?? []).length === 0 ? <li className="text-muted">Nadie tiene un contrato ofrecido.</li> : null}
      </ul>
      <h2 className="mt-4 font-medium">Ofrecer al puesto</h2>
      <p className="mt-1 max-w-md text-xs text-muted">Solo versiones publicadas de la relación con el puesto o de privacidad. El comprador y el cargador aceptan en Mercado al Toque, no acá.</p>
      <form className="mt-2 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => {
        e.preventDefault();
        void offerContract({ data: offer }).then(() => { toast.success("Quedó pendiente para ese tenant"); return recargar(); }).catch((err: Error) => toast.error(err.message));
      }}>
        <SelectField label="Tenant" value={offer.tenantId} onChange={(tenantId) => setOffer({ ...offer, tenantId })} options={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <SelectField label="Versión publicada" value={offer.versionId} onChange={(versionId) => setOffer({ ...offer, versionId })} options={publicadas.map((v) => ({ value: v.id, label: `${titulo(v.documentId)} ${v.label}` }))} />
        <Button type="submit" className="mt-3 w-full" disabled={publicadas.length === 0}>Ofrecer</Button>
      </form>

      <h2 className="mt-4 font-medium">Aceptaciones</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {(data.data?.acceptances ?? []).map((item) => (
          <li key={item.id} className="rounded-lg border border-line bg-surface px-3 py-2">
            <span className="font-medium">{item.email || item.tenantId || "sin correo"}</span>
            <span className="ml-2 text-xs text-muted">{item.action} · {item.at}</span>
            <p className="break-all font-mono text-[11px] text-muted">{item.hash}</p>
          </li>
        ))}
        {(data.data?.acceptances ?? []).length === 0 ? <li className="text-muted">Todavía no hay aceptaciones.</li> : null}
      </ul>
    </TorreShell>
  );
}
