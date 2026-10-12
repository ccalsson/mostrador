import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TorreShell } from "@/components/torre-shell";
import { analiticaOperacion } from "@/lib/torre/operacion-fn";
import { money } from "@/lib/money";
import { ESTADO_LABEL, PAGO_LABEL, type FormaPago, type PedidoEstado } from "@/lib/types";

export const Route = createFileRoute("/torre/mercado")({ component: Page });

type Rango = 1 | 7 | 30;
type Pedidos = { estado: string; n: number; monto: number }[];
type Cobros = { forma: string; n: number; monto: number; anulados: number; montoAnulado: number }[];

const CERRADOS = new Set(["cobrado", "entregado"]);
const CURSO = new Set(["enviado", "en_preparacion", "listo"]);
const ROL: Record<string, string> = { admin: "Dueño", cajero: "Cajero", vendedor: "Vendedor" };
const RECORRIDO: Record<string, string> = {
  asignado: "Asignado",
  aceptado: "Aceptado",
  retirado: "Retirado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
const CUENTA: Record<string, string> = { cargo: "Cargos", pago: "Pagos" };
const STOCK: Record<string, string> = {
  entrada_remito: "Entrada por remito",
  venta: "Venta",
  anulacion_venta: "Anulación",
  ajuste: "Ajuste",
  merma: "Merma",
  reserva: "Reserva",
  liberacion: "Liberación",
};

function Page() {
  const [dias, setDias] = useState<Rango>(7);
  const data = useQuery({
    queryKey: ["torre-operacion", dias],
    queryFn: () => analiticaOperacion({ data: { dias } }),
    refetchInterval: 15000,
  });
  const d = data.data;
  const g = d?.gente;
  const mostrador = resumir(d?.mostrador.pedidos ?? [], d?.mostrador.cobros ?? []);
  const mercado = resumir(d?.mercado.pedidos ?? [], d?.mercado.cobros ?? []);

  return (
    <TorreShell title="Mostrador y Mercado">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Una línea. Las dos apps. Todo lo que ya quedó registrado.</p>
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
      {data.error ? <p className="mb-3 text-sm text-terra">{(data.error as Error).message}</p> : null}

      <h2 className="mb-2 text-sm text-muted">En línea ahora</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Puestos en línea" value={`${g?.puestosLinea ?? "…"}`} hint={`${g?.puestos ?? 0} registrados`} />
        <Kpi
          label="Personal"
          value={`${(g?.duenosLinea ?? 0) + (g?.cajerosLinea ?? 0) + (g?.vendedoresLinea ?? 0)}`}
          hint={`${g?.duenosLinea ?? 0} dueños · ${g?.cajerosLinea ?? 0} cajeros · ${g?.vendedoresLinea ?? 0} vendedores`}
        />
        <Kpi label="Compradores" value={`${g?.compradoresLinea ?? "…"}`} hint={`${g?.compradores ?? 0} registrados`} />
        <Kpi label="Cargadores" value={`${g?.cargadoresLinea ?? "…"}`} hint={`${g?.cargadoresDisponibles ?? 0} disponibles · ${g?.cargadores ?? 0} activos`} />
      </div>

      <h2 className="mt-4 mb-2 text-sm text-muted">Registrados</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Dueños" value={String(g?.duenos ?? 0)} />
        <Kpi label="Cajeros" value={String(g?.cajeros ?? 0)} />
        <Kpi label="Vendedores" value={String(g?.vendedores ?? 0)} />
        <Kpi label="Clientes" value={String(g?.clientes ?? 0)} hint={`${g?.clientesCuenta ?? 0} con cuenta`} />
        <Kpi label="Proveedores" value={String(g?.proveedores ?? 0)} />
        <Kpi label="Compradores" value={String(g?.compradores ?? 0)} />
        <Kpi label="Cargadores" value={String(g?.cargadores ?? 0)} />
        <Kpi label="Productos" value={String(d?.catalogo.productos ?? 0)} hint={`${d?.catalogo.publicados ?? 0} en Mercado`} />
      </div>

      <h2 className="mt-4 mb-2 text-sm text-muted">Las dos apps, mismo período</h2>
      <div className="grid gap-2 lg:grid-cols-2">
        <ResumenApp titulo="Mostrador" tono="leaf" datos={mostrador} />
        <ResumenApp titulo="Mercado al Toque" tono="ambar" datos={mercado} />
      </div>

      <section className="mt-4 rounded-lg border border-line bg-surface p-3">
        <h2 className="font-medium">Cobros por día</h2>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d?.serie ?? []}>
              <XAxis dataKey="dia" tickFormatter={diaCorto} stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} stroke="var(--color-muted)" fontSize={12} width={36} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v, nombre) => [money(Number(v)), nombre === "mostrador" ? "Mostrador" : "Mercado"]}
                labelFormatter={(l) => diaCorto(String(l))}
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8 }}
              />
              <Legend formatter={(value) => (value === "mostrador" ? "Mostrador" : "Mercado")} />
              <Bar dataKey="mostrador" fill="var(--color-leaf)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="mercado" fill="var(--color-ambar)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <AppBloque titulo="Mostrador" pedidos={d?.mostrador.pedidos ?? []} cobros={d?.mostrador.cobros ?? []} productos={d?.mostrador.productos ?? []} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Lista titulo="Remitos" vacio="Sin remitos en este período." filas={(d?.remitos ?? []).map((row) => ({ nombre: row.estado, detalle: String(row.n) }))} />
        <Lista
          titulo="Cuenta corriente"
          vacio="Sin movimientos de cuenta."
          filas={(d?.cuenta ?? []).map((row) => ({ nombre: CUENTA[row.tipo] ?? row.tipo, detalle: `${row.n} · ${money(row.monto)}` }))}
        />
        <Lista
          titulo="Stock"
          vacio="Sin movimientos de stock."
          filas={(d?.stock ?? []).map((row) => ({ nombre: STOCK[row.tipo] ?? row.tipo, detalle: `${row.n} · ${row.cantidad}` }))}
        />
        <Lista
          titulo="Facturas"
          vacio="Sin comprobantes en este período."
          filas={(d?.facturas ?? []).map((row) => ({ nombre: row.estado, detalle: `${row.n} · ${money(row.total)}` }))}
        />
      </div>
      <p className="mt-2 text-sm text-muted">
        Cierres de caja: {d?.cierres.n ?? 0}. Diferencia acumulada {money(d?.cierres.diferencia ?? 0)}.
      </p>

      <AppBloque titulo="Mercado al Toque" pedidos={d?.mercado.pedidos ?? []} cobros={d?.mercado.cobros ?? []} productos={d?.mercado.productos ?? []} />
      <div className="mt-4">
        <Lista
          titulo="Recorridos de cargadores"
          vacio="Sin recorridos en este período."
          filas={(d?.recorridos ?? []).map((row) => ({ nombre: RECORRIDO[row.estado] ?? row.estado, detalle: String(row.n) }))}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-3">
          <h2 className="font-medium">Puestos por facturación</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(d?.puestos ?? []).length === 0 ? <li className="py-2 text-muted">Ningún puesto cobró en este período.</li> : null}
            {(d?.puestos ?? []).map((row) => (
              <li key={row.nombre} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{row.nombre}</span>
                  <span className="tabular-nums">{row.tickets} tickets</span>
                </div>
                <p className="text-xs text-muted">
                  Mostrador {money(row.mostrador)} · Mercado {money(row.mercado)}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <Lista
          titulo="Puestos con alguien adentro"
          vacio="Nadie con sesión abierta."
          filas={(d?.enLinea ?? []).map((row) => ({ nombre: row.nombre, detalle: ROL[row.rol] ?? row.rol }))}
        />
      </div>
    </TorreShell>
  );
}

function resumir(pedidos: Pedidos, cobros: Cobros) {
  const suma = (filtro: (estado: string) => boolean) =>
    pedidos.filter((row) => filtro(row.estado)).reduce((acc, row) => ({ n: acc.n + row.n, monto: acc.monto + row.monto }), { n: 0, monto: 0 });
  const cobrado = cobros.reduce((acc, row) => acc + row.monto, 0);
  const tickets = cobros.reduce((acc, row) => acc + row.n, 0);
  const anulados = cobros.reduce((acc, row) => acc + row.anulados, 0);
  return {
    cobrado,
    tickets,
    cerrados: suma((estado) => CERRADOS.has(estado)),
    curso: suma((estado) => CURSO.has(estado)),
    cancelados: suma((estado) => estado === "anulado"),
    anulados,
  };
}

function ResumenApp({
  titulo,
  tono,
  datos,
}: {
  titulo: string;
  tono: "leaf" | "ambar";
  datos: ReturnType<typeof resumir>;
}) {
  return (
    <section className={`rounded-lg border border-line border-t-2 bg-surface p-3 ${tono === "leaf" ? "border-t-leaf" : "border-t-ambar"}`}>
      <h3 className="font-medium">{titulo}</h3>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{money(datos.cobrado)}</p>
      <p className="text-xs text-muted">{datos.tickets} cobros vigentes · {datos.anulados} anulados</p>
      <p className="mt-2 text-sm text-muted">
        {datos.cerrados.n} cerradas · {datos.curso.n} en curso · {datos.cancelados.n} canceladas
      </p>
    </section>
  );
}

function AppBloque({
  titulo,
  pedidos,
  cobros,
  productos,
}: {
  titulo: string;
  pedidos: Pedidos;
  cobros: Cobros;
  productos: { nombre: string; total: number }[];
}) {
  const max = Math.max(...productos.map((row) => row.total), 1);
  return (
    <section className="mt-4">
      <h2 className="mb-2 font-medium">{titulo}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Lista
          titulo="Medios de pago"
          vacio="Sin cobros."
          filas={cobros.map((row) => ({
            nombre: PAGO_LABEL[row.forma as FormaPago] ?? row.forma,
            detalle: `${row.n} · ${money(row.monto)}${row.anulados ? ` · ${row.anulados} anulados` : ""}`,
          }))}
        />
        <Lista
          titulo="Pedidos"
          vacio="Sin pedidos."
          filas={pedidos
            .slice()
            .sort((a, b) => b.monto - a.monto)
            .map((row) => ({
              nombre: ESTADO_LABEL[row.estado as PedidoEstado] ?? row.estado,
              detalle: `${row.n} · ${money(row.monto)}`,
            }))}
        />
        <section className="rounded-lg border border-line bg-surface p-3">
          <h3 className="font-medium">Productos</h3>
          <ul className="mt-2 space-y-2">
            {productos.length === 0 ? <li className="text-sm text-muted">Sin ventas cerradas.</li> : null}
            {productos.map((row) => (
              <li key={row.nombre}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate">{row.nombre}</span>
                  <span className="tabular-nums text-muted">{money(row.total)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full bg-leaf" style={{ width: `${(row.total / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function Lista({ titulo, vacio, filas }: { titulo: string; vacio: string; filas: { nombre: string; detalle: string }[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h3 className="font-medium">{titulo}</h3>
      <ul className="mt-2 divide-y divide-line text-sm">
        {filas.length === 0 ? <li className="py-2 text-muted">{vacio}</li> : null}
        {filas.map((fila) => (
          <li key={`${fila.nombre}-${fila.detalle}`} className="flex justify-between gap-3 py-2">
            <span className="truncate">{fila.nombre}</span>
            <span className="shrink-0 tabular-nums text-muted">{fila.detalle}</span>
          </li>
        ))}
      </ul>
    </section>
  );
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

function diaCorto(iso: string) {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}
