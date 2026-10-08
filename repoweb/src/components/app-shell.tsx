import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Scale,
  ScrollText,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { TemaBoton } from "@/components/tema-boton";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMarca, quienSoy } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { ROL_LABEL, type Rol } from "@/lib/types";
import { RedirectToSignIn } from "@/lib/auth/gates";

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles: Rol[] }[] = [
  { to: "/dashboard", label: "Tablero", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/caja", label: "Caja", icon: ShoppingBag, roles: ["admin", "cajero"] },
  { to: "/vendedor", label: "Puesto", icon: Scale, roles: ["admin", "vendedor"] },
  { to: "/productos", label: "Productos", icon: Boxes, roles: ["admin"] },
  { to: "/proveedores", label: "Proveedores", icon: Truck, roles: ["admin"] },
  { to: "/clientes", label: "Clientes", icon: UserRound, roles: ["admin"] },
  { to: "/remitos", label: "Remitos", icon: Receipt, roles: ["admin", "cajero"] },
  { to: "/arca", label: "ARCA", icon: FileText, roles: ["admin", "cajero"] },
  { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { to: "/contrato", label: "Contrato", icon: ScrollText, roles: ["admin"] },
  { to: "/auditoria", label: "Auditoría", icon: ClipboardList, roles: ["admin"] },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({
    queryKey: ["quien"],
    queryFn: () => quienSoy(),
    enabled: Boolean(user),
  });
  const marca = useQuery({ queryKey: ["marca"], queryFn: () => getMarca(), staleTime: 60_000 });
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
    const fondo = marca.data?.fondo;
    return (
      <div
        className="grid min-h-dvh place-items-center bg-leaf-2 bg-cover bg-center text-leaf-fg"
        style={fondo ? { backgroundImage: `linear-gradient(rgba(22,36,26,0.72), rgba(22,36,26,0.82)), url(${fondo})` } : undefined}
      >
        <div className="px-6 text-center">
          <p className="font-display text-3xl font-semibold">{marca.data?.nombre ?? "Mostrador"}</p>
          <p className="mt-1 text-sm text-leaf-fg/70">{marca.data?.bajada ?? "Mostrador"}</p>
          {marca.data?.membrete ? (
            <p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-xs text-leaf-fg/60">{marca.data.membrete}</p>
          ) : null}
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
    if (me.data?.tipo === "torre") return <Navigate to="/torre" />;
    if (me.data?.tipo === "mercado") {
      return (
        <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
          <p className="text-ink">Esta cuenta es de Mercado al Toque. No entra al puesto.</p>
        </div>
      );
    }
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <p className="text-ink">No se pudo cargar el puesto.</p>
      </div>
    );
  }

  const staff = me.data.staff;
  const puesto = me.data.tenant;
  const items = NAV.filter((n) => staff.rol === "admin" || n.roles.includes(staff.rol));

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-leaf-2 bg-leaf-2 text-leaf-fg">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-5 sm:py-2">
          <Link to="/" className="min-w-0 shrink-0">
            <span className="block max-w-40 truncate font-display text-sm font-semibold leading-tight tracking-tight sm:max-w-56 sm:text-lg">
              {puesto.nombre}
            </span>
            <span className="block truncate text-[11px] text-ambar sm:text-xs">{puesto.bajada || "Mostrador"}</span>
            {puesto.membrete ? (
              <span className="block max-w-40 truncate text-[10px] text-leaf-fg/60 sm:max-w-56">{puesto.membrete.replace(/\s+/g, " ")}</span>
            ) : null}
          </Link>
          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2 bg-leaf-2 pl-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
                online ? "bg-white/15 text-leaf-fg" : "bg-warn-bg text-terra",
              )}
            >
              {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              <span className="hidden lg:inline">{online ? "En red" : "Modo local"}</span>
            </span>
            <span className="hidden rounded-full bg-ambar/25 px-2.5 py-1 text-xs font-medium text-ambar xl:inline">
              {ROL_LABEL[staff.rol]}
            </span>
            <TemaBoton />
            <UserButton />
          </div>
        </div>
        <nav className="flex w-full min-w-0 gap-1 overflow-x-auto border-t border-white/10 px-2 py-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-xs sm:text-sm",
                  active ? "bg-terra text-white" : "text-leaf-fg/80",
                )}
              >
                <Icon className="size-4" />
                {item.label}
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
