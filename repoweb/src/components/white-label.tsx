import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  listarWhiteLabel,
  obtenerWhiteLabel,
  guardarWhiteLabel,
  eliminarWhiteLabel,
  TEMPLATES,
  FUENTES,
  esHexValid,
  contrasteTexto,
  type WhiteLabelConfig,
  type WhiteLabelInput,
} from "@/lib/torre/white-label-fn";
import { listTenants } from "@/lib/torre-fn";

export function WhiteLabel() {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  if (selectedTenantId) {
    return (
      <EditorWhiteLabel
        tenantId={selectedTenantId}
        onBack={() => setSelectedTenantId(null)}
      />
    );
  }

  return <ListaTenants onSelect={setSelectedTenantId} />;
}

// --- Lista de tenants ---

function ListaTenants({ onSelect }: { onSelect: (tenantId: string) => void }) {
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const configs = useQuery({ queryKey: ["torre-white-label"], queryFn: () => listarWhiteLabel() });

  const configByTenant = new Map<string, WhiteLabelConfig>();
  for (const c of configs.data ?? []) {
    configByTenant.set(c.tenantId, c);
  }

  if (tenants.isPending) return <p className="text-sm text-muted">Cargando negocios...</p>;

  const lista = tenants.data ?? [];
  if (lista.length === 0) return <p className="text-sm text-muted">No hay negocios registrados.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{lista.length} negocios registrados</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted uppercase">
            <tr>
              <th className="px-3 py-2">Negocio</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Marca</th>
              <th className="px-3 py-2">Colores</th>
              <th className="px-3 py-2">Dominio</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lista.map((t) => {
              const config = configByTenant.get(t.id);
              return (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2">{t.clientName}</td>
                  <td className="px-3 py-2">
                    {config ? (
                      <span className="text-sm">{config.marcaNombre}</span>
                    ) : (
                      <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-muted">Sin configurar</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {config ? (
                      <div className="flex gap-1">
                        <span className="inline-block h-4 w-4 rounded border border-line" style={{ backgroundColor: config.colorPrimario }} title="Primario" />
                        <span className="inline-block h-4 w-4 rounded border border-line" style={{ backgroundColor: config.colorSecundario }} title="Secundario" />
                        <span className="inline-block h-4 w-4 rounded border border-line" style={{ backgroundColor: config.colorFondo }} title="Fondo" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {config?.dominioPropio ? (
                      <span className={cn("text-xs", config.dominioActivo ? "text-leaf" : "text-muted")}>
                        {config.dominioPropio}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="secondary" onClick={() => onSelect(t.id)}>
                      {config ? "Editar" : "Configurar"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Editor White-Label ---

function EditorWhiteLabel({ tenantId, onBack }: { tenantId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const existing = useQuery({
    queryKey: ["torre-white-label-detail", tenantId],
    queryFn: () => obtenerWhiteLabel({ data: tenantId }),
  });

  const tenant = tenants.data?.find((t) => t.id === tenantId);

  const [form, setForm] = useState<WhiteLabelInput | null>(null);
  const [busy, setBusy] = useState(false);

  // Inicializar form cuando carga la config existente
  const config = existing.data;
  const isEditing = form !== null;

  const currentForm: WhiteLabelInput = form ?? {
    marcaNombre: config?.marcaNombre ?? tenant?.name ?? "",
    logoUrl: config?.logoUrl ?? "",
    colorPrimario: config?.colorPrimario ?? "#1a7a4c",
    colorSecundario: config?.colorSecundario ?? "#e3c56a",
    colorFondo: config?.colorFondo ?? "#ffffff",
    colorTexto: config?.colorTexto ?? "#1a1a1a",
    fuente: config?.fuente ?? "Inter",
    template: config?.template ?? "clasico",
    dominioPropio: config?.dominioPropio ?? "",
    dominioActivo: config?.dominioActivo ?? false,
  };

  const update = <K extends keyof WhiteLabelInput>(key: K, value: WhiteLabelInput[K]) => {
    setForm((prev) => ({ ...prev, ...(prev === null ? { ...currentForm } : {}) } as WhiteLabelInput));
    setForm((prev) => prev ? { ...prev, [key]: value } : null);
  };

  // Init form on first interaction if not already initialized
  const ensureForm = () => {
    if (!form) setForm({ ...currentForm });
  };

  const handleSave = () => {
    if (!form) return;
    setBusy(true);
    void guardarWhiteLabel({ data: { tenantId, ...form } })
      .then(() => {
        toast.success("Configuracion guardada");
        void qc.invalidateQueries({ queryKey: ["torre-white-label"] });
        void qc.invalidateQueries({ queryKey: ["torre-white-label-detail", tenantId] });
        setForm(null);
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false));
  };

  const handleReset = () => {
    setForm(null);
  };

  const handleDelete = () => {
    if (!config) return;
    setBusy(true);
    void eliminarWhiteLabel({ data: tenantId })
      .then(() => {
        toast.success("Configuracion eliminada");
        void qc.invalidateQueries({ queryKey: ["torre-white-label"] });
        void qc.invalidateQueries({ queryKey: ["torre-white-label-detail", tenantId] });
        onBack();
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false));
  };

  if (existing.isPending) return <p className="text-sm text-muted">Cargando configuracion...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={onBack}>
          Volver
        </Button>
        <p className="text-sm font-medium">
          {tenant?.name ?? tenantId}
          {tenant?.clientName ? <span className="text-muted"> — {tenant.clientName}</span> : null}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Panel izquierdo: Formulario */}
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Configuracion de marca</p>

          <CampoLabel label="Nombre de marca">
            <input
              className="h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
              value={currentForm.marcaNombre}
              maxLength={60}
              onChange={(e) => { ensureForm(); update("marcaNombre", e.target.value); }}
            />
          </CampoLabel>
          {currentForm.marcaNombre.length > 55 ? (
            <p className="text-xs text-terra">{60 - currentForm.marcaNombre.length} caracteres restantes</p>
          ) : null}

          <CampoLabel label="Logo URL">
            <input
              className="h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
              value={currentForm.logoUrl}
              onChange={(e) => { ensureForm(); update("logoUrl", e.target.value); }}
              placeholder="https://ejemplo.com/logo.png"
            />
          </CampoLabel>
          {currentForm.logoUrl && esHexValid(currentForm.colorPrimario) ? (
            <div className="flex items-center gap-2">
              <img
                src={currentForm.logoUrl}
                alt="Logo preview"
                className="h-10 w-auto max-w-32 rounded border border-line object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <ColorInput label="Color primario" value={currentForm.colorPrimario} onChange={(v) => { ensureForm(); update("colorPrimario", v); }} />
            <ColorInput label="Color secundario" value={currentForm.colorSecundario} onChange={(v) => { ensureForm(); update("colorSecundario", v); }} />
            <ColorInput label="Color fondo" value={currentForm.colorFondo} onChange={(v) => { ensureForm(); update("colorFondo", v); }} />
            <ColorInput label="Color texto" value={currentForm.colorTexto} onChange={(v) => { ensureForm(); update("colorTexto", v); }} />
          </div>

          <CampoLabel label="Fuente">
            <select
              className="h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
              value={currentForm.fuente}
              onChange={(e) => { ensureForm(); update("fuente", e.target.value); }}
            >
              {FUENTES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </CampoLabel>

          <div>
            <p className="mt-2 mb-2 text-sm font-medium">Template</p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => { ensureForm(); update("template", tpl.id); }}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    currentForm.template === tpl.id
                      ? "border-[#1a7a4c] bg-[#1a7a4c]/5"
                      : "border-line bg-paper hover:border-[#1a7a4c]/50",
                  )}
                >
                  <p className="text-sm font-medium">{tpl.label}</p>
                  <p className="text-xs text-muted">{tpl.descripcion}</p>
                </button>
              ))}
            </div>
          </div>

          <CampoLabel label="Dominio propio">
            <input
              className="h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
              value={currentForm.dominioPropio ?? ""}
              onChange={(e) => { ensureForm(); update("dominioPropio", e.target.value); }}
              placeholder="negocio.litoral.solutions"
            />
          </CampoLabel>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={currentForm.dominioActivo ?? false}
              onChange={(e) => { ensureForm(); update("dominioActivo", e.target.checked); }}
            />
            Dominio activo
          </label>

          <div className="flex gap-2 pt-2">
            <Button size="sm" disabled={busy || !isEditing} onClick={handleSave}>
              {busy ? "Guardando..." : "Guardar"}
            </Button>
            {isEditing ? (
              <Button size="sm" variant="secondary" onClick={handleReset}>
                Resetear
              </Button>
            ) : null}
            {config ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={handleDelete}>
                Eliminar config
              </Button>
            ) : null}
          </div>
        </div>

        {/* Panel derecho: Live Preview */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Vista previa</p>
          <LivePreview config={currentForm} />
        </div>
      </div>
    </div>
  );
}

// --- Componentes auxiliares ---

function CampoLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-2 block text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valido = esHexValid(value);
  return (
    <div className="mt-2">
      <p className="text-xs font-medium">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={cn("inline-block h-6 w-6 shrink-0 rounded border", valido ? "border-line" : "border-red-400")}
          style={{ backgroundColor: valido ? value : "#cccccc" }}
        />
        <input
          className="h-8 w-full rounded-md border border-line bg-paper px-2 font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
        />
      </div>
      {!valido ? <p className="mt-0.5 text-xs text-red-600">Hex invalido</p> : null}
    </div>
  );
}

// --- Live Preview ---

function LivePreview({ config }: { config: WhiteLabelInput }) {
  const fondoOk = esHexValid(config.colorFondo);
  const textoOk = esHexValid(config.colorTexto);
  const primarioOk = esHexValid(config.colorPrimario);
  const secundarioOk = esHexValid(config.colorSecundario);

  const bg = fondoOk ? config.colorFondo : "#ffffff";
  const fg = textoOk ? config.colorTexto : "#1a1a1a";
  const primario = primarioOk ? config.colorPrimario : "#1a7a4c";
  const secundario = secundarioOk ? config.colorSecundario : "#e3c56a";
  const contraste = contrasteTexto(bg);
  const textoPreview = contraste === "oscuro" ? fg : "#ffffff";

  return (
    <div
      className="overflow-hidden rounded-lg border border-line"
      style={{ backgroundColor: bg, color: fg, fontFamily: config.fuente }}
    >
      {/* Header mock */}
      <div style={{ backgroundColor: primario }} className="flex items-center gap-3 px-4 py-3">
        {config.logoUrl ? (
          <img
            src={config.logoUrl}
            alt="Logo"
            className="h-8 w-auto max-w-24 object-contain"
            style={{ filter: contraste === "claro" ? "brightness(0) invert(1)" : "none" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : null}
        <span className="text-base font-semibold" style={{ color: textoPreview }}>
          {config.marcaNombre || "Tu marca"}
        </span>
      </div>

      {/* Body mock */}
      <div className="p-4 space-y-3">
        <p className="text-xs" style={{ color: fg, opacity: 0.7 }}>
          Bienvenido a nuestra tienda. Descubre productos unicos seleccionados para vos.
        </p>

        {/* Product card mock */}
        <div className="rounded-lg border p-3" style={{ borderColor: secundario + "40", backgroundColor: bg }}>
          <div className="flex items-start gap-3">
            <div className="h-16 w-16 shrink-0 rounded-md" style={{ backgroundColor: secundario + "30" }} />
            <div className="space-y-1">
              <p className="text-sm font-medium" style={{ color: fg }}>Producto destacado</p>
              <p className="text-xs" style={{ color: fg, opacity: 0.6 }}>Descripcion breve del producto</p>
              <p className="text-sm font-bold" style={{ color: primario }}>$ 1.500,00</p>
            </div>
          </div>
        </div>

        {/* Button mock */}
        <button
          type="button"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: primario, color: textoPreview }}
        >
          Comprar ahora
        </button>

        {/* Secondary button mock */}
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm font-medium"
          style={{ borderColor: secundario, color: fg }}
        >
          Ver mas productos
        </button>
      </div>

      {/* Footer mock */}
      <div className="border-t px-4 py-2" style={{ borderColor: secundario + "30" }}>
        <p className="text-xs" style={{ color: fg, opacity: 0.5 }}>
          {config.dominioPropio || "tu-negocio.litoral.solutions"}
        </p>
      </div>
    </div>
  );
}
