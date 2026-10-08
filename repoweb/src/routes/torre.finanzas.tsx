import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Button } from "@/components/ui/button";
import { listApps, listClients, listExpenses, listPayments, listSubscriptions, saveExpense, savePayment } from "@/lib/torre-fn";
import { listLineas, listProducts } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/finanzas")({ component: Page });

const CATS = [
  { value: "hosting", label: "Hosting" },
  { value: "database", label: "Base de datos" },
  { value: "domain", label: "Dominios" },
  { value: "ai", label: "Servicios de IA" },
  { value: "tools", label: "Herramientas" },
  { value: "api", label: "APIs" },
  { value: "other", label: "Otros" },
];

function Page() {
  const qc = useQueryClient();
  const pagos = useQuery({ queryKey: ["torre-pagos"], queryFn: () => listPayments() });
  const gastos = useQuery({ queryKey: ["torre-gastos"], queryFn: () => listExpenses() });
  const clientes = useQuery({ queryKey: ["torre-clientes"], queryFn: () => listClients() });
  const subs = useQuery({ queryKey: ["torre-subs"], queryFn: () => listSubscriptions() });
  const apps = useQuery({ queryKey: ["torre-apps"], queryFn: () => listApps() });
  const lineas = useQuery({ queryKey: ["torre-lineas"], queryFn: () => listLineas() });
  const productos = useQuery({ queryKey: ["torre-productos"], queryFn: () => listProducts() });
  const comisiones = (productos.data ?? []).filter((p) => p.kind === "commission");
  const [pago, setPago] = useState(false);
  const [gasto, setGasto] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <TorreShell title="Finanzas">
      <section className="mb-4">
        <h2 className="font-medium">Comisiones de catálogo</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted">Torre muestra la condición cargada. No calcula un importe de comisión ni cobra solo.</p>
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
          {comisiones.map((p) => (
            <li key={p.id} className="px-3 py-2">
              <span className="font-medium">{p.name}</span>
              <span className="ml-2 text-xs text-muted">{p.slug} · {p.status} · {p.billing}</span>
              <p className="text-xs text-muted">{p.description}</p>
              <p className="break-all font-mono text-[11px] text-muted">{p.configJson}</p>
            </li>
          ))}
          {comisiones.length === 0 ? <li className="px-3 py-3 text-muted">No hay un producto de comisión en el catálogo.</li> : null}
        </ul>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">Ingresos</h2>
            <Button size="sm" onClick={() => setPago((v) => !v)}>Registrar</Button>
          </div>
          {pago ? (
            <PagoForm
              clientes={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              subs={[{ value: "", label: "Sin suscripción" }, ...(subs.data ?? []).map((s) => ({ value: s.id, label: s.tenantName }))]}
              lineas={(lineas.data ?? []).map((l) => ({ value: l.id, label: `${l.tenantName} · ${l.productName}`, subscriptionId: l.subscriptionId, tenantId: l.tenantId, productId: l.productId }))}
              hoy={hoy}
              clientId={clientes.data?.[0]?.id ?? ""}
              onSave={async (data) => {
                await savePayment({ data });
                toast.success("Ingreso registrado");
                setPago(false);
                await qc.invalidateQueries({ queryKey: ["torre-pagos"] });
              }}
            />
          ) : null}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(pagos.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2">
                <span>
                  <span className="block font-medium">{p.concept}</span>
                  <span className="text-xs text-muted">{p.clientName} · {p.paymentDate}</span>
                </span>
                <span>
                  <span className="block tabular-nums">{p.currency} {p.amount}</span>
                  <span className="block text-xs text-muted">{p.kind} · {p.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">Gastos</h2>
            <Button size="sm" onClick={() => setGasto((v) => !v)}>Registrar</Button>
          </div>
          {gasto ? (
            <GastoForm
              apps={[{ value: "", label: "General" }, ...(apps.data ?? []).map((a) => ({ value: a.id, label: a.name }))]}
              hoy={hoy}
              onSave={async (data) => {
                await saveExpense({ data });
                toast.success("Gasto registrado");
                setGasto(false);
                await qc.invalidateQueries({ queryKey: ["torre-gastos"] });
              }}
            />
          ) : null}
          <p className="mb-2 text-xs text-muted">El gasto no tiene moneda en el registro. El número se muestra tal cual.</p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(gastos.data ?? []).map((g) => (
              <li key={g.id} className="flex items-center justify-between px-3 py-2">
                <span>
                  <span className="block font-medium">{g.concept}</span>
                  <span className="text-xs text-muted">{g.provider || g.appName || "General"} · {g.frequency}</span>
                </span>
                <span className="tabular-nums">{g.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TorreShell>
  );
}

function PagoForm({
  clientes,
  subs,
  lineas,
  hoy,
  clientId,
  onSave,
}: {
  clientes: { value: string; label: string }[];
  subs: { value: string; label: string }[];
  lineas: { value: string; label: string; subscriptionId: string; tenantId: string; productId: string }[];
  hoy: string;
  clientId: string;
  onSave: (data: {
    clientId: string;
    subscriptionId: string;
    amount: number;
    paymentDate: string;
    concept: string;
    status: string;
    notes: string;
    tenantId: string;
    productId: string;
    lineId: string;
    kind: string;
    currency: string;
    applyPeriod: boolean;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    clientId,
    subscriptionId: "",
    lineId: "",
    tenantId: "",
    productId: "",
    amount: "",
    paymentDate: hoy,
    concept: "",
    status: "paid",
    notes: "",
    kind: "mensualidad",
    currency: "USD",
    applyPeriod: true,
  });
  return (
    <form className="mb-3 rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); void onSave({ ...form, amount: Number(form.amount) || 0 }).catch((err: Error) => toast.error(err.message)); }}>
      <SelectField label="Cliente" value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} options={clientes} />
      <SelectField label="Suscripción" value={form.subscriptionId} onChange={(v) => setForm({ ...form, subscriptionId: v })} options={subs} />
      <SelectField
        label="Línea"
        value={form.lineId}
        onChange={(v) => {
          const line = lineas.find((item) => item.value === v);
          setForm({
            ...form,
            lineId: v,
            subscriptionId: line?.subscriptionId || form.subscriptionId,
            tenantId: line?.tenantId || "",
            productId: line?.productId || "",
          });
        }}
        options={[{ value: "", label: "Sin línea" }, ...lineas]}
      />
      <SelectField label="Tipo" value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[
        { value: "instalacion", label: "Instalación" },
        { value: "mensualidad", label: "Mensualidad" },
        { value: "addon", label: "Add-on" },
        { value: "sucursal", label: "Sucursal" },
        { value: "mercado", label: "Mercado al Toque" },
        { value: "publicidad", label: "Publicidad" },
        { value: "push", label: "Push" },
        { value: "otro", label: "Otro" },
      ]} />
      <Field label="Concepto" value={form.concept} onChange={(concept) => setForm({ ...form, concept })} />
      <Field label="Importe" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} type="number" />
      <SelectField label="Moneda" value={form.currency} onChange={(currency) => setForm({ ...form, currency })} options={[{ value: "USD", label: "USD" }, { value: "ARS", label: "ARS" }]} />
      <Field label="Fecha" value={form.paymentDate} onChange={(paymentDate) => setForm({ ...form, paymentDate })} type="date" />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "paid", label: "Cobrado" }, { value: "pending", label: "Pendiente" }, { value: "void", label: "Anulado" }]} />
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.applyPeriod} onChange={(e) => setForm({ ...form, applyPeriod: e.target.checked })} />
        Correr el vencimiento según la frecuencia de la línea
      </label>
      <Button type="submit" className="mt-3 w-full">Guardar ingreso</Button>
    </form>
  );
}

function GastoForm({
  apps,
  hoy,
  onSave,
}: {
  apps: { value: string; label: string }[];
  hoy: string;
  onSave: (data: { appId: string; concept: string; provider: string; amount: number; frequency: string; category: string; expenseDate: string; notes: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ appId: "", concept: "", provider: "", amount: "", frequency: "monthly", category: "hosting", expenseDate: hoy, notes: "" });
  return (
    <form className="mb-3 rounded-lg border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); void onSave({ ...form, amount: Number(form.amount) || 0 }).catch((err: Error) => toast.error(err.message)); }}>
      <SelectField label="Aplicación" value={form.appId} onChange={(appId) => setForm({ ...form, appId })} options={apps} />
      <SelectField label="Rubro" value={form.category} onChange={(category) => setForm({ ...form, category })} options={CATS} />
      <Field label="Concepto" value={form.concept} onChange={(concept) => setForm({ ...form, concept })} />
      <Field label="Proveedor" value={form.provider} onChange={(provider) => setForm({ ...form, provider })} />
      <Field label="Importe" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} type="number" />
      <SelectField label="Frecuencia" value={form.frequency} onChange={(frequency) => setForm({ ...form, frequency })} options={[{ value: "monthly", label: "Mensual" }, { value: "yearly", label: "Anual" }, { value: "once", label: "Único" }]} />
      <Field label="Fecha" value={form.expenseDate} onChange={(expenseDate) => setForm({ ...form, expenseDate })} type="date" />
      <Button type="submit" className="mt-3 w-full">Guardar gasto</Button>
    </form>
  );
}
