import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ReglasAuto } from "@/components/reglas-auto";
import { TorreShell } from "@/components/torre-shell";
import {
  listarReglas,
  crearRegla,
  actualizarRegla,
  eliminarRegla,
  evaluarReglasAhora,
  listarLogReglas,
  type Regla,
  type Condicion,
  type Accion,
  type ResultadoEvaluacion,
} from "@/lib/torre/reglas-auto-fn";

type Tab = "reglas" | "ejecucion" | "log";

export const Route = createFileRoute("/torre/reglas-auto")({
  component: Page,
  validateSearch: (search: { tab?: string }) => ({
    tab: search.tab ?? "reglas",
  }),
});

function Page() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/torre/reglas-auto" });
  const qc = useQueryClient();

  const currentTab = (["reglas", "ejecucion", "log"].includes(tab) ? tab : "reglas") as Tab;

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<Regla | null>(null);
  const [resultados, setResultados] = useState<ResultadoEvaluacion[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const reglas = useQuery({
    queryKey: ["torre-reglas-auto"],
    queryFn: () => listarReglas(),
  });

  const log = useQuery({
    queryKey: ["torre-reglas-auto-log"],
    queryFn: () => listarLogReglas({ data: { limite: 50 } }),
    enabled: currentTab === "log",
  });

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ["torre-reglas-auto"] });
    await qc.invalidateQueries({ queryKey: ["torre-reglas-auto-log"] });
  };

  const handleNewRule = () => {
    setEditingRule(null);
    setShowForm(true);
  };

  const handleEditRule = (regla: Regla) => {
    setEditingRule(regla);
    setShowForm(true);
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await eliminarRegla({ data: id });
      toast.success("Regla eliminada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggleActivo = async (regla: Regla) => {
    try {
      await actualizarRegla({
        data: {
          id: regla.id,
          nombre: regla.nombre,
          descripcion: regla.descripcion,
          condicion: regla.condicion,
          accion: regla.accion,
          activo: !regla.activo,
        },
      });
      toast.success(regla.activo ? "Regla desactivada" : "Regla activada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSaveRule = async (data: {
    nombre: string;
    descripcion: string;
    condicion: Condicion;
    accion: Accion;
    activo: boolean;
  }) => {
    try {
      if (editingRule) {
        await actualizarRegla({ data: { id: editingRule.id, ...data } });
        toast.success("Regla actualizada");
      } else {
        await crearRegla({ data });
        toast.success("Regla creada");
      }
      setShowForm(false);
      setEditingRule(null);
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleEvaluarAhora = async () => {
    setIsEvaluating(true);
    try {
      const result = await evaluarReglasAhora() as ResultadoEvaluacion[];
      setResultados(result);
      await invalidateAll();
      toast.success(`Evaluacion completa: ${result.filter((r) => r.disparada).length} regla(s) disparada(s)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <TorreShell title="Motor de Reglas">
      <ReglasAuto
        tab={currentTab}
        reglas={reglas.data ?? []}
        resultados={resultados}
        log={(log.data ?? []) as ResultadoEvaluacion[]}
        isLoading={reglas.isPending || log.isPending}
        isEvaluating={isEvaluating}
        editingRule={editingRule}
        showForm={showForm}
        onTabChange={(v) => {
          void navigate({ search: () => ({ tab: v }) });
          if (v === "ejecucion") setResultados([]);
        }}
        onNewRule={handleNewRule}
        onEditRule={handleEditRule}
        onDeleteRule={(id) => { void handleDeleteRule(id); }}
        onToggleActivo={(r) => { void handleToggleActivo(r); }}
        onSaveRule={(data) => { void handleSaveRule(data); }}
        onCancelForm={() => { setShowForm(false); setEditingRule(null); }}
        onEvaluarAhora={handleEvaluarAhora}
      />
    </TorreShell>
  );
}
