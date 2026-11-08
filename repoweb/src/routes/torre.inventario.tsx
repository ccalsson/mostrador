import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { InventarioCrossCanal } from "@/components/inventario-cross-canal";
import { TorreShell } from "@/components/torre-shell";
import {
  inventarioStock,
  inventarioMovimientos,
  inventarioAlertas,
  inventarioResumen,
  listarTenantsInventario,
} from "@/lib/torre/inventario-fn";

type SearchParams = { tab: string; tenant: string; q: string };

export const Route = createFileRoute("/torre/inventario")({
  component: Page,
  validateSearch: (search: { tab?: string; tenant?: string; q?: string }) => ({
    tab: search.tab ?? "stock",
    tenant: search.tenant ?? "",
    q: search.q ?? "",
  }),
});

function Page() {
  const { tab, tenant, q } = Route.useSearch();
  const navigate = useNavigate({ from: "/torre/inventario" });

  const currentTab = (["stock", "movimientos", "alertas"].includes(tab) ? tab : "stock") as
    | "stock"
    | "movimientos"
    | "alertas";

  const stockBajo = false;
  const dias = 7;

  const filtrosStock = {
    tenantId: tenant || undefined,
    stockBajo: stockBajo || undefined,
    busqueda: q || undefined,
  };

  const stock = useQuery({
    queryKey: ["torre-inventario-stock", tenant, q],
    queryFn: () => inventarioStock({ data: filtrosStock }),
  });

  const movimientos = useQuery({
    queryKey: ["torre-inventario-movimientos", dias],
    queryFn: () => inventarioMovimientos({ data: { dias } }),
    enabled: currentTab === "movimientos",
  });

  const alertas = useQuery({
    queryKey: ["torre-inventario-alertas"],
    queryFn: () => inventarioAlertas(),
    enabled: currentTab === "alertas",
  });

  const resumen = useQuery({
    queryKey: ["torre-inventario-resumen"],
    queryFn: () => inventarioResumen(),
    enabled: currentTab === "stock",
  });

  const tenants = useQuery({
    queryKey: ["torre-inventario-tenants"],
    queryFn: () => listarTenantsInventario(),
  });

  return (
    <TorreShell title="Inventario Cross-Canal">
      <InventarioCrossCanal
        tab={currentTab}
        tenantId={tenant}
        busqueda={q}
        stockBajo={stockBajo}
        dias={dias}
        resumen={resumen.data}
        stock={stock.data ?? []}
        movimientos={movimientos.data ?? []}
        alertas={alertas.data ?? []}
        tenants={tenants.data ?? []}
        isLoading={stock.isPending || movimientos.isPending || alertas.isPending || resumen.isPending || tenants.isPending}
        onTabChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, tab: v }) });
        }}
        onTenantChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, tenant: v }) });
        }}
        onBusquedaChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, q: v }) });
        }}
        onStockBajoChange={() => {
          // placeholder: stockBajo is static for now
        }}
        onDiasChange={() => {
          // placeholder: dias is static for now
        }}
      />
    </TorreShell>
  );
}
