import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/torre-shell";
import type {
  CampaniaPush,
  SecuenciaEmail,
  OfertaAuto,
  SegmentoPush,
  EventoTrigger,
  CondicionOferta,
} from "@/lib/torre/marketing-core";
import { segmentoLabel, eventoLabel, condicionLabel } from "@/lib/torre/marketing-fn";

type Tab = "campanias" | "secuencias" | "ofertas";

type Props = {
  tab: Tab;
  campanias: CampaniaPush[];
  secuencias: SecuenciaEmail[];
  ofertas: OfertaAuto[];
  isLoading: boolean;
  onTabChange: (tab: Tab) => void;
  onCrearCampania: (data: { nombre: string; segmento: SegmentoPush; titulo: string; cuerpo: string; programadoAt: string | null }) => void;
  onEnviarCampania: (id: string) => void;
  onCancelarCampania: (id: string) => void;
  onCrearSecuencia: (data: { nombre: string; eventoTrigger: EventoTrigger; asunto: string; contenido: string }) => void;
  onToggleSecuencia: (id: string) => void;
  onCrearOferta: (data: { nombre: string; condicion: CondicionOferta; descuentoPct: number; mensaje: string }) => void;
  onToggleOferta: (id: string) => void;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "campanias", label: "Campanas Push" },
  { key: "secuencias", label: "Secuencias Email" },
  { key: "ofertas", label: "Ofertas Automaticas" },
];

const SEGMENTOS: { value: SegmentoPush; label: string }[] = [
  { value: "todos", label: "Todos los usuarios" },
  { value: "compradores", label: "Compradores" },
  { value: "inactivos_30d", label: "Inactivos 30 dias" },
  { value: "inactivos_60d", label: "Inactivos 60 dias" },
  { value: "frecuentes", label: "Compradores frecuentes" },
];

const EVENTOS: { value: EventoTrigger; label: string }[] = [
  { value: "registro", label: "Registro de cuenta" },
  { value: "primera_compra", label: "Primera compra" },
  { value: "inactividad_7d", label: "Inactividad 7 dias" },
  { value: "inactividad_30d", label: "Inactividad 30 dias" },
  { value: "cumpleanos", label: "Cumpleanos" },
];

const CONDICIONES: { value: CondicionOferta; label: string }[] = [
  { value: "carrito_abandonado", label: "Carrito abandonado" },
  { value: "compra_repetida", label: "Compra repetida" },
  { value: "ticket_alto", label: "Ticket alto" },
  { value: "cliente_nuevo", label: "Cliente nuevo" },
];

const ESTADO_COLORS: Record<string, string> = {
  borrador: "bg-paper-2 text-muted",
  programada: "bg-blue-500/15 text-blue-600",
  enviada: "bg-leaf/15 text-leaf",
  cancelada: "bg-red-500/15 text-red-600",
};

const ESTADO_LABELS: Record<string, string> = {
  borrador: "Borrador",
  programada: "Programada",
  enviada: "Enviada",
  cancelada: "Cancelada",
};

export function MarketingAuto({
  tab,
  campanias,
  secuencias,
  ofertas,
  isLoading,
  onTabChange,
  onCrearCampania,
  onEnviarCampania,
  onCancelarCampania,
  onCrearSecuencia,
  onToggleSecuencia,
  onCrearOferta,
  onToggleOferta,
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
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted">Cargando...</p>}

      {tab === "campanias" && !isLoading && (
        <CampaniasTab
          campanias={campanias}
          onCrear={onCrearCampania}
          onEnviar={onEnviarCampania}
          onCancelar={onCancelarCampania}
        />
      )}

      {tab === "secuencias" && !isLoading && (
        <SecuenciasTab
          secuencias={secuencias}
          onCrear={onCrearSecuencia}
          onToggle={onToggleSecuencia}
        />
      )}

      {tab === "ofertas" && !isLoading && (
        <OfertasTab
          ofertas={ofertas}
          onCrear={onCrearOferta}
          onToggle={onToggleOferta}
        />
      )}
    </div>
  );
}

// --- Campanas Push Tab ---

function CampaniasTab({
  campanias,
  onCrear,
  onEnviar,
  onCancelar,
}: {
  campanias: CampaniaPush[];
  onCrear: (data: { nombre: string; segmento: SegmentoPush; titulo: string; cuerpo: string; programadoAt: string | null }) => void;
  onEnviar: (id: string) => void;
  onCancelar: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [segmento, setSegmento] = useState<SegmentoPush>("todos");
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [programadoAt, setProgramadoAt] = useState("");

  const handleSubmit = () => {
    onCrear({
      nombre,
      segmento,
      titulo,
      cuerpo,
      programadoAt: programadoAt || null,
    });
    setNombre("");
    setSegmento("todos");
    setTitulo("");
    setCuerpo("");
    setProgramadoAt("");
    setShowForm(false);
  };

  if (showForm) {
    return (
      <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <p className="font-medium">Nueva campana push</p>
        <Field label="Nombre" value={nombre} onChange={setNombre} />
        <SelectField label="Segmento" value={segmento} onChange={(v) => setSegmento(v as SegmentoPush)} options={SEGMENTOS} />
        <Field label="Titulo del push" value={titulo} onChange={setTitulo} />
        <label className="mt-2 block text-sm font-medium">
          Cuerpo del push
          <textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        </label>
        <Field label="Programar para (opcional)" value={programadoAt} onChange={setProgramadoAt} type="datetime-local" />
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={handleSubmit}>Guardar</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{campanias.length} campana(s)</p>
        <Button size="sm" onClick={() => setShowForm(true)}>Nueva campana</Button>
      </div>
      {campanias.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay campanas creadas. Crea una para comenzar.
        </p>
      )}
      {campanias.map((c) => (
        <article key={c.id} className="rounded-lg border border-line bg-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{c.nombre}</p>
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", ESTADO_COLORS[c.estado] ?? "bg-paper-2 text-muted")}>
                  {ESTADO_LABELS[c.estado] ?? c.estado}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">Segmento: {segmentoLabel(c.segmento)}</p>
              <p className="mt-1 text-sm font-medium">{c.titulo}</p>
              <p className="text-sm text-muted">{c.cuerpo}</p>
              {c.enviadosCount > 0 && (
                <p className="mt-1 text-xs text-muted">Enviados: {c.enviadosCount}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {(c.estado === "borrador" || c.estado === "programada") && (
                <>
                  <Button size="sm" onClick={() => onEnviar(c.id)}>Enviar</Button>
                  <Button size="sm" variant="secondary" onClick={() => onCancelar(c.id)}>Cancelar</Button>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// --- Secuencias Email Tab ---

function SecuenciasTab({
  secuencias,
  onCrear,
  onToggle,
}: {
  secuencias: SecuenciaEmail[];
  onCrear: (data: { nombre: string; eventoTrigger: EventoTrigger; asunto: string; contenido: string }) => void;
  onToggle: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [eventoTrigger, setEventoTrigger] = useState<EventoTrigger>("registro");
  const [asunto, setAsunto] = useState("");
  const [contenido, setContenido] = useState("");

  const handleSubmit = () => {
    onCrear({ nombre, eventoTrigger, asunto, contenido });
    setNombre("");
    setEventoTrigger("registro");
    setAsunto("");
    setContenido("");
    setShowForm(false);
  };

  if (showForm) {
    return (
      <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <p className="font-medium">Nueva secuencia de email</p>
        <Field label="Nombre" value={nombre} onChange={setNombre} />
        <SelectField label="Evento trigger" value={eventoTrigger} onChange={(v) => setEventoTrigger(v as EventoTrigger)} options={EVENTOS} />
        <Field label="Asunto" value={asunto} onChange={setAsunto} />
        <label className="mt-2 block text-sm font-medium">
          Contenido
          <textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={handleSubmit}>Guardar</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{secuencias.length} secuencia(s)</p>
        <Button size="sm" onClick={() => setShowForm(true)}>Nueva secuencia</Button>
      </div>
      {secuencias.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay secuencias creadas. Crea una para comenzar.
        </p>
      )}
      {secuencias.map((s) => (
        <article key={s.id} className={cn("rounded-lg border border-line bg-surface p-3", !s.activo && "opacity-60")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{s.nombre}</p>
                <span className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                  s.activo ? "bg-leaf/15 text-leaf" : "bg-paper-2 text-muted",
                )}>
                  {s.activo ? "Activa" : "Inactiva"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">Trigger: {eventoLabel(s.eventoTrigger)}</p>
              <p className="mt-1 text-sm font-medium">{s.asunto}</p>
              <p className="text-sm text-muted line-clamp-2">{s.contenido}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" onClick={() => onToggle(s.id)}>
                {s.activo ? "Desactivar" : "Activar"}
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// --- Ofertas Automaticas Tab ---

function OfertasTab({
  ofertas,
  onCrear,
  onToggle,
}: {
  ofertas: OfertaAuto[];
  onCrear: (data: { nombre: string; condicion: CondicionOferta; descuentoPct: number; mensaje: string }) => void;
  onToggle: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [condicion, setCondicion] = useState<CondicionOferta>("carrito_abandonado");
  const [descuentoPct, setDescuentoPct] = useState(10);
  const [mensaje, setMensaje] = useState("");

  const handleSubmit = () => {
    onCrear({ nombre, condicion, descuentoPct, mensaje });
    setNombre("");
    setCondicion("carrito_abandonado");
    setDescuentoPct(10);
    setMensaje("");
    setShowForm(false);
  };

  if (showForm) {
    return (
      <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <p className="font-medium">Nueva oferta automatica</p>
        <Field label="Nombre" value={nombre} onChange={setNombre} />
        <SelectField label="Condicion" value={condicion} onChange={(v) => setCondicion(v as CondicionOferta)} options={CONDICIONES} />
        <label className="mt-2 block text-sm font-medium">
          Descuento (%)
          <input
            type="number"
            min={0}
            max={100}
            value={descuentoPct}
            onChange={(e) => setDescuentoPct(Number(e.target.value))}
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
          />
        </label>
        <label className="mt-2 block text-sm font-medium">
          Mensaje
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={handleSubmit}>Guardar</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{ofertas.length} oferta(s)</p>
        <Button size="sm" onClick={() => setShowForm(true)}>Nueva oferta</Button>
      </div>
      {ofertas.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
          No hay ofertas creadas. Crea una para comenzar.
        </p>
      )}
      {ofertas.map((o) => (
        <article key={o.id} className={cn("rounded-lg border border-line bg-surface p-3", !o.activo && "opacity-60")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{o.nombre}</p>
                <span className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                  o.activo ? "bg-leaf/15 text-leaf" : "bg-paper-2 text-muted",
                )}>
                  {o.activo ? "Activa" : "Inactiva"}
                </span>
                <span className="inline-block rounded-full bg-terra/15 px-2 py-0.5 text-[10px] font-medium text-terra">
                  {o.descuentoPct}% off
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">Condicion: {condicionLabel(o.condicion)}</p>
              <p className="mt-1 text-sm text-muted">{o.mensaje}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" onClick={() => onToggle(o.id)}>
                {o.activo ? "Desactivar" : "Activar"}
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
