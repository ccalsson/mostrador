import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TorreShell } from "@/components/torre-shell";
import { UsuariosCentralizados } from "@/components/usuarios-centralizados";
import { usuariosCentralizados } from "@/lib/torre/usuarios-fn";

export const Route = createFileRoute("/torre/usuarios")({
  component: Page,
  validateSearch: (search: { app?: string; rol?: string; q?: string; activo?: string }) => ({
    app: search.app ?? "",
    rol: search.rol ?? "",
    q: search.q ?? "",
    activo: search.activo ?? "",
  }),
});

type SearchParams = { app: string; rol: string; q: string; activo: string };

function Page() {
  const { app, rol, q, activo } = Route.useSearch();
  const navigate = useNavigate({ from: "/torre/usuarios" });

  const filtros = {
    app: app || undefined,
    rol: rol || undefined,
    busqueda: q || undefined,
    activo: activo === "si" ? true : activo === "no" ? false : undefined,
  };

  const usuarios = useQuery({
    queryKey: ["torre-usuarios", app, rol, q, activo],
    queryFn: () => usuariosCentralizados({ data: filtros }),
  });

  return (
    <TorreShell title="Usuarios Centralizados">
      <UsuariosCentralizados
        app={app}
        rol={rol}
        busqueda={q}
        activo={activo}
        usuarios={usuarios.data ?? []}
        isLoading={usuarios.isPending}
        onAppChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, app: v }) });
        }}
        onRolChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, rol: v }) });
        }}
        onBusquedaChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, q: v }) });
        }}
        onActivoChange={(v) => {
          void navigate({ search: (prev: SearchParams) => ({ ...prev, activo: v }) });
        }}
      />
    </TorreShell>
  );
}
