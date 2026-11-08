import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CatalogoUnificado } from "@/components/catalogo-unificado";
import { TorreShell } from "@/components/torre-shell";
import { catalogoUnificado, listarTenantsCatalogo } from "@/lib/torre/catalogo-fn";

type SearchParams = { tenant: string; publicado: string; stockBajo: string; q: string };

export const Route = createFileRoute("/torre/catalogo-unificado")({
  component: Page,
  validateSearch: (search: { tenant?: string; publicado?: string; stockBajo?: string; q?: string }) => ({
    tenant: search.tenant ?? "",
    publicado: search.publicado ?? "",
    stockBajo: search.stockBajo ?? "",
    q: search.q ?? "",
  }),
});

function Page() {
  const { tenant, publicado, stockBajo, q } = Route.useSearch();
  const navigate = useNavigate({ from: "/torre/catalogo-unificado" });

  const publicadoOnline = publicado === "si" ? true : publicado === "no" ? false : undefined;

  const filtros = {
    tenantId: tenant || undefined,
    publicadoOnline,
    stockBajo: stockBajo === "si" ? true : undefined,
    busqueda: q || undefined,
  };

  const productos = useQuery({
    queryKey: ["torre-catalogo", tenant, publicado, stockBajo, q],
    queryFn: () => catalogoUnificado({ data: filtros }),
  });

  const tenants = useQuery({
    queryKey: ["torre-catalogo-tenants"],
    queryFn: () => listarTenantsCatalogo(),
  });

  return (
    <TorreShell title="Catalogo Unificado">
      <CatalogoUnificado
        tenantId={tenant}
        publicadoOnline={publicadoOnline}
        stockBajo={stockBajo === "si"}
        busqueda={q}
        productos={productos.data ?? []}
        tenants={tenants.data ?? []}
        isLoading={productos.isPending || tenants.isPending}
        onTenantChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, tenant: v }) });
        }}
        onPublicadoChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, publicado: v }) });
        }}
        onStockBajoChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, stockBajo: v ? "si" : "" }) });
        }}
        onBusquedaChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, q: v }) });
        }}
      />
    </TorreShell>
  );
}
