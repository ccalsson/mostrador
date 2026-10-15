import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { estadisticasCliente, listClients, saveClient } from "@/lib/torre-fn";
import { money } from "@/lib/money";
import { ESTADO_LABEL, PAGO_LABEL, type FormaPago, type PedidoEstado } from "@/lib/types";

export const Route = createFileRoute("/torre/clientes")({ component: Page });

const VACIO = { name: "", businessName: "", contactName: "", phone: "", email: "", notes: "", status: "active" };
type Cliente = typeof VACIO & { id: string };
type Rango = 1 | 7 | 30;

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-clientes"], queryFn: () => listClients() });
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const actual = sel && sel !== "nuevo" ? (lista.data ?? []).find((c) => c.id === sel) : null;
  return (
    <TorreShell title="Clientes">
      <p className="mb-3 text-sm text-muted">Cada cliente puede tener varios negocios. La ficha queda abajo de las cifras.</p>
      <div className="mx-auto grid w-full max-w-6xl items-start gap-4 xl:grid-cols-[15rem_minmax(0,32rem)_17rem]">
        <div>
          <Button size="sm" onClick={() => setSel("nuevo")}>Nuevo</Button>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data ?? []).map((c) => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setSel(c.id)}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted">{c.businessName || c.email || "Sin datos"}</span>
                  </span>
                  <Badge tone={c.status === "active" ? "ok" : "muted"}>{c.status === "active" ? "Activo" : c.status === "paused" ? "Pausado" : "Archivado"}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {sel === "nuevo" ? (
          <Forma
            key="nuevo"
            inicial={VACIO}
            onClose={() => setSel(null)}
            onSave={async (data) => {
              await saveClient({ data });
              toast.success("Cliente guardado");
              await qc.invalidateQueries({ queryKey: ["torre-clientes"] });
              setSel(null);
            }}
          />
        ) : actual ? (
          <Estadisticas
            cliente={actual}
            onSave={async (data) => {
              await saveClient({ data: { ...data, id: actual.id } });
              toast.success("Cliente guardado");
              await qc.invalidateQueries({ queryKey: ["torre-clientes"] });
            }}
          />
        ) : (
          <p className="text-sm text-muted">Elegí un cliente para ver cómo paga y cómo vende.</p>
        )}
      </div>
    </TorreShell>
  );
}

function Estadisticas({ cliente, onSave }: { cliente: Cliente; onSave: (data: typeof VACIO) => Promise<void> }) {
  const [dias, setDias] = useState<Rango>(30);
  const data = useQuery({
    queryKey: ["torre-cliente-stats", cliente.id, dias],
    queryFn: () => estadisticasCliente({ data: { clientId: cliente.id, dias } }),
  });
  const d = data.data;
  const abono = (d?.abono ?? []).map((row) => plata(row.currency, row.monto)).join(" · ") || "0";
  const cobrado = sumar(d?.pagos ?? [], "paid");
  const pendiente = sumar(d?.pagos ?? [], "pending");
  const vendido = (d?.operacion ?? [])
    .filter((row) => row.estado === "cobrado" || row.estado === "entregado")
    .reduce((acc, row) => acc + row.monto, 0);
  const mostrador = (d?.operacion ?? []).filter((row) => row.origen === "mostrador").reduce((acc, row) => acc + row.n, 0);
  const mercado = (d?.operacion ?? []).filter((row) => row.origen === "mercado").reduce((acc, row) => acc + row.n, 0);

  return (
      <div className="grid items-start gap-4 xl:contents">
      <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">{cliente.name}</h2>
          <p className="text-sm text-muted">{cliente.businessName || "Sin razón social"}</p>
        </div>
        <div className="flex rounded-md bg-paper-2 p-1">
          {(
            [
              [1, "Hoy"],
              [7, "7 días"],
              [30, "30 días"],
            ] as const
          ).map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setDias(valor)}
              className={valor === dias ? "h-8 rounded-md bg-surface px-3 text-sm" : "h-8 px-3 text-sm text-muted"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {data.error ? <p className="text-sm text-terra">{(data.error as Error).message}</p> : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Negocios" value={String(d?.negocios.length ?? "…")} />
        <Kpi label="Abono mensual" value={d ? abono : "…"} />
        <Kpi label="Nos pagó" value={d ? cobrado : "…"} hint="En el período" />
        <Kpi label="Nos debe" value={d ? pendiente : "…"} hint="Cobros pendientes" />
      </div>

      <section className="rounded-lg border border-line bg-surface p-3 xl:hidden">
        <h3 className="font-medium">Lo que nos paga</h3>
        <div className="mt-3 grid gap-4">
          <Mini titulo="USD" dataKey="usd" color="var(--color-leaf)" filas={d?.serie ?? []} />
          <Mini titulo="ARS" dataKey="ars" color="var(--color-ambar)" filas={d?.serie ?? []} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-3">
          <h3 className="font-medium">Negocios</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(d?.negocios ?? []).length === 0 ? <li className="py-2 text-muted">Todavía no tiene negocios.</li> : null}
            {(d?.negocios ?? []).map((row) => (
              <li key={`${row.nombre}-${row.app}`} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="block">{row.nombre}</span>
                  <span className="text-xs text-muted">{row.app} · {row.version || "sin versión"}</span>
                </span>
                <span className="text-muted">{row.estado === "active" ? "Activo" : "Inactivo"}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-line bg-surface p-3">
          <h3 className="font-medium">Lo que vende</h3>
          <p className="mt-1 text-sm text-muted">
            {money(vendido)} en pedidos cerrados · {mostrador} de mostrador · {mercado} de Mercado
          </p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(d?.operacion ?? []).length === 0 ? <li className="py-2 text-muted">Sin operación vinculada en este período.</li> : null}
            {(d?.operacion ?? []).map((row) => (
              <li key={`${row.origen}-${row.estado}`} className="flex justify-between gap-3 py-2">
                <span>{row.origen === "mercado" ? "Mercado" : "Mostrador"} · {ESTADO_LABEL[row.estado as PedidoEstado] ?? row.estado}</span>
                <span className="tabular-nums text-muted">{row.n} · {money(row.monto)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-line bg-surface p-3 xl:col-span-2 xl:hidden">
          <h3 className="font-medium">Medios de pago de sus puestos</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(d?.medios ?? []).length === 0 ? <li className="py-2 text-muted">Sin cobros en los puestos.</li> : null}
            {(d?.medios ?? []).map((row) => (
              <li key={row.forma} className="flex justify-between gap-3 py-2">
                <span>{PAGO_LABEL[row.forma as FormaPago] ?? row.forma}</span>
                <span className="tabular-nums text-muted">{row.n} · {money(row.monto)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <details className="rounded-lg border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium">Ficha</summary>
        <Forma key={cliente.id} inicial={cliente} onSave={onSave} />
      </details>
      </div>
      <aside className="hidden space-y-4 xl:block">
        <section className="rounded-lg border border-line bg-surface p-3">
          <h3 className="text-sm font-medium">Lo que nos paga</h3>
          <Mini titulo="USD" dataKey="usd" color="var(--color-leaf)" filas={d?.serie ?? []} />
          <Mini titulo="ARS" dataKey="ars" color="var(--color-ambar)" filas={d?.serie ?? []} />
        </section>
        <Barras
          titulo="Medios de pago"
          filas={(d?.medios ?? []).map((row) => ({ nombre: PAGO_LABEL[row.forma as FormaPago] ?? row.forma, valor: row.monto }))}
        />
        <Barras
          titulo="Pedidos del puesto"
          filas={(d?.operacion ?? []).map((row) => ({
            nombre: `${row.origen === "mercado" ? "Mercado" : "Mostrador"} ${ESTADO_LABEL[row.estado as PedidoEstado] ?? row.estado}`,
            valor: row.n,
          }))}
        />
      </aside>
      </div>
  );
}

function sumar(rows: { currency: string; estado: string; monto: number }[], estado: string) {
  const partes = rows.filter((row) => row.estado === estado);
  if (partes.length === 0) return "0";
  return partes.map((row) => plata(row.currency, row.monto)).join(" · ");
}

function plata(currency: string, amount: number) {
  if (currency === "ARS") return money(amount);
  return `USD ${amount}`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Mini({
  titulo,
  dataKey,
  color,
  filas,
}: {
  titulo: string;
  dataKey: "usd" | "ars";
  color: string;
  filas: { dia: string; usd: number; ars: number }[];
}) {
  return (
    <div>
      <p className="text-sm text-muted">{titulo}</p>
      <div className="mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas}>
            <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} interval={4} />
            <YAxis stroke="var(--color-muted)" fontSize={11} width={32} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value) => [value, titulo]}
              labelFormatter={(label) => diaCorto(String(label))}
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8 }}
            />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Barras({ titulo, filas }: { titulo: string; filas: { nombre: string; valor: number }[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {filas.length === 0 ? <p className="mt-2 text-sm text-muted">Sin datos en este período.</p> : (
        <div className="mt-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={filas} margin={{ left: 4, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="nombre" width={88} stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8 }} />
              <Bar dataKey="valor" name="Total" fill="var(--color-ambar)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function diaCorto(iso: string) {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

function Forma({
  inicial,
  onSave,
  onClose,
}: {
  inicial: typeof VACIO;
  onSave: (data: typeof VACIO) => Promise<void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="rounded-lg border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void onSave(form).catch((err: Error) => toast.error(err.message)).finally(() => setBusy(false));
      }}
    >
      <div className="flex justify-between">
        <h2 className="font-medium">Datos</h2>
        {onClose ? <button type="button" className="text-xs text-muted" onClick={onClose}>Cerrar</button> : null}
      </div>
      <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Razón social" value={form.businessName} onChange={(businessName) => setForm({ ...form, businessName })} />
      <Field label="Contacto" value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} />
      <Field label="Teléfono" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
      <Field label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
      <Field label="Notas" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
      <SelectField label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[{ value: "active", label: "Activo" }, { value: "paused", label: "Pausado" }, { value: "archived", label: "Archivado" }]} />
      <Button type="submit" className="mt-3 w-full" disabled={busy}>Guardar</Button>
    </form>
  );
}
