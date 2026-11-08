import { money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { PLConsolidado, FlujoCajaEntry, ConciliacionResult } from "@/lib/torre/financiero-core";

type Props = {
  tab: "pl" | "flujo" | "conciliacion";
  onTabChange: (tab: "pl" | "flujo" | "conciliacion") => void;
  mes: number;
  anio: number;
  dias: 7 | 15 | 30;
  onDiasChange: (d: 7 | 15 | 30) => void;
  plData: PLConsolidado | undefined;
  flujoData: FlujoCajaEntry[] | undefined;
  concData: ConciliacionResult | undefined;
  isLoading: boolean;
};

const TABS = [
  { id: "pl" as const, label: "P&L Consolidado" },
  { id: "flujo" as const, label: "Flujo de Caja" },
  { id: "conciliacion" as const, label: "Conciliacion" },
];

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function FinancieroConsolidado({
  tab,
  onTabChange,
  mes,
  anio,
  dias,
  onDiasChange,
  plData,
  flujoData,
  concData,
  isLoading,
}: Props) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">
          {MESES[mes - 1]} {anio}
        </span>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted">Cargando...</p>}

      {tab === "pl" && plData && <PLTab pl={plData} />}
      {tab === "flujo" && flujoData && (
        <FlujoTab entries={flujoData} dias={dias} onDiasChange={onDiasChange} />
      )}
      {tab === "conciliacion" && concData && <ConcTab result={concData} />}
    </>
  );
}

function PLTab({ pl }: { pl: PLConsolidado }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="font-display text-lg">Total Consolidado</h3>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted">Ingresos</p>
            <p className="font-display text-xl text-leaf tabular-nums">{money(pl.totalIngresos)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Gastos</p>
            <p className="font-display text-xl text-terra tabular-nums">{money(pl.totalGastos)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Resultado</p>
            <p className={cn("font-display text-xl tabular-nums", pl.totalResultado >= 0 ? "text-leaf" : "text-terra")}>
              {money(pl.totalResultado)}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2 font-medium">App</th>
              <th className="px-3 py-2 text-right font-medium">Ingresos</th>
              <th className="px-3 py-2 text-right font-medium">Gastos</th>
              <th className="px-3 py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {pl.apps.map((app) => (
              <tr key={app.app} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 font-medium">{app.app}</td>
                <td className="px-3 py-2 text-right tabular-nums text-leaf">{money(app.ingresos)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-terra">{money(app.gastos)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-medium", app.resultado >= 0 ? "text-leaf" : "text-terra")}>
                  {money(app.resultado)}
                </td>
              </tr>
            ))}
            <tr className="bg-surface/50 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums text-leaf">{money(pl.totalIngresos)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-terra">{money(pl.totalGastos)}</td>
              <td className={cn("px-3 py-2 text-right tabular-nums", pl.totalResultado >= 0 ? "text-leaf" : "text-terra")}>
                {money(pl.totalResultado)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlujoTab({
  entries,
  dias,
  onDiasChange,
}: {
  entries: FlujoCajaEntry[];
  dias: 7 | 15 | 30;
  onDiasChange: (d: 7 | 15 | 30) => void;
}) {
  const maxAbs = Math.max(...entries.map((e) => Math.max(e.ingresos, e.egresos)), 1);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([7, 15, 30] as const).map((d) => (
          <Button
            key={d}
            size="sm"
            variant={dias === d ? "primary" : "secondary"}
            onClick={() => onDiasChange(d)}
          >
            {d} dias
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-end gap-px" style={{ height: 120 }}>
          {entries.map((e) => {
            const pctIng = maxAbs > 0 ? Math.max(2, (e.ingresos / maxAbs) * 100) : 2;
            const pctEgr = maxAbs > 0 ? Math.max(2, (e.egresos / maxAbs) * 100) : 2;
            return (
              <div
                key={e.fecha}
                className="flex flex-1 flex-col items-center gap-px"
                title={e.fecha}
              >
                <div className="flex w-full flex-1 items-end gap-px">
                  <div className="flex-1 rounded-t bg-leaf/70" style={{ height: `${pctIng}%` }} />
                  <div className="flex-1 rounded-t bg-terra/70" style={{ height: `${pctEgr}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted">
          <span>{entries[0]?.fecha ?? ""}</span>
          <span className="flex gap-3">
            <span><span className="inline-block h-2 w-2 rounded bg-leaf/70" /> Ingresos</span>
            <span><span className="inline-block h-2 w-2 rounded bg-terra/70" /> Egresos</span>
          </span>
          <span>{entries[entries.length - 1]?.fecha ?? ""}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Ingresos</th>
              <th className="px-3 py-2 text-right font-medium">Egresos</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.fecha} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2">{e.fecha}</td>
                <td className="px-3 py-2 text-right tabular-nums text-leaf">
                  {e.ingresos > 0 ? money(e.ingresos) : "\u2014"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-terra">
                  {e.egresos > 0 ? money(e.egresos) : "\u2014"}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-medium", e.saldo >= 0 ? "text-leaf" : "text-terra")}>
                  {money(e.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConcTab({ result }: { result: ConciliacionResult }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-line bg-surface p-4 text-center">
          <p className="text-xs text-muted">Conciliados</p>
          <p className="font-display text-2xl text-leaf tabular-nums">{result.conciliados}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 text-center">
          <p className="text-xs text-muted">Pagos sin pedido</p>
          <p className="font-display text-2xl text-terra tabular-nums">{result.pagosSinPedido.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 text-center">
          <p className="text-xs text-muted">Pedidos sin pago</p>
          <p className="font-display text-2xl text-terra tabular-nums">{result.pedidosSinPago.length}</p>
        </div>
      </div>

      {result.pagosSinPedido.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <h3 className="border-b border-line px-3 py-2 text-sm font-medium">Pagos sin pedido</h3>
          <ul className="divide-y divide-line text-sm">
            {result.pagosSinPedido.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2">
                <span className="font-mono text-xs text-muted">{p.id.slice(0, 8)}</span>
                <span className="tabular-nums">{money(p.monto)}</span>
                <span className="text-xs text-muted">{p.fecha}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.pedidosSinPago.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <h3 className="border-b border-line px-3 py-2 text-sm font-medium">Pedidos sin cobro</h3>
          <ul className="divide-y divide-line text-sm">
            {result.pedidosSinPago.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2">
                <span className="font-mono text-xs text-muted">{p.id.slice(0, 8)}</span>
                <span className="tabular-nums">{money(p.total)}</span>
                <span className="text-xs text-muted">{p.fecha}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.pagosSinPedido.length === 0 && result.pedidosSinPago.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          Todo conciliado. No hay movimientos pendientes.
        </p>
      )}
    </div>
  );
}
