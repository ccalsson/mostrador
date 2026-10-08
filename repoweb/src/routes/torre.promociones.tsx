import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listTenants } from "@/lib/torre-fn";
import { grantPromotion, listPromotions, savePromotion } from "@/lib/torre/legal-fn";

export const Route = createFileRoute("/torre/promociones")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["torre-promos"], queryFn: () => listPromotions() });
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const [form, setForm] = useState({ id: "", code: "", name: "", description: "", status: "draft", config: "{}" });
  const [grant, setGrant] = useState({ promotionId: "", tenantId: "", startsOn: new Date().toISOString().slice(0, 10), endsOn: "", conditions: "", evidenceRef: "" });
  const recargar = () => qc.invalidateQueries({ queryKey: ["torre-promos"] });
  return (
    <TorreShell title="Promociones">
      <p className="mb-3 text-sm text-muted">Una plantilla no beneficia a nadie hasta asignarla a un tenant. Fundador no está activo ni asignado. Al asignar, el servidor crea la bonificación, el congelamiento y la comisión aparte del precio contratado.</p>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Plantillas</h2>
        <Button size="sm" variant="secondary" onClick={() => setForm({ id: "", code: "", name: "", description: "", status: "draft", config: "{}" })}>Nueva</Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(data.data?.promotions ?? []).map((promo) => (
          <li key={promo.id}>
            <button type="button" className="w-full px-3 py-2 text-left" onClick={() => setForm({ id: promo.id, code: promo.code, name: promo.name, description: promo.description, status: promo.status, config: promo.config })}>
              <span className="font-medium">{promo.name}</span>
              <Badge className="ml-2" tone={promo.status === "active" ? "ok" : "muted"}>{promo.status}</Badge>
              <p className="text-xs text-muted">{promo.code}{promo.description ? ` · ${promo.description}` : ""}</p>
              <p className="break-all font-mono text-[11px] text-muted">{promo.config}</p>
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => {
        e.preventDefault();
        void savePromotion({ data: { ...form, id: form.id || undefined } }).then(() => { toast.success("Promoción guardada"); return recargar(); }).catch((err: Error) => toast.error(err.message));
      }}>
        <Field label="Código" value={form.code} onChange={(code) => setForm({ ...form, code })} />
        <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="Descripción" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <Field label="Configuración JSON" value={form.config} onChange={(config) => setForm({ ...form, config })} />
        <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "draft", label: "Borrador" }, { value: "active", label: "Activa" }, { value: "archived", label: "Archivada" }]} />
        <Button type="submit" className="mt-3 w-full">{form.id ? "Guardar cambios" : "Guardar plantilla"}</Button>
      </form>
      <h2 className="mt-4 font-medium">Ajustes</h2>
      <ul className="mt-2 text-sm">
        {(data.data?.adjustments ?? []).map((item) => (
          <li key={item.id}>{item.tenantName} · {item.kind} · {item.startsOn}{item.endsOn ? ` → ${item.endsOn}` : ""} · {item.status}</li>
        ))}
        {(data.data?.adjustments ?? []).length === 0 ? <li className="text-muted">Todavía no hay bonificaciones, descuentos ni precios congelados.</li> : null}
      </ul>
      <h2 className="mt-4 font-medium">Asignaciones</h2>
      <ul className="mt-2 text-sm">
        {(data.data?.grants ?? []).map((item) => (
          <li key={item.id}>{item.tenantName} · {item.startsOn}{item.endsOn ? ` → ${item.endsOn}` : ""} · {item.status}{item.conditions ? ` · ${item.conditions}` : ""}</li>
        ))}
      </ul>
      <form className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => {
        e.preventDefault();
        void grantPromotion({ data: grant }).then(() => { toast.success("Asignada a ese tenant"); return recargar(); }).catch((err: Error) => toast.error(err.message));
      }}>
        <SelectField label="Promoción activa" value={grant.promotionId} onChange={(promotionId) => setGrant({ ...grant, promotionId })} options={(data.data?.promotions ?? []).filter((p) => p.status === "active").map((p) => ({ value: p.id, label: p.name }))} />
        <SelectField label="Tenant" value={grant.tenantId} onChange={(tenantId) => setGrant({ ...grant, tenantId })} options={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <Field label="Desde" value={grant.startsOn} onChange={(startsOn) => setGrant({ ...grant, startsOn })} type="date" />
        <Field label="Hasta" value={grant.endsOn} onChange={(endsOn) => setGrant({ ...grant, endsOn })} type="date" />
        <Field label="Condiciones" value={grant.conditions} onChange={(conditions) => setGrant({ ...grant, conditions })} />
        <Field label="Referencia del acuerdo" value={grant.evidenceRef} onChange={(evidenceRef) => setGrant({ ...grant, evidenceRef })} />
        <Button type="submit" className="mt-3 w-full">Asignar</Button>
      </form>
    </TorreShell>
  );
}
