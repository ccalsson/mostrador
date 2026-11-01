import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listTenants } from "@/lib/torre-fn";
import { grantPromotion, listPromotions, savePromotion } from "@/lib/torre/legal-fn";
import { listProducts } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/promociones")({ component: Page });

function vacia() {
  return { id: "", code: "", name: "", description: "", status: "draft", bonusMonths: "", frozenMonths: "", discountPercent: "", commissionPercent: "", slugs: [] as string[], extras: {} as Record<string, unknown> };
}

function leerPromo(raw: string) {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
  } catch {
    obj = {};
  }
  const slugs = Array.isArray(obj.productSlugs) ? obj.productSlugs.map(String) : [];
  const extras = { ...obj };
  for (const clave of ["bonusMonths", "frozenMonths", "discountPercent", "commissionPercent", "productSlugs"]) delete extras[clave];
  return {
    bonusMonths: obj.bonusMonths == null ? "" : String(obj.bonusMonths),
    frozenMonths: obj.frozenMonths == null ? "" : String(obj.frozenMonths),
    discountPercent: obj.discountPercent == null ? "" : String(obj.discountPercent),
    commissionPercent: obj.commissionPercent == null ? "" : String(obj.commissionPercent),
    slugs,
    extras,
  };
}

function escribirPromo(form: ReturnType<typeof vacia>) {
  const out: Record<string, unknown> = { ...form.extras };
  const numero = (valor: string) => (valor.trim() === "" || !Number.isFinite(Number(valor)) ? null : Number(valor));
  const bonus = numero(form.bonusMonths);
  const frozen = numero(form.frozenMonths);
  const discount = numero(form.discountPercent);
  const commission = numero(form.commissionPercent);
  if (bonus != null && bonus > 0) out.bonusMonths = bonus;
  if (frozen != null && frozen > 0) out.frozenMonths = frozen;
  if (discount != null) out.discountPercent = discount;
  if (commission != null) out.commissionPercent = commission;
  if (form.slugs.length) out.productSlugs = form.slugs;
  return JSON.stringify(out);
}

function resumenPromo(raw: string) {
  const promo = leerPromo(raw);
  return [
    promo.bonusMonths ? `${promo.bonusMonths} meses bonificados` : "",
    promo.frozenMonths ? `${promo.frozenMonths} meses con precio congelado` : "",
    promo.discountPercent !== "" ? `${promo.discountPercent}% de descuento` : "",
    promo.commissionPercent !== "" ? `comisión ${promo.commissionPercent}%` : "",
    promo.slugs.join(", "),
  ].filter(Boolean).join(" · ") || "Sin beneficio cargado";
}

function Page() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["torre-promos"], queryFn: () => listPromotions() });
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const productos = useQuery({ queryKey: ["torre-productos"], queryFn: () => listProducts() });
  const [form, setForm] = useState(vacia);
  const [grant, setGrant] = useState({ promotionId: "", tenantId: "", startsOn: new Date().toISOString().slice(0, 10), endsOn: "", conditions: "", evidenceRef: "" });
  const recargar = () => qc.invalidateQueries({ queryKey: ["torre-promos"] });
  const catalogo = [
    ...(productos.data ?? []).map((item) => ({ slug: item.slug, nombre: item.name })),
    ...form.slugs.filter((slug) => !(productos.data ?? []).some((item) => item.slug === slug)).map((slug) => ({ slug, nombre: slug })),
  ];
  const alternar = (slug: string) => {
    const slugs = form.slugs.includes(slug) ? form.slugs.filter((item) => item !== slug) : [...form.slugs, slug];
    setForm({ ...form, slugs });
  };
  return (
    <TorreShell title="Promociones">
      <p className="mb-3 text-sm text-muted">Una plantilla no beneficia a nadie hasta asignarla a un tenant. Fundador no está activo ni asignado. Al asignar, el servidor crea la bonificación, el congelamiento y la comisión aparte del precio contratado.</p>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Plantillas</h2>
        <Button size="sm" variant="secondary" onClick={() => setForm(vacia())}>Nueva</Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(data.data?.promotions ?? []).map((promo) => (
          <li key={promo.id}>
            <button type="button" className="w-full px-3 py-2 text-left" onClick={() => setForm({ id: promo.id, code: promo.code, name: promo.name, description: promo.description, status: promo.status, ...leerPromo(promo.config) })}>
              <span className="font-medium">{promo.name}</span>
              <Badge className="ml-2" tone={promo.status === "active" ? "ok" : "muted"}>{promo.status}</Badge>
              <p className="text-xs text-muted">{promo.code}{promo.description ? ` · ${promo.description}` : ""}</p>
              <p className="text-xs text-muted">{resumenPromo(promo.config)}</p>
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => {
        e.preventDefault();
        void savePromotion({ data: { id: form.id || undefined, code: form.code, name: form.name, description: form.description, status: form.status, config: escribirPromo(form) } }).then(() => { toast.success("Promoción guardada"); return recargar(); }).catch((err: Error) => toast.error(err.message));
      }}>
        <Field label="Código" value={form.code} onChange={(code) => setForm({ ...form, code })} />
        <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="Descripción" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <Field label="Meses bonificados" value={form.bonusMonths} onChange={(bonusMonths) => setForm({ ...form, bonusMonths })} type="number" />
        <Field label="Meses con precio congelado" value={form.frozenMonths} onChange={(frozenMonths) => setForm({ ...form, frozenMonths })} type="number" />
        <Field label="Descuento %" value={form.discountPercent} onChange={(discountPercent) => setForm({ ...form, discountPercent })} type="number" />
        <Field label="Comisión % (vacío = no cambia)" value={form.commissionPercent} onChange={(commissionPercent) => setForm({ ...form, commissionPercent })} type="number" />
        <p className="mt-3 text-sm font-medium">Aplica a estos productos</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {catalogo.map((item) => {
            const activo = form.slugs.includes(item.slug);
            return (
              <button key={item.slug} type="button" className={activo ? "rounded-md bg-btn px-2 py-1 text-xs text-btn-fg" : "rounded-md border border-line px-2 py-1 text-xs"} onClick={() => alternar(item.slug)}>
                {item.nombre}
              </button>
            );
          })}
          {catalogo.length === 0 ? <p className="text-xs text-muted">No hay productos en el catálogo.</p> : null}
        </div>
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
