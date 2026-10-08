import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listClients, listPlans, listSubscriptions, listTenants, saveSubscription } from "@/lib/torre-fn";
import { serviciosDeTenant } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/suscripciones")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-subs"], queryFn: () => listSubscriptions() });
  const clientes = useQuery({ queryKey: ["torre-clientes"], queryFn: () => listClients() });
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const planes = useQuery({ queryKey: ["torre-planes"], queryFn: () => listPlans() });
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((s) => s.id === sel) : null;
  const hoy = new Date().toISOString().slice(0, 10);
  const lineas = useQuery({
    queryKey: ["torre-servicios", actual?.tenantId],
    queryFn: () => serviciosDeTenant({ data: actual?.tenantId ?? "" }),
    enabled: Boolean(actual?.tenantId),
  });
  const inicial = actual
    ? {
        clientId: actual.clientId,
        tenantId: actual.tenantId,
        planId: actual.planId,
        monthlyPrice: String(actual.monthlyPrice),
        status: actual.status,
        startDate: actual.startDate,
        nextPaymentDate: actual.nextPaymentDate,
      }
    : {
        clientId: clientes.data?.[0]?.id ?? "",
        tenantId: tenants.data?.[0]?.id ?? "",
        planId: planes.data?.[0]?.id ?? "",
        monthlyPrice: String(planes.data?.[0]?.monthlyPrice ?? 0),
        status: "active",
        startDate: hoy,
        nextPaymentDate: "",
      };
  return (
    <TorreShell title="Suscripciones">
      <p className="mb-3 max-w-2xl text-sm text-muted">El estado sale de acá. El importe del encabezado no es el precio del puesto: implementación, abono y add-ons viven en las líneas. Una bonificación no los pisa.</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <Button size="sm" onClick={() => setSel("nuevo")}>Nueva</Button>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).map((s) => (
              <li key={s.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setSel(s.id)}>
                  <span>
                    <span className="block font-medium">{s.tenantName}</span>
                    <span className="text-xs text-muted">{s.clientName} · {s.planName} · próx. {s.nextPaymentDate || "—"}</span>
                  </span>
                  <span className="text-right">
                    <span className="block tabular-nums">{s.planCurrency} {s.monthlyPrice}</span>
                    <Badge tone={s.status === "active" ? "ok" : "muted"}>{s.status}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {actual ? (
            <div className="mt-3 text-xs text-muted">
              <p>Líneas de este tenant. Contratado y a cobrar salen del servidor.</p>
              {lineas.data ? <p className="mt-1">A cobrar este mes: {Object.keys(lineas.data.monthlyDue).length ? Object.entries(lineas.data.monthlyDue).map(([moneda, valor]) => `${moneda} ${valor}`).join(" · ") : "0"}</p> : null}
              <ul className="mt-2 space-y-1">
                {(lineas.data?.lines ?? []).map((line) => (
                  <li key={line.id}>
                    {line.productName} · {line.charge} · {line.frequency} · contratado {line.currency} {line.unitPrice} · a cobrar {line.currency} {line.amountDue} · {line.status}
                    {line.frozen ? " · congelado" : ""}
                    {line.startsOn ? ` · ${line.startsOn}` : ""}
                    {line.endsOn ? ` → ${line.endsOn}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {sel ? (
          <Forma
            key={actual?.id ?? "nuevo"}
            inicial={inicial}
            clientes={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            tenants={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            planes={(planes.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            onClose={() => setSel(null)}
            onSave={async (data) => {
              await saveSubscription({
                data: {
                  id: actual?.id,
                  clientId: data.clientId,
                  tenantId: data.tenantId,
                  planId: data.planId,
                  monthlyPrice: Number(data.monthlyPrice) || 0,
                  status: data.status,
                  startDate: data.startDate,
                  nextPaymentDate: data.nextPaymentDate,
                },
              });
              toast.success("Suscripción guardada");
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
  clientes,
  tenants,
  planes,
  onSave,
  onClose,
}: {
  inicial: { clientId: string; tenantId: string; planId: string; monthlyPrice: string; status: string; startDate: string; nextPaymentDate: string };
  clientes: { value: string; label: string }[];
  tenants: { value: string; label: string }[];
  planes: { value: string; label: string }[];
  onSave: (data: typeof inicial) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [busy, setBusy] = useState(false);
  return (
    <form className="rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); setBusy(true); void onSave(form).catch((err: Error) => toast.error(err.message)).finally(() => setBusy(false)); }}>
      <div className="flex justify-between"><h2 className="font-medium">Ficha</h2><button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button></div>
      <SelectField label="Cliente" value={form.clientId} onChange={(clientId) => setForm({ ...form, clientId })} options={clientes} />
      <SelectField label="Tenant" value={form.tenantId} onChange={(tenantId) => setForm({ ...form, tenantId })} options={tenants} />
      <SelectField label="Plan" value={form.planId} onChange={(planId) => setForm({ ...form, planId })} options={planes} />
      <Field label="Precio mensual" value={form.monthlyPrice} onChange={(monthlyPrice) => setForm({ ...form, monthlyPrice })} type="number" />
      <Field label="Inicio" value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate })} type="date" />
      <Field label="Próximo pago" value={form.nextPaymentDate} onChange={(nextPaymentDate) => setForm({ ...form, nextPaymentDate })} type="date" />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "pending", label: "Pendiente" }, { value: "active", label: "Activa" }, { value: "past_due", label: "Vencida" }, { value: "paused", label: "Pausada" }, { value: "suspended", label: "Suspendida" }, { value: "cancelled", label: "Cancelada" }]} />
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
    </form>
  );
}
