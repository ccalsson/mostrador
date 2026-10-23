import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Button } from "@/components/ui/button";
import { listApps, listClients, listExpenses, listPayments, listSubscriptions, saveExpense, savePayment } from "@/lib/torre-fn";
import { listLineas } from "@/lib/torre/control-fn";
import { numerosDeNegocios } from "@/lib/torre/numeros-fn";
import { money } from "@/lib/money";

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

const MESSES = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

const ANIOS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);

function Page() {
  const qc = useQueryClient();
  const pagos = useQuery({ queryKey: ["torre-pagos"], queryFn: () => listPayments() });
  const gastos = useQuery({ queryKey: ["torre-gastos"], queryFn: () => listExpenses() });
  const clientes = useQuery({ queryKey: ["torre-clientes"], queryFn: () => listClients() });
  const subs = useQuery({ queryKey: ["torre-subs"], queryFn: () => listSubscriptions() });
  const apps = useQuery({ queryKey: ["torre-apps"], queryFn: () => listApps() });
  const lineas = useQuery({ queryKey: ["torre-lineas"], queryFn: () => listLineas() });
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const numeros = useQuery({
    queryKey: ["torre-numeros", mes, anio],
    queryFn: () => numerosDeNegocios({ data: { mes, anio } }),
  });
  const [pago, setPago] = useState(false);
  const [gasto, setGasto] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <TorreShell title="Finanzas">
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
                  <span className="text-xs text-muted">{p.clientName} · {p.paymentDate}{p.notes ? ` · ${p.notes}` : ""}{p.comprobanteNombre ? ` · ${p.comprobanteNombre}` : ""}</span>
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
      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <h2 className="font-medium">Numeros por negocio</h2>
          <label className="text-sm">
            <span className="mr-1 text-muted">Mes</span>
            <select
              className="rounded border border-line bg-surface px-2 py-1 text-sm"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
            >
              {MESSES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mr-1 text-muted">Anio</span>
            <select
              className="rounded border border-line bg-surface px-2 py-1 text-sm"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
            >
              {ANIOS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mb-3 text-sm text-muted">Ventas y egresos de la matriz y de cada sucursal. No incluye stock.</p>
        <NumerosTabla
          filas={numeros.data ?? []}
          loading={numeros.isLoading}
        />
      </section>
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

type NumeroFila = {
  negocio: string;
  sucursal: string;
  esMatriz: boolean;
  ventas: number;
  tickets: number;
  egresos: number;
  mercaderia: number;
  resultado: number;
};

function NumerosTabla({ filas, loading }: { filas: NumeroFila[]; loading: boolean }) {
  const totales = useMemo(() => {
    let ventas = 0;
    let tickets = 0;
    let egresos = 0;
    let mercaderia = 0;
    let resultado = 0;
    for (const f of filas) {
      ventas += f.ventas;
      tickets += f.tickets;
      egresos += f.egresos;
      mercaderia += f.mercaderia;
      resultado += f.resultado;
    }
    return {
      ventas: Math.round(ventas * 100) / 100,
      tickets,
      egresos: Math.round(egresos * 100) / 100,
      mercaderia: Math.round(mercaderia * 100) / 100,
      resultado: Math.round(resultado * 100) / 100,
    };
  }, [filas]);

  if (loading) {
    return <p className="py-4 text-sm text-muted">Cargando...</p>;
  }

  if (filas.length === 0) {
    return <p className="py-4 text-sm text-muted">Todavia no hay un puesto vinculado.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-surface text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Negocio</th>
            <th className="px-3 py-2 font-medium">Sucursales</th>
            <th className="px-3 py-2 text-right font-medium">Ventas</th>
            <th className="px-3 py-2 text-right font-medium">Tickets</th>
            <th className="px-3 py-2 text-right font-medium">Egresos</th>
            <th className="px-3 py-2 text-right font-medium">Mercaderia</th>
            <th className="px-3 py-2 text-right font-medium">Resultado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((fila) => (
            <tr key={`${fila.negocio}-${fila.sucursal}`} className="bg-surface">
              <td className="px-3 py-2 font-medium">{fila.negocio}</td>
              <td className="px-3 py-2">
                <span className="text-xs text-muted">{fila.esMatriz ? "Matriz" : "Sucursal"}</span>
                <br />
                {fila.sucursal}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{money(fila.ventas)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fila.tickets}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">- {money(fila.egresos)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{money(fila.mercaderia)}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-medium ${fila.resultado >= 0 ? "text-green-700" : "text-red-700"}`}>
                {money(fila.resultado)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-line bg-surface text-sm font-medium">
          <tr>
            <td className="px-3 py-2" colSpan={2}>Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(totales.ventas)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{totales.tickets}</td>
            <td className="px-3 py-2 text-right tabular-nums text-muted">- {money(totales.egresos)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-muted">{money(totales.mercaderia)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${totales.resultado >= 0 ? "text-green-700" : "text-red-700"}`}>
              {money(totales.resultado)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
