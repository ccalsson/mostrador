import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONDICION_LABEL, type Condicion } from "@/lib/afip-calc";
import { PAGO_LABEL, type FormaPago } from "@/lib/types";
import {
  anotarPagoCuenta,
  estadisticasCompradorApp,
  guardarCliente,
  listarClientes,
  listarCompradoresApp,
  movimientosCliente,
  sumarCompradorApp,
} from "@/lib/portal-fn";
import { canalMercado } from "@/lib/fn";
import { money } from "@/lib/money";

export const Route = createFileRoute("/clientes-app")({ component: Page });

const CONDICIONES = Object.keys(CONDICION_LABEL) as Condicion[];

function identidad(valor: string) {
  if (valor === "documentacion_cargada") return "Documentación cargada";
  if (valor === "rechazada") return "Documentación rechazada";
  if (valor === "aprobada") return "Identidad aprobada";
  return "Sin documento";
}

function forma(valor: string) {
  if (valor in PAGO_LABEL) return PAGO_LABEL[valor as FormaPago];
  if (valor === "sin_informar") return "Sin informar";
  return valor;
}

function cuando(valor: string | null) {
  if (!valor) return "Sin compras";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function Page() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ["compradores-app", q],
    queryFn: () => listarCompradoresApp({ data: { busca: q } }),
  });
  const fichas = useQuery({ queryKey: ["fichas-clientes"], queryFn: () => listarClientes() });
  const canal = useQuery({ queryKey: ["canal-mercado"], queryFn: () => canalMercado() });
  const elegido = (lista.data?.compradores ?? []).find((item) => item.userId === userId) ?? null;
  const ficha = (fichas.data ?? []).find((item) => item.id === elegido?.clienteId) ?? null;

  const sumar = useMutation({
    mutationFn: (id: string) => sumarCompradorApp({ data: { userId: id } }),
    onSuccess: async () => {
      toast.success("Quedó en tu lista de clientes.");
      await qc.invalidateQueries({ queryKey: ["compradores-app"] });
      await qc.invalidateQueries({ queryKey: ["fichas-clientes"] });
      await qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="De la app">
      <div className="mx-auto grid w-full max-w-5xl items-start gap-4 lg:grid-cols-[minmax(0,36rem)_22rem]">
        <section>
          <p className="mb-2 text-sm text-muted">
            Compradores de Mercado al Toque. Sumalos a tu lista y después se manejan como cualquier cliente: ficha, cuenta, saldo y estadísticas.
          </p>
          <form
            className="mb-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(busca.trim());
            }}
          >
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre, mail o teléfono" />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
          {lista.error ? <p className="text-sm text-terra">{(lista.error as Error).message}</p> : null}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {(lista.data?.compradores ?? []).length === 0 && !lista.isPending ? (
              <li className="px-3 py-4 text-muted">No hay compradores de la app.</li>
            ) : null}
            {(lista.data?.compradores ?? []).map((item) => (
              <li key={item.userId}>
                <button
                  type="button"
                  onClick={() => setUserId(item.userId)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.nombre}</span>
                    <span className="block truncate text-xs text-muted">
                      {item.email}
                      {item.pedidos ? ` · ${item.pedidos} pedidos` : " · sin pedidos"}
                    </span>
                  </span>
                  {item.enLista ? <Badge tone="ok">En tu lista</Badge> : <Badge tone="muted">Solo app</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </section>
        {elegido ? (
          <aside className="space-y-3">
            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="font-display text-lg font-semibold">{elegido.nombre}</h2>
              <p className="mt-1 text-sm text-muted">{elegido.email}</p>
              <p className="text-sm text-muted">{elegido.telefono || "Sin teléfono en la app"}</p>
              <p className="text-sm text-muted">{identidad(elegido.identidad)}</p>
              {!elegido.enLista ? (
                <Button className="mt-3 w-full" disabled={sumar.isPending} onClick={() => sumar.mutate(elegido.userId)}>
                  Agregar a mis clientes
                </Button>
              ) : (
                <p className="mt-2 text-xs text-muted">Ya está en Clientes. La ficha de abajo es la del puesto.</p>
              )}
            </section>
            <Estadisticas userId={elegido.userId} />
            {ficha ? (
              <Ficha
                ficha={ficha}
                permiteCuenta={canal.data?.cuentaCorriente === true || lista.data?.puedeCuenta === true}
                onSaved={async () => {
                  toast.success("Ficha guardada");
                  await qc.invalidateQueries({ queryKey: ["fichas-clientes"] });
                  await qc.invalidateQueries({ queryKey: ["compradores-app"] });
                  await qc.invalidateQueries({ queryKey: ["clientes"] });
                  await qc.invalidateQueries({ queryKey: ["movs-cliente", ficha.id] });
                }}
              />
            ) : null}
          </aside>
        ) : (
          <p className="hidden text-sm text-muted lg:block">Elegí un comprador para ver sus estadísticas y gestionarlo.</p>
        )}
      </div>
    </AppShell>
  );
}

function Estadisticas({ userId }: { userId: string }) {
  const stats = useQuery({
    queryKey: ["stats-app", userId],
    queryFn: () => estadisticasCompradorApp({ data: userId }),
  });
  const s = stats.data;
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h2 className="font-medium">Estadísticas en este puesto</h2>
      {stats.error ? <p className="mt-2 text-sm text-terra">{(stats.error as Error).message}</p> : null}
      {stats.isPending ? <p className="mt-2 text-sm text-muted">Leyendo…</p> : null}
      {s ? (
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <Dato label="Pedidos" valor={String(s.pedidos)} />
          <Dato label="Importe" valor={money(s.total)} />
          <Dato label="Cobrados o listos" valor={String(s.cobrados)} />
          <Dato label="En curso" valor={String(s.enCurso)} />
          <Dato label="Anulados" valor={String(s.anulados)} />
          <Dato label="Última compra" valor={cuando(s.ultimo)} />
        </dl>
      ) : null}
      {s && s.formas.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {s.formas.map((item) => (
            <li key={item.forma}>
              {forma(item.forma)} · {item.cantidad} · {money(item.total)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

function Ficha({
  ficha,
  permiteCuenta,
  onSaved,
}: {
  ficha: Awaited<ReturnType<typeof listarClientes>>[number];
  permiteCuenta: boolean;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(ficha);
  const [clave, setClave] = useState(ficha.id);
  const [pago, setPago] = useState("");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const movs = useQuery({
    queryKey: ["movs-cliente", ficha.id],
    queryFn: () => movimientosCliente({ data: ficha.id }),
  });
  if (ficha.id !== clave) {
    setClave(ficha.id);
    setForm(ficha);
  }
  return (
    <form
      className="rounded-lg border border-line border-t-2 border-t-naranja bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.nombre.trim()) {
          toast.error("El nombre es obligatorio.");
          return;
        }
        setBusy(true);
        void guardarCliente({
          data: {
            id: ficha.id,
            nombre: form.nombre,
            telefono: form.telefono ?? "",
            cuit: form.cuit ?? "",
            direccion: form.direccion ?? "",
            cuentaCorriente: form.cuentaCorriente,
            condicionIva: form.condicionIva,
            activo: form.activo,
          },
        })
          .then(() => onSaved())
          .catch((err: Error) => toast.error(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="font-display text-lg font-semibold">Ficha del puesto</h2>
      <p className="mt-1 text-sm text-muted">
        Saldo {money(ficha.saldo)}
        {form.cuentaCorriente ? "" : " · sin cuenta corriente"}
      </p>
      <Campo label="Nombre" value={form.nombre} onChange={(nombre) => setForm({ ...form, nombre })} />
      <Campo label="Teléfono" value={form.telefono ?? ""} onChange={(telefono) => setForm({ ...form, telefono })} />
      <Campo label="CUIT" value={form.cuit ?? ""} onChange={(cuit) => setForm({ ...form, cuit })} />
      <Campo label="Dirección" value={form.direccion ?? ""} onChange={(direccion) => setForm({ ...form, direccion })} />
      <label className="mt-2 block text-sm font-medium">
        Condición frente al IVA
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          value={form.condicionIva}
          onChange={(e) => setForm({ ...form, condicionIva: e.target.value })}
        >
          {CONDICIONES.map((c) => (
            <option key={c} value={c}>
              {CONDICION_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.cuentaCorriente}
          disabled={!permiteCuenta && !form.cuentaCorriente}
          onChange={(e) => setForm({ ...form, cuentaCorriente: e.target.checked })}
        />
        Cuenta corriente
      </label>
      {!permiteCuenta ? <p className="mt-1 text-xs text-muted">La cuenta corriente está en el plan Pro.</p> : null}
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
        Activo en el puesto
      </label>
      <Button type="submit" className="mt-3 w-full" disabled={busy}>
        Guardar ficha
      </Button>
      {form.cuentaCorriente ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-sm font-medium">Anotar un pago</p>
          <Campo label="Importe" value={pago} onChange={setPago} />
          <Campo label="Nota" value={nota} onChange={setNota} />
          <Button
            type="button"
            variant="secondary"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => {
              const monto = Number(pago.replace(",", "."));
              if (!(monto > 0)) {
                toast.error("El pago tiene que ser mayor a cero.");
                return;
              }
              setBusy(true);
              void anotarPagoCuenta({ data: { clienteId: ficha.id, monto, nota } })
                .then(async () => {
                  setPago("");
                  setNota("");
                  toast.success("Pago anotado");
                  await onSaved();
                })
                .catch((err: Error) => toast.error(err.message))
                .finally(() => setBusy(false));
            }}
          >
            Registrar pago
          </Button>
        </div>
      ) : null}
      <ul className="mt-3 space-y-1 text-xs text-muted">
        {(movs.data ?? []).length === 0 ? <li>Sin movimientos de cuenta.</li> : null}
        {(movs.data ?? []).map((mov) => (
          <li key={mov.id}>
            {cuando(mov.createdAt)} · {mov.tipo} · {money(mov.monto)}
            {mov.nota ? ` · ${mov.nota}` : ""}
          </li>
        ))}
      </ul>
    </form>
  );
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-2 block text-sm font-medium">
      {label}
      <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
