import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { GruposEmpresariales } from "@/components/grupos-empresariales";
import { TorreShell } from "@/components/torre-shell";
import {
  listarGrupos,
  crearGrupo,
  actualizarGrupo,
  eliminarGrupo,
  detalleGrupo,
  listarClientesParaGrupo,
  asignarClienteAGrupo,
  desasignarCliente,
  type GrupoEmpresarial,
} from "@/lib/torre/grupos-fn";

type View = "lista" | "detalle" | "crear" | "editar";

export const Route = createFileRoute("/torre/grupos-empresariales")({
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("lista");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<GrupoEmpresarial | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");

  const grupos = useQuery({
    queryKey: ["torre-grupos"],
    queryFn: () => listarGrupos(),
  });

  const detalle = useQuery({
    queryKey: ["torre-grupo-detalle", selectedGroupId],
    queryFn: () => detalleGrupo({ data: selectedGroupId! }),
    enabled: Boolean(selectedGroupId) && view === "detalle",
  });

  const clientes = useQuery({
    queryKey: ["torre-clientes-para-grupo"],
    queryFn: () => listarClientesParaGrupo(),
    enabled: view === "detalle",
  });

  const isLoading = grupos.isPending || detalle.isPending || clientes.isPending;

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ["torre-grupos"] });
    if (selectedGroupId) {
      await qc.invalidateQueries({ queryKey: ["torre-grupo-detalle", selectedGroupId] });
    }
    await qc.invalidateQueries({ queryKey: ["torre-clientes-para-grupo"] });
  };

  const handleVerDetalle = (id: string) => {
    setSelectedGroupId(id);
    setView("detalle");
  };

  const handleVolver = () => {
    setView("lista");
    setSelectedGroupId(null);
    setEditingGroup(null);
    setFormNombre("");
    setFormDescripcion("");
  };

  const handleCrear = () => {
    setEditingGroup(null);
    setFormNombre("");
    setFormDescripcion("");
    setView("crear");
  };

  const handleEditar = (grupo: GrupoEmpresarial) => {
    setEditingGroup(grupo);
    setFormNombre(grupo.nombre);
    setFormDescripcion(grupo.descripcion);
    setView("editar");
  };

  const handleGuardarCrear = async () => {
    try {
      await crearGrupo({ data: { nombre: formNombre, descripcion: formDescripcion } });
      toast.success("Grupo creado");
      await invalidateAll();
      handleVolver();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleGuardarEditar = async () => {
    if (!editingGroup) return;
    try {
      await actualizarGrupo({ data: { id: editingGroup.id, nombre: formNombre, descripcion: formDescripcion } });
      toast.success("Grupo actualizado");
      await invalidateAll();
      setView("detalle");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleEliminar = async (id: string) => {
    if (!confirm("Estas seguro de eliminar este grupo?")) return;
    try {
      await eliminarGrupo({ data: id });
      toast.success("Grupo eliminado");
      await invalidateAll();
      handleVolver();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleAsignarCliente = async (clienteId: string, grupoId: string) => {
    try {
      await asignarClienteAGrupo({ data: { clienteId, grupoId } });
      toast.success("Cliente asignado al grupo");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDesasignarCliente = async (clienteId: string) => {
    try {
      await desasignarCliente({ data: clienteId });
      toast.success("Cliente desasignado del grupo");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <TorreShell title="Grupos Empresariales">
      <GruposEmpresariales
        view={view}
        grupos={grupos.data ?? []}
        detalle={detalle.data ?? null}
        clientes={clientes.data ?? []}
        isLoading={isLoading}
        editingGroup={editingGroup}
        formNombre={formNombre}
        formDescripcion={formDescripcion}
        onVerDetalle={handleVerDetalle}
        onVolver={handleVolver}
        onCrear={handleCrear}
        onEditar={handleEditar}
        onGuardarCrear={handleGuardarCrear}
        onGuardarEditar={handleGuardarEditar}
        onEliminar={handleEliminar}
        onFormNombreChange={setFormNombre}
        onFormDescripcionChange={setFormDescripcion}
        onAsignarCliente={handleAsignarCliente}
        onDesasignarCliente={handleDesasignarCliente}
      />
    </TorreShell>
  );
}
