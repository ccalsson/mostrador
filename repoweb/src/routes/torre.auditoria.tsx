import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TorreShell } from "@/components/torre-shell";
import { listAudit } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/auditoria")({ component: Page });

const FILTROS = [
  { id: "todos", label: "Eventos" },
  { id: "comercial", label: "Cambios comerciales" },
  { id: "contractual", label: "Cambios contractuales" },
] as const;

function clase(entity: string) {
  if (["legal_document", "legal_version", "tenant_contract", "processor"].includes(entity)) return "contractual";
  return "comercial";
}

function Page() {
  const lista = useQuery({ queryKey: ["torre-audit"], queryFn: () => listAudit() });
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const rows = (lista.data ?? []).filter((row) => filtro === "todos" || clase(row.entity) === filtro);
  return (
    <TorreShell title="Auditoría">
      <p className="mb-3 max-w-2xl text-sm text-muted">Este registro no se edita desde Torre. Cada fila la escribe el servidor.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTROS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filtro === item.id ? "min-h-11 rounded-full bg-ink px-3 text-sm text-paper" : "min-h-11 rounded-full border border-line px-3 text-sm"}
            onClick={() => setFiltro(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {rows.map((row, index) => (
          <li key={`${row.at}-${row.entityId}-${index}`} className="px-3 py-2">
            <span className="font-medium">{row.action}</span>
            <span className="ml-2 text-muted">{row.entity} {row.entityId}</span>
            <p className="text-xs text-muted">{row.actor} · {row.at}</p>
            {row.metadata && row.metadata !== "{}" ? <p className="mt-1 break-all font-mono text-[11px] text-muted">{row.metadata}</p> : null}
          </li>
        ))}
        {rows.length === 0 ? <li className="px-3 py-4 text-muted">No hay eventos en esta vista.</li> : null}
      </ul>
    </TorreShell>
  );
}