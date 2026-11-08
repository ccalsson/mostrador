import { useState } from "react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/torre-shell";
import type { GrupoEmpresarial, GrupoDetalle, ClienteParaGrupo } from "@/lib/torre/grupos-core";
import { calcularConsolidado } from "@/lib/torre/grupos-core";

type View = "lista" | "detalle" | "crear" | "editar";

type Props = {
  view: View;
  grupos: GrupoEmpresarial[];
  detalle: GrupoDetalle | null;
  clientes: ClienteParaGrupo[];
  isLoading: boolean;
  editingGroup: GrupoEmpresarial | null;
  formNombre: string;
  formDescripcion: string;
  onVerDetalle: (id: string) => void;
  onVolver: () => void;
  onCrear: () => void;
  onEditar: (grupo: GrupoEmpresarial) => void;
  onGuardarCrear: () => void;
  onGuardarEditar: () => void;
  onEliminar: (id: string) => void;
  onFormNombreChange: (v: string) => void;
  onFormDescripcionChange: (v: string) => void;
  onAsignarCliente: (clienteId: string, grupoId: string) => void;
  onDesasignarCliente: (clienteId: string) => void;
};

export function GruposEmpresariales({
  view,
  grupos,
  detalle,
  clientes,
  isLoading,
  editingGroup,
  formNombre,
  formDescripcion,
  onVerDetalle,
  onVolver,
  onCrear,
  onEditar,
  onGuardarCrear,
  onGuardarEditar,
  onEliminar,
  onFormNombreChange,
  onFormDescripcionChange,
  onAsignarCliente,
  onDesasignarCliente,
}: Props) {
  if (view === "crear" || view === "editar") {
    return (
      <GrupoForm
        mode={view}
        editingGroup={editingGroup}
        formNombre={formNombre}
        formDescripcion={formDescripcion}
        onFormNombreChange={onFormNombreChange}
        onFormDescripcionChange={onFormDescripcionChange}
        onGuardar={view === "crear" ? onGuardarCrear : onGuardarEditar}
        onCancelar={view === "editar" ? () => { if (editingGroup) onVerDetalle(editingGroup.id); else onVolver(); } : onVolver}
      />
    );
  }

  if (view === "detalle" && detalle) {
    return (
      <GrupoDetalleView
        detalle={detalle}
        clientes={clientes}
        onVolver={onVolver}
        onEditar={() => onEditar(detalle.grupo)}
        onEliminar={() => onEliminar(detalle.grupo.id)}
        onAsignarCliente={onAsignarCliente}
        onDesasignarCliente={onDesasignarCliente}
        isLoading={isLoading}
      />
    );
  }

  return (
    <GruposListView
      grupos={grupos}
      isLoading={isLoading}
      onVerDetalle={onVerDetalle}
      onCrear={onCrear}
    />
  );
}

// --- Lista de grupos ---

function GruposListView({
  grupos,
  isLoading,
  onVerDetalle,
  onCrear,
}: {
  grupos: GrupoEmpresarial[];
  isLoading: boolean;
  onVerDetalle: (id: string) => void;
  onCrear: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {grupos.length} grupo{grupos.length !== 1 ? "s" : ""} empresarial{grupos.length !== 1 ? "es" : ""}
        </p>
        <Button size="sm" onClick={onCrear}>
          Nuevo grupo
        </Button>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted">Cargando grupos...</p>
      ) : grupos.length === 0 ? (
        <div className="rounded-md border border-dashed border-line py-12 text-center">
          <p className="text-sm text-muted">No hay grupos empresariales todavia.</p>
          <p className="mt-1 text-xs text-muted">Crea un grupo para consolidar clientes y reportes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map((g) => (
            <article key={g.id} className="rounded-md border border-line bg-surface p-4">
              <h3 className="font-display text-base font-semibold">{g.nombre}</h3>
              {g.descripcion ? (
                <p className="mt-1 text-sm text-muted line-clamp-2">{g.descripcion}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{g.clientesCount} cliente{g.clientesCount !== 1 ? "s" : ""}</span>
                <span>{g.tenantsCount} tenant{g.tenantsCount !== 1 ? "s" : ""}</span>
                <span className="font-medium text-ink">{money(g.revenueTotal)}</span>
              </div>
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={() => onVerDetalle(g.id)}>
                  Ver detalle
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

// --- Detalle de grupo ---

function GrupoDetalleView({
  detalle,
  clientes,
  onVolver,
  onEditar,
  onEliminar,
  onAsignarCliente,
  onDesasignarCliente,
  isLoading,
}: {
  detalle: GrupoDetalle;
  clientes: ClienteParaGrupo[];
  onVolver: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  onAsignarCliente: (clienteId: string, grupoId: string) => void;
  onDesasignarCliente: (clienteId: string) => void;
  isLoading: boolean;
}) {
  const g = detalle.grupo;
  const consolidado = calcularConsolidado(
    detalle.clientes.map((c) => ({ revenue: c.revenue, tenantsCount: c.tenantsCount })),
  );

  const clientesSinGrupo = clientes.filter((c) => c.grupoId === null || c.grupoId !== g.id);
  const [asignarClienteId, setAsignarClienteId] = useState<string>("");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={onVolver}>
          Volver
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onEditar}>
            Editar
          </Button>
          <Button size="sm" variant="danger" onClick={onEliminar}>
            Eliminar
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-line bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">{g.nombre}</h2>
        {g.descripcion ? <p className="mt-1 text-sm text-muted">{g.descripcion}</p> : null}
        <p className="mt-1 text-xs text-muted">Creado por {g.creadoPor}</p>
      </div>

      {/* Consolidated metrics */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <MetricCard label="Clientes" value={String(consolidado.clientesCount)} />
        <MetricCard label="Tenants activos" value={String(consolidado.tenantsTotal)} />
        <MetricCard label="Revenue total" value={money(consolidado.revenueTotal)} />
      </div>

      {/* Assign client */}
      {clientesSinGrupo.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="block text-sm font-medium">
            Asignar cliente
            <select
              value={asignarClienteId}
              onChange={(e) => setAsignarClienteId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
            >
              <option value="">Seleccionar...</option>
              {clientesSinGrupo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.businessName ? `(${c.businessName})` : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            disabled={!asignarClienteId}
            onClick={() => {
              if (asignarClienteId) {
                onAsignarCliente(asignarClienteId, g.id);
                setAsignarClienteId("");
              }
            }}
          >
            Asignar
          </Button>
        </div>
      ) : null}

      {/* Member clients table */}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted">Cargando...</p>
      ) : detalle.clientes.length === 0 ? (
        <div className="rounded-md border border-dashed border-line py-8 text-center">
          <p className="text-sm text-muted">Este grupo no tiene clientes asignados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Razon social</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Tenants</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {detalle.clientes.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium">{c.nombre}</td>
                  <td className="px-3 py-2 text-muted">{c.businessName}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs", c.status === "active" ? "bg-leaf/15 text-leaf" : "bg-muted/15 text-muted")}>
                      {c.status === "active" ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{c.tenantsCount}</td>
                  <td className="px-3 py-2 text-right">{money(c.revenue)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onDesasignarCliente(c.id)}>
                      Desasignar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// --- Formulario crear/editar ---

function GrupoForm({
  mode,
  editingGroup,
  formNombre,
  formDescripcion,
  onFormNombreChange,
  onFormDescripcionChange,
  onGuardar,
  onCancelar,
}: {
  mode: "crear" | "editar";
  editingGroup: GrupoEmpresarial | null;
  formNombre: string;
  formDescripcion: string;
  onFormNombreChange: (v: string) => void;
  onFormDescripcionChange: (v: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  return (
    <>
      <div className="mb-4">
        <Button size="sm" variant="secondary" onClick={onCancelar}>
          Volver
        </Button>
      </div>
      <div className="rounded-md border border-line bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">
          {mode === "crear" ? "Nuevo grupo empresarial" : `Editar: ${editingGroup?.nombre ?? ""}`}
        </h2>
        <Field label="Nombre" value={formNombre} onChange={onFormNombreChange} />
        <label className="mt-2 block text-sm font-medium">
          Descripcion
          <textarea
            value={formDescripcion}
            onChange={(e) => onFormDescripcionChange(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        </label>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={onGuardar}>
            {mode === "crear" ? "Crear grupo" : "Guardar cambios"}
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    </>
  );
}

// --- Metric card ---

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
