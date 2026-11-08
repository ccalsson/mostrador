import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ProductoUnificado } from "@/lib/torre/catalogo-core";

type Props = {
  tenantId: string;
  publicadoOnline: boolean | undefined;
  stockBajo: boolean;
  busqueda: string;
  productos: ProductoUnificado[];
  tenants: { id: string; nombre: string }[];
  isLoading: boolean;
  onTenantChange: (v: string) => void;
  onPublicadoChange: (v: string) => void;
  onStockBajoChange: (v: boolean) => void;
  onBusquedaChange: (v: string) => void;
};

export function CatalogoUnificado({
  tenantId,
  publicadoOnline,
  stockBajo,
  busqueda,
  productos,
  tenants,
  isLoading,
  onTenantChange,
  onPublicadoChange,
  onStockBajoChange,
  onBusquedaChange,
}: Props) {
  return (
    <>
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
        <label className="block text-sm font-medium">
          Canal online
          <select
            value={publicadoOnline === undefined ? "" : publicadoOnline ? "si" : "no"}
            onChange={(e) => onPublicadoChange(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          >
            <option value="">Todos</option>
            <option value="si">Publicados</option>
            <option value="no">No publicados</option>
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

      {isLoading && <p className="text-sm text-muted">Cargando...</p>}

      {!isLoading && productos.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay productos que coincidan con los filtros.
        </p>
      )}

      {!isLoading && productos.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Negocio</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Moneda</th>
                  <th className="px-3 py-2 text-right font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Canales</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 font-medium">{p.nombre}</td>
                    <td className="px-3 py-2 text-muted">{p.tenantNombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.precio)}</td>
                    <td className="px-3 py-2 text-muted">{p.moneda}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", p.stockBajo ? "text-terra font-medium" : "")}>
                      {p.stock}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          p.activo ? "bg-leaf/15 text-leaf" : "bg-muted/15 text-muted",
                        )}
                      >
                        {p.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1.5">
                        <span
                          title="Mostrador"
                          className={cn(
                            "inline-block h-5 w-5 rounded text-center text-[10px] leading-5",
                            p.canalMostrador ? "bg-leaf/15 text-leaf" : "bg-muted/10 text-muted",
                          )}
                        >
                          M
                        </span>
                        <span
                          title="Mercado online"
                          className={cn(
                            "inline-block h-5 w-5 rounded text-center text-[10px] leading-5",
                            p.canalMercado ? "bg-[#e3c56a]/20 text-[#b8960a]" : "bg-muted/10 text-muted",
                          )}
                        >
                          O
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {productos.map((p) => (
              <article
                key={p.id}
                className="rounded-lg border border-line bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted">{p.tenantNombre}</p>
                  </div>
                  <span className="shrink-0 tabular-nums text-sm font-medium">
                    {money(p.precio)} <span className="text-xs text-muted">{p.moneda}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className={cn("tabular-nums", p.stockBajo ? "font-medium text-terra" : "text-muted")}>
                    Stock: {p.stock}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      p.activo ? "bg-leaf/15 text-leaf" : "bg-muted/15 text-muted",
                    )}
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                  <span className="flex gap-1">
                    <span
                      title="Mostrador"
                      className={cn(
                        "inline-block h-4 w-4 rounded text-center text-[9px] leading-4",
                        p.canalMostrador ? "bg-leaf/15 text-leaf" : "bg-muted/10 text-muted",
                      )}
                    >
                      M
                    </span>
                    <span
                      title="Mercado online"
                      className={cn(
                        "inline-block h-4 w-4 rounded text-center text-[9px] leading-4",
                        p.canalMercado ? "bg-[#e3c56a]/20 text-[#b8960a]" : "bg-muted/10 text-muted",
                      )}
                    >
                      O
                    </span>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
