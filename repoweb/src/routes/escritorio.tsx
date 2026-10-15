import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BandejaMensajes } from "@/components/pedido-chat";
import { escritorioDueno } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { clock, dayLabel, money } from "@/lib/money";

export const Route = createFileRoute("/escritorio")({ component: EscritorioPage });

const VISTAS = [
  { id: "mensajes", label: "Comprador" },
  { id: "margen", label: "Margen" },
  { id: "deudas", label: "Deudas" },
  { id: "cierres", label: "Cierres" },
  { id: "lista", label: "Lista publicada" },
] as const;

type Vista = (typeof VISTAS)[number]["id"];

function EscritorioPage() {
  const [vista, setVista] = useState<Vista>("mensajes");
  const datos = useQuery({
    queryKey: ["escritorio-dueno"],
    queryFn: () => escritorioDueno(),
    enabled: vista !== "mensajes",
  });
  const d = datos.data;

  return (
    <AppShell title="Escritorio">
      <div className="mb-4 flex flex-wrap gap-1">
        {VISTAS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setVista(item.id)}
            className={cn(
              "h-8 rounded-md px-3 text-sm",
              vista === item.id ? "bg-btn text-btn-fg" : "border border-line bg-surface text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {vista === "mensajes" ? <BandejaMensajes /> : null}

      {vista === "margen" && d ? (
        <div className="space-y-4">
          <div className="puesto-kpis">
            <div className="px-3 py-3">
              <p className="text-[11px] tracking-wide text-muted uppercase">Cobrado, 7 días</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{money(d.margen.cobrado)}</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[11px] tracking-wide text-muted uppercase">Mercadería entrada</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{money(d.margen.costo)}</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[11px] tracking-wide text-muted uppercase">Diferencia</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{money(d.margen.diferencia)}</p>
              <p className="mt-1 text-[11px] text-muted">Cobrado menos el precio de los remitos. No es ganancia neta.</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[11px] tracking-wide text-muted uppercase">Sin precio de compra</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{d.margen.sinPrecio}</p>
              <p className="mt-1 text-[11px] text-muted">Esas líneas no entran al costo.</p>
            </div>
          </div>
          <section className="rounded-[10px] border border-line bg-surface p-3">
            <h2 className="text-sm font-medium">Día por día</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.margen.serie.map((row) => (
                <li key={row.dia} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-muted">{row.dia.slice(8)}/{row.dia.slice(5, 7)}</span>
                  <span className="tabular-nums">{money(row.cobrado)}</span>
                  <span className="tabular-nums text-muted">{money(row.costo)}</span>
                  <span className="w-24 text-right tabular-nums">{money(row.cobrado - row.costo)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-[10px] border border-line bg-surface p-3">
            <h2 className="text-sm font-medium">Remitos confirmados</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {d.margen.entradas.length === 0 ? <li className="text-muted">Todavía no hay mercadería confirmada.</li> : null}
              {d.margen.entradas.map((row) => (
                <li key={row.id} className="flex items-baseline justify-between gap-2">
                  <span>
                    {row.proveedor}
                    <span className="text-muted"> · {row.lineas} líneas · {dayLabel(row.cuando)} {clock(row.cuando)}</span>
                  </span>
                  <span className="tabular-nums">{money(row.costo)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {vista === "deudas" && d ? (
        <section className="rounded-[10px] border border-line bg-surface">
          <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-3">
            <h2 className="font-medium">Te deben</h2>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {money(d.deudas.reduce((acc, row) => acc + row.saldo, 0))}
            </p>
          </div>
          <ul className="divide-y divide-line text-sm">
            {d.deudas.length === 0 ? <li className="px-3 py-4 text-muted">Nadie tiene saldo a favor del puesto.</li> : null}
            {d.deudas.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="truncate font-medium">{row.nombre}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums">{money(row.saldo)}</span>
                  <Link to="/clientes" className="text-xs text-leaf">Ficha</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {vista === "cierres" && d ? (
        <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 font-medium">Cierre</th>
                <th className="px-3 py-2 font-medium">Quién</th>
                <th className="px-3 py-2 text-right font-medium">Esperado</th>
                <th className="px-3 py-2 text-right font-medium">Contado</th>
                <th className="px-3 py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {d.cierres.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-muted">Todavía no hay un turno cerrado.</td>
                </tr>
              ) : null}
              {d.cierres.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    {dayLabel(row.cerradoAt)} {clock(row.cerradoAt)}
                    {row.notas ? <span className="block text-xs text-muted">{row.notas}</span> : null}
                  </td>
                  <td className="px-3 py-2">{row.quien}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.esperado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.real)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", row.diferencia === 0 ? "text-muted" : "text-terra")}>
                    {money(row.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {vista === "lista" && d ? (
        <div className="space-y-3">
          <p className={cn("rounded-[10px] border px-3 py-2 text-sm", d.puestoVisible ? "border-line bg-surface" : "border-terra/40 bg-warn-bg text-terra")}>
            {d.puestoVisible
              ? `El comprador ve estos ${d.lista.productos.length} productos. ${d.lista.ocultos} activos siguen fuera de Mercado.`
              : "El puesto no está visible en Mercado al Toque. Esta es la lista que se publicaría, pero el comprador todavía no entra."}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.lista.productos.length === 0 ? <li className="text-sm text-muted">No hay productos publicados.</li> : null}
            {d.lista.productos.map((item) => (
              <li key={item.id} className="rounded-[10px] border border-line bg-surface px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{item.nombre}</span>
                  <span className="tabular-nums">{money(item.precio)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  por {item.unidad} · {item.stock > 0 ? `${item.stock} en el puesto` : "sin stock, el comprador igual puede pedirlo"}
                </p>
              </li>
            ))}
          </ul>
          <Link to="/productos" className="inline-block text-sm text-leaf">Editar la lista</Link>
        </div>
      ) : null}

      {vista !== "mensajes" && datos.isPending ? <p className="text-sm text-muted">Cargando el escritorio…</p> : null}
      {datos.error ? <p className="text-sm text-terra">{(datos.error as Error).message}</p> : null}
    </AppShell>
  );
}
