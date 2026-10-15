import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { mesaTurno } from "@/lib/fn";
import { clock, money } from "@/lib/money";
import { ESTADO_LABEL, PAGO_LABEL, type PedidoEstado } from "@/lib/types";

export function MesaTurno({ modo }: { modo: "dueno" | "caja" }) {
  const mesa = useQuery({
    queryKey: ["mesa-turno"],
    queryFn: () => mesaTurno(),
    refetchInterval: 4000,
  });
  const d = mesa.data;
  const esperando = (d?.deLaApp ?? []).filter((p) => p.estado !== "cobrado");
  const primero = esperando[0];

  if (modo === "dueno") {
    return (
      <section className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-xs">
        <span className="font-medium">Turno</span>
        <span className="tabular-nums">{money(d?.cobrado ?? 0)}</span>
        <span className="text-muted">{esperando.length} en curso</span>
        <span className="text-muted">{d?.publicados ?? 0} en Mercado{d?.sinStock ? ` · ${d.sinStock} sin stock` : ""}</span>
        <span className="text-muted">{d?.bajos ?? 0} a reponer</span>
        {primero ? (
          <Link to="/caja" className="min-w-0 truncate text-leaf">
            {primero.cliente} · {money(primero.total)}
          </Link>
        ) : (
          <span className="text-muted">Sin pedidos de la app</span>
        )}
        {esperando.length > 1 ? <span className="text-muted">+{esperando.length - 1}</span> : null}
        <Link to="/escritorio" className="ml-auto text-leaf">Escritorio</Link>
      </section>
    );
  }

  return (
    <section className="mb-4 overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2.5">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">Turno</p>
          <h2 className="font-display text-lg font-semibold">Lo que entra de la app</h2>
        </div>
        <div className="flex gap-3 text-xs">
            <Link to="/cierre" className="font-medium text-leaf">Cerrar turno</Link>
          <Link to="/remitos" className="text-muted">Remitos</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-4 sm:divide-x">
        <Celda label="Cobrado hoy" value={money(d?.cobrado ?? 0)} />
        <Celda label="Compradores en curso" value={String(esperando.length)} />
        <Celda label="En Mercado" value={String(d?.publicados ?? 0)} hint={d?.sinStock ? `${d.sinStock} sin stock` : "publicados"} />
        <Celda label="A reponer" value={String(d?.bajos ?? 0)} hint="en o bajo el mínimo" />
      </div>
      <div className="px-3 py-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Pedidos del comprador</p>
          <ul className="mt-2 space-y-2">
            {(d?.deLaApp ?? []).length === 0 ? (
              <li className="text-sm text-muted">Nadie pidió desde Mercado al Toque. Cuando publiques un producto, el pedido aparece acá.</li>
            ) : (
              (d?.deLaApp ?? []).map((pedido) => (
                <li key={pedido.id} className="rounded-md border border-line px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{pedido.cliente}</span>
                    <span className="shrink-0 tabular-nums text-sm">{money(pedido.total)}</span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {ESTADO_LABEL[pedido.estado as PedidoEstado] ?? pedido.estado}
                    {pedido.formaPago ? ` · ${PAGO_LABEL[pedido.formaPago]}` : ""}
                    {" · "}
                    {clock(pedido.createdAt)}
                    {pedido.detalle ? ` · ${pedido.detalle}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Celda({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 font-display text-xl leading-none font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
