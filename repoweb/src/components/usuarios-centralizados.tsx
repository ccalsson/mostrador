import { cn } from "@/lib/cn";
import type { UsuarioUnificado } from "@/lib/torre/usuarios-core";

const APP_COLORS: Record<string, string> = {
  Mostrador: "bg-leaf/15 text-leaf",
  Mercado: "bg-[#e3c56a]/20 text-[#b8960a]",
  "Super al Toque": "bg-sky/15 text-sky",
  "Materiales Ya": "bg-terra/15 text-terra",
  Torre: "bg-purple-500/15 text-purple-500",
};

const APP_OPTIONS = [
  { value: "", label: "Todas las apps" },
  { value: "Mostrador", label: "Mostrador" },
  { value: "Mercado", label: "Mercado" },
  { value: "Super al Toque", label: "Super al Toque" },
  { value: "Materiales Ya", label: "Materiales Ya" },
  { value: "Torre", label: "Torre" },
];

const ROL_OPTIONS = [
  { value: "", label: "Todos los roles" },
  { value: "admin", label: "Admin" },
  { value: "cajero", label: "Cajero" },
  { value: "vendedor", label: "Vendedor" },
  { value: "comprador", label: "Comprador" },
  { value: "cargador", label: "Cargador" },
  { value: "administracion", label: "Administracion (Torre)" },
  { value: "comercial", label: "Comercial (Torre)" },
  { value: "legal", label: "Legal (Torre)" },
  { value: "soporte", label: "Soporte (Torre)" },
  { value: "auditoria", label: "Auditoria (Torre)" },
];

type Props = {
  app: string;
  rol: string;
  busqueda: string;
  activo: string;
  usuarios: UsuarioUnificado[];
  isLoading: boolean;
  onAppChange: (v: string) => void;
  onRolChange: (v: string) => void;
  onBusquedaChange: (v: string) => void;
  onActivoChange: (v: string) => void;
};

export function UsuariosCentralizados({
  app,
  rol,
  busqueda,
  activo,
  usuarios,
  isLoading,
  onAppChange,
  onRolChange,
  onBusquedaChange,
  onActivoChange,
}: Props) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium">
          App
          <select
            value={app}
            onChange={(e) => onAppChange(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          >
            {APP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Rol
          <select
            value={rol}
            onChange={(e) => onRolChange(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          >
            {ROL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Estado
          <select
            value={activo}
            onChange={(e) => onActivoChange(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          >
            <option value="">Todos</option>
            <option value="si">Activos</option>
            <option value="no">Inactivos</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Buscar
          <input
            type="text"
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
            placeholder="Nombre o email..."
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          />
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted">Cargando...</p>}

      {!isLoading && usuarios.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay usuarios que coincidan con los filtros.
        </p>
      )}

      {!isLoading && usuarios.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Telefono</th>
                  <th className="px-3 py-2 font-medium">Apps</th>
                  <th className="px-3 py-2 font-medium">Ultimo login</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id || u.email} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 font-medium">{u.nombre}</td>
                    <td className="px-3 py-2 text-muted">{u.email}</td>
                    <td className="px-3 py-2 text-muted">{u.telefono || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {u.apps.map((a, i) => (
                          <span
                            key={`${a.app}-${i}`}
                            title={`${a.app}: ${a.rol}${a.tenantNombre ? ` (${a.tenantNombre})` : ""}`}
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                              APP_COLORS[a.app] ?? "bg-muted/15 text-muted",
                            )}
                          >
                            {a.app}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {u.ultimoLogin ? u.ultimoLogin.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          u.activoGlobal ? "bg-leaf/15 text-leaf" : "bg-muted/15 text-muted",
                        )}
                      >
                        {u.activoGlobal ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {usuarios.map((u) => (
              <article
                key={u.id || u.email}
                className="rounded-lg border border-line bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{u.nombre}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      u.activoGlobal ? "bg-leaf/15 text-leaf" : "bg-muted/15 text-muted",
                    )}
                  >
                    {u.activoGlobal ? "Activo" : "Inactivo"}
                  </span>
                </div>
                {u.telefono ? (
                  <p className="mt-1 text-xs text-muted">{u.telefono}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {u.apps.map((a, i) => (
                    <span
                      key={`${a.app}-${i}`}
                      title={`${a.app}: ${a.rol}`}
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                        APP_COLORS[a.app] ?? "bg-muted/15 text-muted",
                      )}
                    >
                      {a.app}
                    </span>
                  ))}
                  {u.ultimoLogin ? (
                    <span className="ml-auto text-[10px] text-muted">
                      {u.ultimoLogin.slice(0, 16).replace("T", " ")}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
