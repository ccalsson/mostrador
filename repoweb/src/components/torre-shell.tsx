import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { TorrePanel } from "@/components/torre-panel";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { torreYo } from "@/lib/torre-fn";
import { comprobantePago, habilitarPedidoAddon, pedidosAddon } from "@/lib/torre/control-fn";
import { cn } from "@/lib/cn";

const GRUPOS = [
  {
    label: "Comercial",
    items: [
      { to: "/torre/tenants", label: "Negocios" },
      { to: "/torre/clientes", label: "Clientes" },
      { to: "/torre/clientes-360", label: "Clientes 360°" },
      { to: "/torre/planes", label: "Planes" },
      { to: "/torre/productos", label: "Add-ons y precios" },
      { to: "/torre/servicios", label: "Servicios" },
      { to: "/torre/suscripciones", label: "Suscripciones" },
      { to: "/torre/sucursales", label: "Sucursales" },
      { to: "/torre/promociones", label: "Promociones" },
      { to: "/torre/publicidad", label: "Publicidad" },
      { to: "/torre/marketing-auto", label: "Marketing Automation" },
      { to: "/torre/grupos-empresariales", label: "Grupos Empresariales" },
      { to: "/torre/finanzas", label: "Finanzas" },
      { to: "/torre/financiero-consolidado", label: "Control Financiero" },
    ],
  },
  {
    label: "Operación",
    items: [
      { to: "/torre/mercado", label: "Mostrador y Mercado" },
      { to: "/torre/catalogo-unificado", label: "Catálogo Unificado" },
      { to: "/torre/inventario", label: "Inventario" },
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
      { to: "/torre/ejecutivo", label: "Dashboard Ejecutivo" },
      { to: "/torre/usuarios", label: "Usuarios" },
      { to: "/torre/reglas-auto", label: "Reglas Automaticas" },
      { to: "/torre/bi-forecast", label: "BI & Forecasting" },
      { to: "/torre/api-marketplace", label: "API Marketplace" },
      { to: "/torre/white-label", label: "White-Label" },
      { to: "/torre/sire", label: "SIRE · Instituciones" },
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
      <header className="sticky top-0 z-30 border-b border-[#e3c56a]/25 bg-[#12100e] text-[#f4efe4]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:flex-nowrap lg:gap-4">
          <Link to="/torre" className="shrink-0 border-r border-white/10 pr-4" onClick={() => setAbierto(null)}>
            <p className="text-[10px] font-medium tracking-[0.16em] text-[#e3c56a] uppercase">Consola</p>
            <p className="font-display text-lg leading-none font-semibold tracking-tight">Torre</p>
          </Link>
          <nav aria-label="Navegación Torre" className="order-3 flex min-w-0 basis-full flex-nowrap items-center gap-1 overflow-x-auto lg:order-none lg:flex-1 lg:basis-auto lg:overflow-visible">
            <Link
              to="/torre"
              onClick={() => setAbierto(null)}
              className={cn("shrink-0 whitespace-nowrap rounded-[10px] px-3 py-3 text-sm lg:py-2", tablero ? "bg-white/15" : "text-[#f4efe4]/75")}
            >
              Tablero
              {avisos > 0 ? (
                <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-[#e3c56a] px-1.5 text-[11px] font-medium text-[#14110e]">{avisos}</span>
              ) : null}
            </Link>
            {GRUPOS.map((grupo) => {
              const activo = grupo.items.some((item) => path.startsWith(item.to));
              const aLaDerecha = grupo.label === "Legal" || grupo.label === "Plataforma";
              return (
                <div key={grupo.label} className="relative shrink-0">
                  <button
                    type="button"
                    aria-expanded={abierto === grupo.label}
                    className={cn("whitespace-nowrap rounded-[10px] px-3 py-3 text-sm lg:py-2", activo || abierto === grupo.label ? "bg-white/15" : "text-[#f4efe4]/75")}
                    onClick={() => setAbierto((actual) => (actual === grupo.label ? null : grupo.label))}
                  >
                    {grupo.label}
                  </button>
                  {abierto === grupo.label ? (
                    <div className={cn("absolute top-full z-50 mt-2 hidden min-w-56 rounded-[10px] border border-white/10 bg-[#1a1612] py-1 shadow-xl lg:block", aLaDerecha ? "right-0" : "left-0")}>
                      {grupo.items.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setAbierto(null)}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm",
                            path.startsWith(item.to) ? "bg-white/15" : "text-[#f4efe4]/80",
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
          <button type="button" className="ml-auto shrink-0 px-2 py-3 text-xs text-[#f4efe4]/70 lg:ml-0" onClick={() => void signOut("/torre/login")}>
            Salir
          </button>
          {abierto ? (
            <div className="order-4 max-h-[60dvh] basis-full overflow-y-auto rounded-[10px] border border-white/10 bg-[#1a1612] py-1 lg:hidden">
              {GRUPOS.find((grupo) => grupo.label === abierto)?.items.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setAbierto(null)}
                  className={cn("block rounded-md px-3 py-3 text-sm", path.startsWith(item.to) ? "bg-white/15" : "text-[#f4efe4]/80")}>
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">Varios negocios</p>
        <h1 className="mt-1 mb-5 font-display text-[1.65rem] leading-none font-semibold">{title}</h1>
        {tablero ? (
          children
        ) : (
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">
              <PendientesAddon />
              {children}
            </div>
            <TorrePanel clave={claveDe(path)} />
          </div>
        )}
      </main>
    </div>
  );
}

export function PendientesAddon({ detalle = false }: { detalle?: boolean }) {
  const pedidos = useQuery({ queryKey: ["torre-pedidos-addon"], queryFn: () => pedidosAddon() });
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState<{ nombre: string; data: string } | null>(null);
  const lista = pedidos.data ?? [];
  if (pedidos.isPending || lista.length === 0) return null;
  return (
    <section className="mb-4 space-y-2">
      {lista.map((pedido) => (
        <article key={pedido.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warn-bg px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-wide text-terra uppercase">Falta habilitar</p>
            <p className="font-medium">{pedido.product}</p>
            <p className="text-sm text-muted">
              {pedido.tenant} · {pedido.currency} {pedido.amount} · {pedido.medio === "cuenta" ? "a cargo en cuenta" : "transferencia"}
            </p>
            {detalle && pedido.notes ? <p className="mt-1 text-xs text-muted">{pedido.notes}</p> : null}
            {detalle && pedido.comprobanteNombre ? <p className="text-xs text-muted">{pedido.comprobanteNombre}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {detalle && pedido.tieneComprobante ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void comprobantePago({ data: pedido.id })
                    .then((archivo) => setComprobante(archivo))
                    .catch((err: Error) => toast.error(err.message));
                }}
              >
                Ver comprobante
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={ocupado === pedido.id}
              onClick={() => {
                setOcupado(pedido.id);
                void habilitarPedidoAddon({ data: pedido.id })
                  .then(async () => {
                    toast.success(`${pedido.product} habilitado`);
                    setComprobante(null);
                    await qc.invalidateQueries({ queryKey: ["torre-pedidos-addon"] });
                    await qc.invalidateQueries({ queryKey: ["torre-comercial"] });
                  })
                  .catch((err: Error) => toast.error(err.message))
                  .finally(() => setOcupado(null));
              }}
            >
              {ocupado === pedido.id ? "Habilitando…" : "Habilitar"}
            </Button>
          </div>
        </article>
      ))}
      {detalle && comprobante?.data.startsWith("data:image/") ? (
        <img src={comprobante.data} alt={comprobante.nombre} className="max-h-80 rounded-md border border-line" />
      ) : null}
      {detalle && comprobante && !comprobante.data.startsWith("data:image/") ? (
        <a className="inline-block text-sm text-leaf" href={comprobante.data} download={comprobante.nombre}>
          Bajar {comprobante.nombre}
        </a>
      ) : null}
    </section>
  );
}

function claveDe(path: string) {
  const tabla: [string, string][] = [
    ["/torre/ejecutivo", "ejecutivo"],
    ["/torre/usuarios", "usuarios"],
    ["/torre/reglas-auto", "reglas-auto"],
    ["/torre/bi-forecast", "bi-forecast"],
    ["/torre/api-marketplace", "api-marketplace"],
    ["/torre/white-label", "white-label"],
    ["/torre/tenants", "negocios"],
    ["/torre/clientes", "clientes"],
    ["/torre/clientes-360", "clientes-360"],
    ["/torre/planes", "planes"],
    ["/torre/productos", "precios"],
    ["/torre/servicios", "servicios"],
    ["/torre/suscripciones", "suscripciones"],
    ["/torre/sucursales", "sucursales"],
    ["/torre/promociones", "promociones"],
    ["/torre/publicidad", "publicidad"],
    ["/torre/marketing-auto", "marketing-auto"],
    ["/torre/grupos-empresariales", "grupos-empresariales"],
    ["/torre/finanzas", "finanzas"],
    ["/torre/financiero-consolidado", "financiero-consolidado"],
    ["/torre/mercado", "operacion"],
    ["/torre/catalogo-unificado", "catalogo-unificado"],
    ["/torre/inventario", "inventario"],
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
