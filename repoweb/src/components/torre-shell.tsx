import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { torreYo } from "@/lib/torre-fn";
import { cn } from "@/lib/cn";

const NAV = [
  { section: "Comercial", to: "/torre", label: "Tablero" },
  { section: "Comercial", to: "/torre/tenants", label: "Tenants" },
  { section: "Comercial", to: "/torre/clientes", label: "Clientes" },
  { section: "Comercial", to: "/torre/planes", label: "Planes" },
  { section: "Comercial", to: "/torre/productos", label: "Add-ons y precios" },
  { section: "Comercial", to: "/torre/servicios", label: "Servicios" },
  { section: "Comercial", to: "/torre/suscripciones", label: "Suscripciones" },
  { section: "Comercial", to: "/torre/sucursales", label: "Sucursales" },
  { section: "Comercial", to: "/torre/promociones", label: "Promociones y founders" },
  { section: "Comercial", to: "/torre/publicidad", label: "Publicidad" },
  { section: "Comercial", to: "/torre/finanzas", label: "Finanzas" },
  { section: "Legal", to: "/torre/legal", label: "Documentos y contratos" },
  { section: "Legal", to: "/torre/procesadores", label: "Procesadores" },
  { section: "Auditoría", to: "/torre/auditoria", label: "Eventos" },
  { section: "Plataforma", to: "/torre/apps", label: "Aplicaciones" },
  { section: "Plataforma", to: "/torre/versiones", label: "Versiones" },
  { section: "Plataforma", to: "/torre/deployments", label: "Deployments" },
  { section: "Plataforma", to: "/torre/configuracion", label: "Configuración" },
] as const;

export function TorreShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const yo = useQuery({
    queryKey: ["torre-yo", user?.id],
    queryFn: () => torreYo(),
    enabled: Boolean(user),
    retry: false,
  });
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (isPending || (user && yo.isPending)) {
    return <div className="grid min-h-dvh place-items-center bg-paper text-muted">Abriendo la Torre…</div>;
  }
  if (!user) return <Navigate to="/torre/login" />;
  if (yo.isError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <div>
          <p className="font-display text-2xl font-semibold">Torre de Control</p>
          <p className="mt-2 text-sm text-muted">Esta consola no está habilitada para tu usuario.</p>
          <button type="button" className="mt-4 text-sm text-leaf" onClick={() => void signOut("/torre/login")}>
            Entrar con otra cuenta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper text-ink md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 border-b border-white/10 bg-[#14110e] text-[#f4efe4] md:static md:min-h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[11px] tracking-wide text-[#e3c56a] uppercase">Interna</p>
            <p className="font-display text-lg leading-tight font-semibold text-[#f4efe4]">Torre de Control</p>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs text-[#f4efe4]/70"
            onClick={() => void signOut("/torre/login")}
          >
            Salir
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:block md:space-y-1 md:overflow-visible md:px-2">
          {NAV.map((item, index) => {
            const active = item.to === "/torre" ? path === "/torre" : path.startsWith(item.to);
            const header = index === 0 || NAV[index - 1].section !== item.section;
            return (
              <div key={item.to} className="shrink-0 md:shrink">
                {header ? <p className="px-3 pt-2 text-[10px] tracking-wide text-[#e3c56a] uppercase">{item.section}</p> : null}
                <Link
                  to={item.to}
                  className={cn(
                    "block rounded-[10px] px-3 py-2 text-sm text-[#f4efe4]",
                    active ? "bg-white/15" : "text-[#f4efe4]/75",
                  )}
                >
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-4 sm:px-6">
        <h1 className="mb-4 font-display text-2xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="mt-2 block text-sm font-medium">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="mt-2 block text-sm font-medium">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
