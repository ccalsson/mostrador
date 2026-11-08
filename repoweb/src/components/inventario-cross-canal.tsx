import { cn } from "@/lib/cn";
import type {
  StockItem,
  MovimientoStock,
  AlertaInventario,
  ResumenInventario,
} from "@/lib/torre/inventario-core";

type Tab = "stock" | "movimientos" | "alertas";

type Props = {
  tab: Tab;
  tenantId: string;
  busqueda: string;
  stockBajo: boolean;
  dias: number;
  resumen: ResumenInventario | undefined;
  stock: StockItem[];
  movimientos: MovimientoStock[];
  alertas: AlertaInventario[];
  tenants: { id: string; nombre: string }[];
  isLoading: boolean;
  onTabChange: (tab: Tab) => void;
  onTenantChange: (v: string) => void;
  onBusquedaChange: (v: string) => void;
  onStockBajoChange: (v: boolean) => void;
  onDiasChange: (v: number) => void;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "stock", label: "Stock actual" },
  { key: "movimientos", label: "Movimientos" },
  { key: "alertas", label: "Alertas" },
];

const DIAS_OPTS: [number, string][] = [
  [1, "Hoy"],
  [7, "7 dias"],
  [30, "30 dias"],
];

const TIPO_LABEL: Record<string, string> = {
  entrada_remito: "Entrada",
  venta: "Venta",
  anulacion_venta: "Anulacion",
  ajuste: "Ajuste",
  merma: "Merma",
  reserva: "Reserva",
  liberacion: "Liberacion",
};

function tipoColor(tipo: string): string {
  switch (tipo) {
    case "entrada_remito":
      return "text-leaf";
    case "ajuste":
      return "text-[#5b8def]";
    case "merma":
      return "text-terra";
    case "reserva":
    case "liberacion":
      return "text-[#b8960a]";
    default:
      return "";
  }
}

function severidadColor(sev: string): string {
  switch (sev) {
    case "alta":
      return "border-l-terra bg-[#fef3f2]";
    case "media":
      return "border-l-[#b8960a] bg-warn-bg";
    default:
      return "border-l-[#5b8def] bg-[#eff6ff]";
  }
}

function severidadIcon(tipo: string): string {
  switch (tipo) {
    case "stock_negativo":
      return "!";
    case "stock_bajo":
      return "!";
    case "sin_movimientos":
      return "~";
    default:
      return "-";
  }
}

export function InventarioCrossCanal({
  tab,
  tenantId,
  busqueda,
  stockBajo,
  dias,
  resumen,
  stock,
  movimientos,
  alertas,
  tenants,
  isLoading,
  onTabChange,
  onTenantChange,
  onBusquedaChange,
  onStockBajoChange,
  onDiasChange,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex rounded-md bg-paper-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={cn(
              "h-8 flex-1 rounded-md px-3 text-sm transition-colors",
              t.key === tab ? "bg-surface font-medium" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.key === "alertas" && alertas.length > 0 ? (
              <span className="ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-terra px-1.5 text-[11px] font-medium text-white">
                {alertas.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Filters for Stock tab */}
      {tab === "stock" && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium">
            Negocio
            <select
              value={tenantId}
              onChange={(e) => onTenantChange(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
            >
              <option value="">Todos</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={stockBajo}
              onChange={(e) => onStockBajoChange(e.target.checked)}
            />
            Stock bajo
          </label>
          <label className="block text-sm font-medium">
            Buscar
            <input
              type="text"
              value={busqueda}
              onChange={(e) => onBusquedaChange(e.target.value)}
              placeholder="Nombre del producto..."
              className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
            />
          </label>
        </div>
      )}

      {/* Filters for Movimientos tab */}
      {tab === "movimientos" && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex rounded-md bg-paper-2 p-1">
            {DIAS_OPTS.map(([valor, label]) => (
              <button
                key={valor}
                type="button"
                onClick={() => onDiasChange(valor)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm transition-colors",
                  valor === dias ? "bg-surface font-medium" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted">Cargando...</p>}

      {/* Summary cards (Stock tab) */}
      {tab === "stock" && resumen && !isLoading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Total productos" value={String(resumen.totalProductos)} />
          <Kpi label="Stock bajo" value={String(resumen.productosStockBajo)} tone={resumen.productosStockBajo > 0 ? "warn" : "default"} />
          <Kpi label="Sin stock" value={String(resumen.productosSinStock)} tone={resumen.productosSinStock > 0 ? "warn" : "default"} />
          <Kpi label="Movimientos hoy" value={String(resumen.movimientosHoy)} />
        </div>
      )}

      {/* Stock tab */}
      {tab === "stock" && !isLoading && stock.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay productos que coincidan con los filtros.
        </p>
      )}
      {tab === "stock" && !isLoading && stock.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Negocio</th>
                  <th className="px-3 py-2 font-medium">Unidad</th>
                  <th className="px-3 py-2 text-right font-medium">Stock</th>
                  <th className="px-3 py-2 text-right font-medium">Minimo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 font-medium">{p.productoNombre}</td>
                    <td className="px-3 py-2 text-muted">{p.tenantNombre}</td>
                    <td className="px-3 py-2 text-muted">{p.unidad}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", p.stockBajo ? "text-terra font-medium" : "")}>
                      {p.stock}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{p.stockMinimo}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          p.stock < 0
                            ? "bg-terra/15 text-terra"
                            : p.stockBajo
                              ? "bg-warn-bg text-[#b8960a]"
                              : "bg-leaf/15 text-leaf",
                        )}
                      >
                        {p.stock < 0 ? "Negativo" : p.stockBajo ? "Bajo" : "OK"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {stock.map((p) => (
              <article key={p.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.productoNombre}</p>
                    <p className="text-xs text-muted">{p.tenantNombre}</p>
                  </div>
                  <span className={cn("shrink-0 tabular-nums text-sm font-medium", p.stockBajo ? "text-terra" : "")}>
                    {p.stock} <span className="text-xs text-muted">{p.unidad}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="text-muted">Min: {p.stockMinimo}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      p.stock < 0
                        ? "bg-terra/15 text-terra"
                        : p.stockBajo
                          ? "bg-warn-bg text-[#b8960a]"
                          : "bg-leaf/15 text-leaf",
                    )}
                  >
                    {p.stock < 0 ? "Negativo" : p.stockBajo ? "Bajo" : "OK"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* Movimientos tab */}
      {tab === "movimientos" && !isLoading && movimientos.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay movimientos en el periodo seleccionado.
        </p>
      )}
      {tab === "movimientos" && !isLoading && movimientos.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-medium">Fecha/Hora</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Negocio</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 text-muted tabular-nums whitespace-nowrap">
                      {formatFecha(m.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-medium">{m.productoNombre}</td>
                    <td className="px-3 py-2 text-muted">{m.tenantNombre}</td>
                    <td className={cn("px-3 py-2 text-xs font-medium", tipoColor(m.tipo))}>
                      {TIPO_LABEL[m.tipo] ?? m.tipo}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.cantidad}</td>
                    <td className="px-3 py-2 text-muted text-xs truncate max-w-[120px]">
                      {m.referencia ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {movimientos.map((m) => (
              <article key={m.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{m.productoNombre}</p>
                    <p className="text-xs text-muted">{m.tenantNombre}</p>
                  </div>
                  <span className={cn("shrink-0 tabular-nums text-sm font-medium", tipoColor(m.tipo))}>
                    {m.cantidad > 0 ? "+" : ""}{m.cantidad}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className={cn("font-medium", tipoColor(m.tipo))}>
                    {TIPO_LABEL[m.tipo] ?? m.tipo}
                  </span>
                  <span className="text-muted">{formatFecha(m.createdAt)}</span>
                  {m.referencia ? (
                    <span className="text-muted truncate max-w-[100px]">{m.referencia}</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* Alertas tab */}
      {tab === "alertas" && !isLoading && alertas.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay alertas. Todo en orden.
        </p>
      )}
      {tab === "alertas" && !isLoading && alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <article
              key={`${a.tipo}-${a.tenantNombre}-${a.productoNombre}-${i}`}
              className={cn("rounded-lg border border-line border-l-4 bg-surface p-3", severidadColor(a.severidad))}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    a.severidad === "alta"
                      ? "bg-terra text-white"
                      : a.severidad === "media"
                        ? "bg-[#b8960a] text-white"
                        : "bg-[#5b8def] text-white",
                  )}
                >
                  {severidadIcon(a.tipo)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted">
                      {a.tipo.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted">·</span>
                    <span className="text-xs text-muted">{a.tenantNombre}</span>
                  </div>
                  <p className="mt-0.5 font-medium">{a.productoNombre}</p>
                  <p className="mt-0.5 text-sm text-muted">{a.detalle}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-xl font-semibold tabular-nums", tone === "warn" ? "text-terra" : "text-ink")}>
        {value}
      </p>
    </div>
  );
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
