import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listTenants } from "@/lib/torre-fn";
import { listBranches, saveBranch, setBranchStatus } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/sucursales")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-sucursales"], queryFn: () => listBranches() });
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ id: "", tenantId: "", name: "", slug: "", address: "" });
  const abrir = (next: typeof form) => {
    setForm(next);
    setNuevo(true);
  };
  return (
    <TorreShell title="Sucursales">
      <p className="mb-3 text-sm text-muted">La primera sucursal cubierta por el producto base no se cobra. Cada activa de más suma la línea de sucursal extra que calcula el servidor, al precio ya contratado.</p>
      <Button size="sm" onClick={() => abrir({ id: "", tenantId: tenants.data?.[0]?.id ?? "", name: "", slug: "", address: "" })}>Nueva</Button>
      {nuevo ? (
        <form
          className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveBranch({ data: { ...form, id: form.id || undefined } })
              .then(async (res) => {
                toast.success(res.extras > 0 ? `Guardada. Sucursales extra facturables: ${res.extras}.` : "Guardada. Esta sucursal queda incluida.");
                setNuevo(false);
                await qc.invalidateQueries({ queryKey: ["torre-sucursales"] });
              })
              .catch((err: Error) => toast.error(err.message));
          }}
        >
          {form.id ? (
            <p className="text-sm text-muted">Tenant: {(tenants.data ?? []).find((t) => t.id === form.tenantId)?.name ?? form.tenantId}. La sucursal no se muda de tenant.</p>
          ) : (
            <SelectField label="Tenant" value={form.tenantId} onChange={(tenantId) => setForm({ ...form, tenantId })} options={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          )}
          <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
          <Field label="Dirección o referencia" value={form.address} onChange={(address) => setForm({ ...form, address })} />
          <Button type="submit" className="mt-3 w-full">Guardar</Button>
        </form>
      ) : null}
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(lista.data ?? []).map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              <span className="block font-medium">{b.name}</span>
              <span className="text-xs text-muted">{b.tenantName} · {b.slug}{b.address ? ` · ${b.address}` : ""}</span>
              <span className="block text-xs text-muted">desde {b.openedOn}{b.closedOn ? ` · cerrada ${b.closedOn}` : ""}</span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={b.included ? "ok" : "muted"}>{b.included ? "Incluida" : "Adicional"}</Badge>
              <Badge tone={b.status === "active" ? "ok" : "muted"}>{b.status === "active" ? "Activa" : "Inactiva"}</Badge>
              <button
                type="button"
                className="text-xs text-leaf"
                onClick={() => abrir({ id: b.id, tenantId: b.tenantId, name: b.name, slug: b.slug, address: b.address })}
              >
                Editar
              </button>
              <button
                type="button"
                className="text-xs text-terra"
                onClick={() => {
                  const next = b.status === "active" ? "inactive" : "active";
                  if (next === "inactive" && !window.confirm(`¿Desactivar ${b.name}?`)) return;
                  void setBranchStatus({ data: { id: b.id, status: next } })
                    .then(() => qc.invalidateQueries({ queryKey: ["torre-sucursales"] }))
                    .catch((err: Error) => toast.error(err.message));
                }}
              >
                {b.status === "active" ? "Desactivar" : "Activar"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </TorreShell>
  );
}
