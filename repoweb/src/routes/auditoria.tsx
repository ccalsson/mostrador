import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { listAuditoria } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { clock, dayLabel, money } from "@/lib/money";
import { PAGO_LABEL, type FormaPago } from "@/lib/types";

export const Route = createFileRoute("/auditoria")({ component: AuditoriaPage });

const ETIQUETA: Record<string, string> = {
  cobroId: "Cobro",
  pedidoId: "Pedido",
  total: "Total",
  formaPago: "Medio",
  motivo: "Motivo",
  id: "Referencia",
  nombre: "Nombre",
  email: "Email",
  rol: "Rol",
  activo: "Activo",
  tipo: "Tipo",
  cantidad: "Cantidad",
  productoId: "Producto",
};

function leerDetalle(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    /* texto plano */
  }
  return raw ? { detalle: raw } : {};
}

function mostrar(clave: string, value: unknown) {
  if (clave === "total" && typeof value === "number") return money(value);
  if (clave === "formaPago" && typeof value === "string") return PAGO_LABEL[value as FormaPago] ?? value;
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AuditoriaPage() {
  const rows = useQuery({ queryKey: ["auditoria"], queryFn: () => listAuditoria() });
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <AppShell title="Auditoría">
      <div className="max-w-2xl">
        {rows.isPending ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : (rows.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-6 text-sm text-muted">
            El puesto está quieto. Cuando haya una venta, un alta o un cierre de caja, el movimiento queda acá.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {(rows.data ?? []).map((r) => {
              const detalle = leerDetalle(r.detalle);
              const abiertoEste = abierto === r.id;
              const cobroId = typeof detalle.cobroId === "string" ? detalle.cobroId : r.entidad === "cobro" && typeof detalle.id === "string" ? detalle.id : null;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setAbierto(abiertoEste ? null : r.id)}
                    className="flex w-full flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left hover:bg-paper"
                  >
                    <span>
                      <span className="font-medium">{r.accion.replaceAll("_", " ")}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {r.usuarioNombre ?? "sistema"} · {r.entidad}
                      </span>
                    </span>
                    <span className="text-xs text-muted">
                      {dayLabel(r.createdAt)} {clock(r.createdAt)}
                      <span className="ml-2">{abiertoEste ? "cerrar" : "ver"}</span>
                    </span>
                  </button>
                  {abiertoEste ? (
                    <div className="mx-4 mb-3 rounded-md bg-paper px-3 py-2 text-sm">
                      {Object.keys(detalle).length === 0 ? (
                        <p className="text-muted">Este movimiento no guardó más datos.</p>
                      ) : (
                        <dl className="space-y-1">
                          {Object.entries(detalle).map(([clave, value]) => (
                            <div key={clave} className="flex justify-between gap-3">
                              <dt className="text-muted">{ETIQUETA[clave] ?? clave}</dt>
                              <dd className={cn("text-right", clave === "motivo" && "max-w-[16rem]")}>
                                {mostrar(clave, value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {cobroId ? (
                        <Link to="/ticket/$cobroId" params={{ cobroId }} className="mt-2 inline-block text-sm font-medium text-leaf">
                          Ver ticket
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
