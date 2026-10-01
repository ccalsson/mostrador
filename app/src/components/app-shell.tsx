import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ClipboardList,
  Contact,
  LayoutDashboard,
  LogOut,
  Receipt,
  Scale,
  ShoppingBag,
  Truck,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { TemaBoton } from "@/components/tema-boton";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { quienSoy } from "@/lib/fn";
import { getAfipConfig } from "@/lib/afip-fn";
import { cn } from "@/lib/cn";
import { ROL_LABEL, type Rol } from "@/lib/types";
import { RedirectToSignIn } from "@/lib/auth/gates";

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles: Rol[] }[] = [
  { to: "/dashboard", label: "Tablero", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/caja", label: "Caja", icon: ShoppingBag, roles: ["admin", "cajero"] },
  { to: "/vendedor", label: "Puesto", icon: Scale, roles: ["admin", "vendedor"] },
  { to: "/productos", label: "Productos", icon: Boxes, roles: ["admin"] },
  { to: "/clientes", label: "Clientes", icon: Contact, roles: ["admin"] },
  { to: "/proveedores", label: "Proveedores", icon: Truck, roles: ["admin"] },
  { to: "/remitos", label: "ARCA", icon: Receipt, roles: ["admin", "cajero"] },
  { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { to: "/auditoria", label: "Auditoría", icon: ClipboardList, roles: ["admin"] },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({
    queryKey: ["quien"],
    queryFn: () => quienSoy(),
    enabled: Boolean(user),
  });
  const rol = me.data?.tipo === "staff" ? me.data.staff.rol : null;
  const afip = useQuery({
    queryKey: ["afip-config"],
    queryFn: () => getAfipConfig(),
    enabled: rol === "admin" || rol === "cajero",
    staleTime: 15_000,
  });
  const arcaInhabilitado = !afip.data?.habilitada;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-leaf-2 text-leaf-fg">
        <div className="text-center">
          <p className="font-display text-3xl font-semibold">Frutas Román, el Jujeño</p>
          <p className="mt-1 text-sm text-leaf-fg/70">Mostrador</p>
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper text-muted">
        Cargando turno…
      </div>
    );
  }
  if (me.error || !me.data || me.data.tipo !== "staff") {
    if (me.data?.tipo === "cliente") return <Navigate to="/portal" />;
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <p className="text-ink">No se pudo cargar el puesto.</p>
      </div>
    );
  }

  const staff = me.data.staff;
  const items = NAV.filter((n) => staff.rol === "admin" || n.roles.includes(staff.rol));

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-leaf-2 bg-leaf-2 text-leaf-fg">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-5 sm:py-2">
          <Link to="/" className="min-w-0">
            <span className="block truncate font-display text-sm font-semibold leading-tight tracking-tight sm:text-lg">
              {me.data.tenant.nombre}
            </span>
            <span className="block text-[11px] text-ambar sm:text-xs">Mostrador</span>
          </Link>
          <nav className="ml-2 hidden min-w-0 items-center gap-1 md:flex">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              const inhabilitado = item.to === "/remitos" && arcaInhabilitado;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors",
                    active ? "bg-terra text-white" : "text-leaf-fg/80 hover:bg-white/10",
                    inhabilitado && !active && "opacity-70",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                  {inhabilitado ? <span className="text-[10px] font-medium uppercase tracking-wide">inhabilitado</span> : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
                online ? "bg-white/15 text-leaf-fg" : "bg-warn-bg text-terra",
              )}
            >
              {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              <span className="hidden sm:inline">{online ? "En red" : "Modo local"}</span>
            </span>
            <span className="hidden rounded-full bg-ambar/25 px-2.5 py-1 text-xs font-medium text-ambar sm:inline">
              {ROL_LABEL[staff.rol]}
            </span>
            <TemaBoton />
            <UserButton />
          </div>
        </div>
        <nav className="flex w-full min-w-0 gap-1 overflow-x-auto border-t border-white/10 px-2 py-1 md:hidden">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            const inhabilitado = item.to === "/remitos" && arcaInhabilitado;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] px-2.5 text-xs",
                  active ? "bg-terra text-white" : "text-leaf-fg/80",
                  inhabilitado && !active && "opacity-70",
                )}
              >
                <Icon className="size-4" />
                {inhabilitado ? "ARCA inhabilitado" : item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-[1400px] px-3 py-3 sm:px-5 sm:py-6">
        {title ? (
          <h1 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-leaf sm:mb-4 sm:text-2xl">
            <span className="h-5 w-1 shrink-0 rounded-full bg-terra" aria-hidden />
            {title}
          </h1>
        ) : null}
        {children}
      </main>
      <a
        href="/login"
        className="sr-only"
        aria-hidden
      >
        <LogOut className="size-4" />
      </a>
    </div>
  );
}
