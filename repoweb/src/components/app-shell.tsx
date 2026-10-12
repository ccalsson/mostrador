import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Megaphone,
  Package,
  ChevronDown,
  LogOut,
  Receipt,
  Scale,
  ScrollText,
  ShoppingBag,
  Smartphone,
  Truck,
  UserRound,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { TemaBoton } from "@/components/tema-boton";
import { PuertaLegal } from "@/components/puerta-legal";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { quienSoy } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { ROL_LABEL, type Rol } from "@/lib/types";
import { RedirectToSignIn } from "@/lib/auth/gates";

const GRUPOS: { id: string; label: string; items: { to: string; label: string; icon: typeof LayoutDashboard; roles: Rol[] }[] }[] = [
  {
    id: "operacion",
    label: "Operación",
    items: [
      { to: "/caja", label: "Caja", icon: ShoppingBag, roles: ["admin", "cajero"] },
      { to: "/vendedor", label: "Puesto", icon: Scale, roles: ["admin", "vendedor"] },
      { to: "/remitos", label: "Remitos", icon: Receipt, roles: ["admin", "cajero"] },
      { to: "/arca", label: "ARCA", icon: FileText, roles: ["admin", "cajero"] },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo",
    items: [
      { to: "/productos", label: "Productos", icon: Boxes, roles: ["admin"] },
      { to: "/proveedores", label: "Proveedores", icon: Truck, roles: ["admin"] },
      { to: "/clientes", label: "Clientes", icon: UserRound, roles: ["admin"] },
      { to: "/clientes-app", label: "De la app", icon: Smartphone, roles: ["admin"] },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    items: [
      { to: "/addons", label: "Add-ons", icon: Package, roles: ["admin"] },
      { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
      { to: "/contrato", label: "Contrato", icon: ScrollText, roles: ["admin"] },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    items: [{ to: "/marketing", label: "Marketing", icon: Megaphone, roles: ["admin"] }],
  },
  {
    id: "informes",
    label: "Informes",
    items: [
      { to: "/dashboard", label: "Tablero", icon: LayoutDashboard, roles: ["admin"] },
      { to: "/auditoria", label: "Auditoría", icon: ClipboardList, roles: ["admin"] },
    ],
  },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({
    queryKey: ["quien"],
    queryFn: () => quienSoy(),
    enabled: Boolean(user),
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [online, setOnline] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);

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

  useEffect(() => {
    setMenu(null);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener("pointerdown", cerrar);
    return () => window.removeEventListener("pointerdown", cerrar);
  }, [menu]);

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-leaf-2 text-leaf-fg">
        <div className="px-6 text-center">
          <p className="font-display text-3xl font-semibold">Mostrador</p>
          <p className="mt-1 text-sm text-leaf-fg/70">tu gestión inteligente</p>
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
  const grupos = GRUPOS.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => staff.rol === "admin" || item.roles.includes(staff.rol)),
  })).filter((grupo) => grupo.items.length > 0);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-leaf-2 bg-leaf-2 text-leaf-fg">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-5 sm:py-2">
          <Link to="/" className="min-w-0 shrink-0">
            <span className="block max-w-40 truncate font-display text-sm font-semibold leading-tight tracking-tight sm:max-w-56 sm:text-lg">
              Mostrador
            </span>
            <span className="block truncate text-[11px] text-ambar sm:text-xs">tu gestión inteligente</span>
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
        <nav
          className="relative flex w-full min-w-0 flex-wrap gap-1 border-t border-white/10 px-2 py-1"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {grupos.map((grupo, index) => {
            const activo = grupo.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
            const abierto = menu === grupo.id;
            const alBorde = index >= grupos.length - 2;
            return (
              <div key={grupo.id} className="relative">
                <button
                  type="button"
                  aria-expanded={abierto}
                  className={cn(
                    "inline-flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-xs sm:text-sm",
                    activo || abierto ? "bg-terra text-white" : "text-leaf-fg/80",
                  )}
                  onClick={() => setMenu(abierto ? null : grupo.id)}
                >
                  {grupo.label}
                  <ChevronDown className={cn("size-3.5", abierto && "rotate-180")} />
                </button>
                {abierto ? (
                  <div
                    className={cn(
                      "absolute top-full z-40 mt-1 hidden min-w-44 rounded-lg border border-line bg-surface py-1 text-ink shadow-lg sm:block",
                      alBorde ? "right-0" : "left-0",
                    )}
                  >
                    {grupo.items.map((item) => {
                      const Icon = item.icon;
                      const marcado = pathname === item.to || pathname.startsWith(`${item.to}/`);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            "flex h-10 items-center gap-2 px-3 text-sm",
                            marcado ? "bg-leaf/10 font-medium text-leaf" : "text-ink",
                          )}
                          onClick={() => setMenu(null)}
                        >
                          <Icon className="size-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          {menu ? (
            <div className="basis-full sm:hidden">
              {grupos
                .filter((grupo) => grupo.id === menu)
                .map((grupo) => (
                  <div key={grupo.id} className="mt-1 overflow-hidden rounded-lg border border-line bg-surface py-1 text-ink">
                    {grupo.items.map((item) => {
                      const Icon = item.icon;
                      const marcado = pathname === item.to || pathname.startsWith(`${item.to}/`);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            "flex h-10 items-center gap-2 px-3 text-sm",
                            marcado ? "bg-leaf/10 font-medium text-leaf" : "text-ink",
                          )}
                          onClick={() => setMenu(null)}
                        >
                          <Icon className="size-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
            </div>
          ) : null}
        </nav>
      </header>
      <main className="mx-auto max-w-[1400px] px-3 py-3 sm:px-5 sm:py-6">
        {title ? (
          <h1 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-leaf sm:mb-4 sm:text-2xl">
            <span className="h-5 w-1 shrink-0 rounded-full bg-terra" aria-hidden />
            {title}
          </h1>
        ) : null}
        <PuertaLegal modo="mostrador">{children}</PuertaLegal>
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
