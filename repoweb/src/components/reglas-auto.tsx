import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/torre-shell";
import type {
  Regla,
  Condicion,
  Accion,
  ResultadoEvaluacion,
} from "@/lib/torre/reglas-auto-core";
import { condicionLabel, accionLabel } from "@/lib/torre/reglas-auto-fn";

type Tab = "reglas" | "ejecucion" | "log";

type CondicionTipo = Condicion["tipo"];
type AccionTipo = Accion["tipo"];

type Props = {
  tab: Tab;
  reglas: Regla[];
  resultados: ResultadoEvaluacion[];
  log: ResultadoEvaluacion[];
  isLoading: boolean;
  isEvaluating: boolean;
  editingRule: Regla | null;
  showForm: boolean;
  onTabChange: (tab: Tab) => void;
  onNewRule: () => void;
  onEditRule: (regla: Regla) => void;
  onDeleteRule: (id: string) => void;
  onToggleActivo: (regla: Regla) => void;
  onSaveRule: (data: { nombre: string; descripcion: string; condicion: Condicion; accion: Accion; activo: boolean }) => void;
  onCancelForm: () => void;
  onEvaluarAhora: () => void;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "reglas", label: "Reglas" },
  { key: "ejecucion", label: "Ejecucion manual" },
  { key: "log", label: "Log" },
];

const CONDICION_TIPOS: { value: CondicionTipo; label: string }[] = [
  { value: "stock_bajo", label: "Stock bajo" },
  { value: "pago_vencido", label: "Pago vencido" },
  { value: "caja_negativa", label: "Caja negativa" },
  { value: "revenue_drop", label: "Caida de ingresos" },
];

const ACCION_TIPOS: { value: AccionTipo; label: string }[] = [
  { value: "alerta", label: "Alerta" },
  { value: "notificacion", label: "Notificacion" },
  { value: "flag", label: "Flag" },
];

function condicionResumen(c: Condicion): string {
  const label = condicionLabel(c.tipo);
  if (c.tipo === "stock_bajo") return `${label}: umbral ${c.umbral}%`;
  if (c.tipo === "pago_vencido") return `${label}: mas de ${c.periodoDias ?? 7} dias`;
  if (c.tipo === "caja_negativa") return `${label}: periodo ${c.periodoDias ?? 30} dias`;
  if (c.tipo === "revenue_drop") return `${label}: caida > ${c.umbral}% en ${c.periodoDias ?? 30} dias`;
  return label;
}

function accionResumen(a: Accion): string {
  return `${accionLabel(a.tipo)} -> ${a.destino}: ${a.mensaje}`;
}

export function ReglasAuto({
  tab,
  reglas,
  resultados,
  log,
  isLoading,
  isEvaluating,
  editingRule,
  showForm,
  onTabChange,
  onNewRule,
  onEditRule,
  onDeleteRule,
  onToggleActivo,
  onSaveRule,
  onCancelForm,
  onEvaluarAhora,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex rounded-md bg-paper-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={cn(
              "h-8 flex-1 rounded-md px-3 text-sm transition-colors",
              t.key === tab ? "bg-surface font-medium" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.key === "reglas" && reglas.length > 0 ? (
              <span className="ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-leaf/15 px-1.5 text-[11px] font-medium text-leaf">
                {reglas.filter((r) => r.activo).length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted">Cargando...</p>}

      {/* Reglas tab */}
      {tab === "reglas" && !isLoading && (
        <ReglasTab
          reglas={reglas}
          showForm={showForm}
          editingRule={editingRule}
          onNewRule={onNewRule}
          onEditRule={onEditRule}
          onDeleteRule={onDeleteRule}
          onToggleActivo={onToggleActivo}
          onSaveRule={onSaveRule}
          onCancelForm={onCancelForm}
        />
      )}

      {/* Ejecucion manual tab */}
      {tab === "ejecucion" && !isLoading && (
        <EjecucionTab
          resultados={resultados}
          isEvaluating={isEvaluating}
          onEvaluarAhora={onEvaluarAhora}
        />
      )}

      {/* Log tab */}
      {tab === "log" && !isLoading && (
        <LogTab log={log} />
      )}
    </div>
  );
}

function ReglasTab({
  reglas,
  showForm,
  editingRule,
  onNewRule,
  onEditRule,
  onDeleteRule,
  onToggleActivo,
  onSaveRule,
  onCancelForm,
}: {
  reglas: Regla[];
  showForm: boolean;
  editingRule: Regla | null;
  onNewRule: () => void;
  onEditRule: (regla: Regla) => void;
  onDeleteRule: (id: string) => void;
  onToggleActivo: (regla: Regla) => void;
  onSaveRule: (data: { nombre: string; descripcion: string; condicion: Condicion; accion: Accion; activo: boolean }) => void;
  onCancelForm: () => void;
}) {
  if (showForm) {
    return (
      <RuleForm
        editingRule={editingRule}
        onSave={onSaveRule}
        onCancel={onCancelForm}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{reglas.length} regla(s) definida(s)</p>
        <Button size="sm" onClick={onNewRule}>Nueva regla</Button>
      </div>
      {reglas.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay reglas definidas. Crea una para comenzar.
        </p>
      )}
      {reglas.map((r) => (
        <article
          key={r.id}
          className={cn(
            "rounded-lg border border-line bg-surface p-3",
            !r.activo && "opacity-60",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{r.nombre}</p>
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                    r.activo ? "bg-leaf/15 text-leaf" : "bg-paper-2 text-muted",
                  )}
                >
                  {r.activo ? "Activa" : "Inactiva"}
                </span>
              </div>
              {r.descripcion ? (
                <p className="mt-0.5 text-sm text-muted">{r.descripcion}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted">
                SI {condicionResumen(r.condicion)}
              </p>
              <p className="text-xs text-muted">
                ENTONCES {accionResumen(r.accion)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" onClick={() => onToggleActivo(r)}>
                {r.activo ? "Desactivar" : "Activar"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onEditRule(r)}>
                Editar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => {
                if (confirm(`Eliminar regla "${r.nombre}"?`)) onDeleteRule(r.id);
              }}>
                Borrar
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function RuleForm({
  editingRule,
  onSave,
  onCancel,
}: {
  editingRule: Regla | null;
  onSave: (data: { nombre: string; descripcion: string; condicion: Condicion; accion: Accion; activo: boolean }) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(editingRule?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(editingRule?.descripcion ?? "");
  const [condicionTipo, setCondicionTipo] = useState<CondicionTipo>(editingRule?.condicion.tipo ?? "stock_bajo");
  const [umbral, setUmbral] = useState(String(editingRule?.condicion.umbral ?? 80));
  const [periodoDias, setPeriodoDias] = useState(String(editingRule?.condicion.periodoDias ?? 7));
  const [accionTipo, setAccionTipo] = useState<AccionTipo>(editingRule?.accion.tipo ?? "alerta");
  const [destino, setDestino] = useState(editingRule?.accion.destino ?? "global");
  const [mensaje, setMensaje] = useState(editingRule?.accion.mensaje ?? "");
  const [activo, setActivo] = useState(editingRule?.activo ?? true);

  const handleSave = () => {
    const condicion: Condicion = {
      tipo: condicionTipo,
      umbral: Number(umbral) || 0,
      periodoDias: Number(periodoDias) || undefined,
    };
    const accion: Accion = {
      tipo: accionTipo,
      destino,
      mensaje,
    };
    onSave({ nombre, descripcion, condicion, accion, activo });
  };

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <p className="font-display text-lg font-semibold">
        {editingRule ? "Editar regla" : "Nueva regla"}
      </p>
      <Field label="Nombre" value={nombre} onChange={setNombre} />
      <label className="mt-2 block text-sm font-medium">
        Descripcion
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
        />
      </label>

      <p className="mt-3 text-xs font-medium tracking-wide text-muted uppercase">Condicion</p>
      <SelectField
        label="Tipo"
        value={condicionTipo}
        onChange={(v) => setCondicionTipo(v as CondicionTipo)}
        options={CONDICION_TIPOS.map((c) => ({ value: c.value, label: c.label }))}
      />
      <Field label="Umbral (%)" value={umbral} onChange={setUmbral} type="number" />
      <Field label="Periodo (dias)" value={periodoDias} onChange={setPeriodoDias} type="number" />

      <p className="mt-3 text-xs font-medium tracking-wide text-muted uppercase">Accion</p>
      <SelectField
        label="Tipo"
        value={accionTipo}
        onChange={(v) => setAccionTipo(v as AccionTipo)}
        options={ACCION_TIPOS.map((a) => ({ value: a.value, label: a.label }))}
      />
      <Field label="Destino" value={destino} onChange={setDestino} />
      <label className="mt-2 block text-sm font-medium">
        Mensaje
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-2 flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
        Activa
      </label>

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={handleSave}>
          {editingRule ? "Guardar cambios" : "Crear regla"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function EjecucionTab({
  resultados,
  isEvaluating,
  onEvaluarAhora,
}: {
  resultados: ResultadoEvaluacion[];
  isEvaluating: boolean;
  onEvaluarAhora: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={isEvaluating}
          onClick={onEvaluarAhora}
        >
          {isEvaluating ? "Evaluando..." : "Evaluar todas las reglas ahora"}
        </Button>
        {resultados.length > 0 && (
          <p className="text-sm text-muted">
            {resultados.filter((r) => r.disparada).length} de {resultados.length} regla(s) disparada(s)
          </p>
        )}
      </div>

      {resultados.length === 0 && !isEvaluating && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          Presiona el boton para evaluar todas las reglas activas contra los datos actuales.
        </p>
      )}

      {resultados.map((r) => (
        <article
          key={r.reglaId}
          className={cn(
            "rounded-lg border border-line border-l-4 bg-surface p-3",
            r.disparada ? "border-l-terra bg-[#fef3f2]" : "border-l-leaf bg-[#f0fdf4]",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                r.disparada ? "bg-terra text-white" : "bg-leaf text-white",
              )}
            >
              {r.disparada ? "!" : "OK"}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{r.reglaNombre}</p>
              <p className="mt-0.5 text-sm text-muted">{r.detalle}</p>
              <p className="mt-1 text-xs text-muted">
                Evaluado: {formatFecha(r.evaluadoAt)}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function LogTab({ log }: { log: ResultadoEvaluacion[] }) {
  if (log.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
        No hay evaluaciones registradas aun.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Regla</th>
              <th className="px-3 py-2 font-medium">Resultado</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {log.map((r, i) => (
              <tr key={`${r.reglaId}-${r.evaluadoAt}-${i}`} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 text-muted tabular-nums whitespace-nowrap">
                  {formatFecha(r.evaluadoAt)}
                </td>
                <td className="px-3 py-2 font-medium">{r.reglaNombre}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      r.disparada ? "bg-terra/15 text-terra" : "bg-leaf/15 text-leaf",
                    )}
                  >
                    {r.disparada ? "Disparada" : "OK"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted text-xs">{r.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {log.map((r, i) => (
          <article key={`${r.reglaId}-${r.evaluadoAt}-${i}`} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{r.reglaNombre}</p>
                <p className="text-xs text-muted">{formatFecha(r.evaluadoAt)}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                  r.disparada ? "bg-terra/15 text-terra" : "bg-leaf/15 text-leaf",
                )}
              >
                {r.disparada ? "Disparada" : "OK"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{r.detalle}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

