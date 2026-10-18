import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TorrePanel } from "@/components/torre-panel";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { torreYo } from "@/lib/torre-fn";
import { pedidosAddon } from "@/lib/torre/control-fn";
import { cn } from "@/lib/cn";

const GRUPOS = [
  {
    label: "Comercial",
    items: [
      { to: "/torre/tenants", label: "Negocios" },
      { to: "/torre/clientes", label: "Clientes" },
      { to: "/torre/planes", label: "Planes" },
      { to: "/torre/productos", label: "Add-ons y precios" },
      { to: "/torre/servicios", label: "Servicios" },
      { to: "/torre/suscripciones", label: "Suscripciones" },
      { to: "/torre/sucursales", label: "Sucursales" },
      { to: "/torre/promociones", label: "Promociones" },
      { to: "/torre/publicidad", label: "Publicidad" },
      { to: "/torre/finanzas", label: "Finanzas" },
    ],
  },
  {
    label: "Operación",
    items: [
      { to: "/torre/mercado", label: "Mostrador y Mercado" },
      { to: "/torre/super-al-toque", label: "Super al Toque" },
    ],
  },
  {
    label: "Legal",
    items: [
      { to: "/torre/legal", label: "Documentos y contratos" },
      { to: "/torre/procesadores", label: "Procesadores" },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { to: "/torre/apps", label: "Aplicaciones" },
      { to: "/torre/versiones", label: "Versiones" },
      { to: "/torre/deployments", label: "Deployments" },
      { to: "/torre/auditoria", label: "Auditoría" },
      { to: "/torre/configuracion", label: "Configuración" },
    ],
  },
] as const;

export function TorreShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const yo = useQuery({
    queryKey: ["torre-yo", user?.id],
    queryFn: () => torreYo(),
    enabled: Boolean(user),
    retry: false,
  });
  const pedidos = useQuery({
    queryKey: ["torre-pedidos-addon"],
    queryFn: () => pedidosAddon(),
    enabled: Boolean(user) && !yo.isError,
    refetchInterval: 60_000,
  });
  const avisos = pedidos.data?.length ?? 0;
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [abierto, setAbierto] = useState<string | null>(null);

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

  const tablero = path === "/torre" || path === "/torre/";

  return (
    <div className="torre-app min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-[#7cc0f5]/25 bg-[#131c28] text-[#f2f5f9]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <Link to="/torre" className="shrink-0 border-r border-white/10 pr-4" onClick={() => setAbierto(null)}>
            <p className="text-[10px] font-medium tracking-[0.16em] text-[#7cc0f5] uppercase">Consola</p>
            <p className="font-display text-lg leading-none font-semibold tracking-tight">Torre</p>
          </Link>
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <Link
              to="/torre"
              onClick={() => setAbierto(null)}
              className={cn("shrink-0 rounded-[10px] px-3 py-2 text-sm", tablero ? "bg-white/15" : "text-[#f2f5f9]/75")}
            >
              Tablero
              {avisos > 0 ? (
                <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-[#7cc0f5] px-1.5 text-[11px] font-medium text-[#0e1116]">{avisos}</span>
              ) : null}
            </Link>
            {GRUPOS.map((grupo) => {
              const activo = grupo.items.some((item) => path.startsWith(item.to));
              const aLaDerecha = grupo.label === "Legal" || grupo.label === "Plataforma";
              return (
                <div key={grupo.label} className="relative shrink-0">
                  <button
                    type="button"
                    className={cn("rounded-[10px] px-3 py-2 text-sm", activo || abierto === grupo.label ? "bg-white/15" : "text-[#f2f5f9]/75")}
                    onClick={() => setAbierto((actual) => (actual === grupo.label ? null : grupo.label))}
                  >
                    {grupo.label}
                  </button>
                  {abierto === grupo.label ? (
                    <div className={cn("absolute top-full z-50 mt-2 min-w-56 rounded-[10px] border border-white/10 bg-[#1b212b] py-1 shadow-xl", aLaDerecha ? "right-0" : "left-0")}>
                      {grupo.items.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setAbierto(null)}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm",
                            path.startsWith(item.to) ? "bg-white/15" : "text-[#f2f5f9]/80",
                          )}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <button type="button" className="shrink-0 text-xs text-[#f2f5f9]/70" onClick={() => void signOut("/torre/login")}>
            Salir
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">Varios negocios</p>
        <h1 className="mt-1 mb-5 font-display text-[1.65rem] leading-none font-semibold">{title}</h1>
        {avisos > 0 && !tablero ? (
          <p className="mb-4 rounded-md bg-warn-bg px-3 py-2 text-sm text-terra">
            {avisos === 1 ? "Hay un add-on esperando habilitación." : `Hay ${avisos} add-ons esperando habilitación.`}{" "}
            <Link to="/torre" className="font-medium underline">Ver en el tablero</Link>
          </p>
        ) : null}
        {tablero ? (
          children
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">{children}</div>
            <TorrePanel clave={claveDe(path)} />
          </div>
        )}
      </main>
    </div>
  );
}

function claveDe(path: string) {
  const tabla: [string, string][] = [
    ["/torre/tenants", "negocios"],
    ["/torre/clientes", "clientes"],
    ["/torre/planes", "planes"],
    ["/torre/productos", "precios"],
    ["/torre/servicios", "servicios"],
    ["/torre/suscripciones", "suscripciones"],
    ["/torre/sucursales", "sucursales"],
    ["/torre/promociones", "promociones"],
    ["/torre/publicidad", "publicidad"],
    ["/torre/finanzas", "finanzas"],
    ["/torre/mercado", "operacion"],
    ["/torre/super-al-toque", "super-al-toque"],
    ["/torre/legal", "legal"],
    ["/torre/procesadores", "procesadores"],
    ["/torre/apps", "apps"],
    ["/torre/versiones", "versiones"],
    ["/torre/deployments", "deployments"],
    ["/torre/auditoria", "auditoria"],
    ["/torre/configuracion", "configuracion"],
  ];
  return tabla.find(([prefijo]) => path.startsWith(prefijo))?.[1] ?? "negocios";
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