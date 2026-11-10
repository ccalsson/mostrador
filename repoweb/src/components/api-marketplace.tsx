import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  listarApiKeys,
  crearApiKey,
  revocarApiKey,
  listarWebhooks,
  crearWebhook,
  eliminarWebhook,
  listarWebhookLog,
} from "@/lib/torre/api-marketplace-fn";
import {
  SCOPES,
  EVENTOS,
  type ApiKey,
  type ApiKeyCreada,
  type Webhook,
  type WebhookLogEntry,
} from "@/lib/torre/api-marketplace-core";
import { listClients } from "@/lib/torre-fn";

type Tab = "keys" | "webhooks" | "docs";

export function ApiMarketplace() {
  const [tab, setTab] = useState<Tab>("keys");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
        {([
          ["keys", "API Keys"],
          ["webhooks", "Webhooks"],
          ["docs", "Documentacion"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === key ? "bg-ink text-paper" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "keys" && <TabApiKeys />}
      {tab === "webhooks" && <TabWebhooks />}
      {tab === "docs" && <TabDocs />}
    </div>
  );
}

// ─── Tab: API Keys ─────────────────────────────────────────────────

function TabApiKeys() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["torre-api-keys"], queryFn: () => listarApiKeys() });
  const clients = useQuery({ queryKey: ["torre-clients"], queryFn: () => listClients() });
  const [showForm, setShowForm] = useState(false);
  const [keyCreada, setKeyCreada] = useState<ApiKeyCreada | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{keys.data?.length ?? 0} claves registradas</p>
        <Button size="sm" onClick={() => setShowForm(true)}>
          Generar nueva clave
        </Button>
      </div>

      {showForm && (
        <FormApiKey
          clients={clients.data ?? []}
          onCreated={(k) => {
            setKeyCreada(k);
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ["torre-api-keys"] });
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {keyCreada && <ModalKeyCreada apiKey={keyCreada} onClose={() => setKeyCreada(null)} />}

      <TablaApiKeys
        keys={keys.data ?? []}
        isLoading={keys.isPending}
        onRevoke={(id) => {
          void revocarApiKey({ data: id })
            .then(() => {
              toast.success("Clave revocada");
              void qc.invalidateQueries({ queryKey: ["torre-api-keys"] });
            })
            .catch((err: Error) => toast.error(err.message));
        }}
      />
    </div>
  );
}

function FormApiKey({
  clients,
  onCreated,
  onCancel,
}: {
  clients: { id: string; name: string }[];
  onCreated: (k: ApiKeyCreada) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [rateLimit, setRateLimit] = useState("60");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleScope = (s: string) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const submit = () => {
    setBusy(true);
    void crearApiKey({
      data: {
        clientId,
        nombre: nombre.trim(),
        scopes,
        rateLimitRpm: Number(rateLimit) || 60,
        expiresAt: expiresAt || null,
      },
    })
      .then(onCreated)
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
      <p className="text-sm font-medium">Nueva API Key</p>
      <label className="block text-sm">
        Nombre
        <input
          className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Integracion Shopify"
        />
      </label>
      <label className="block text-sm">
        Cliente
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="text-sm">
        <p className="font-medium">Scopes</p>
        <div className="mt-1 flex gap-3">
          {SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={() => toggleScope(s)}
              />
              <span className="text-sm">{s}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="block text-sm">
        Rate Limit (RPM)
        <input
          type="number"
          className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
          value={rateLimit}
          onChange={(e) => setRateLimit(e.target.value)}
          min={1}
        />
      </label>
      <label className="block text-sm">
        Expira (opcional)
        <input
          type="date"
          className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? "Generando..." : "Crear clave"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function TablaApiKeys({
  keys,
  isLoading,
  onRevoke,
}: {
  keys: ApiKey[];
  isLoading: boolean;
  onRevoke: (id: string) => void;
}) {
  if (isLoading) return <p className="text-sm text-muted">Cargando claves...</p>;
  if (keys.length === 0) return <p className="text-sm text-muted">No hay API keys registradas.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs text-muted uppercase">
          <tr>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2">Prefijo</th>
            <th className="px-3 py-2">Scopes</th>
            <th className="px-3 py-2">RPM</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Ultimo uso</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {keys.map((k) => (
            <tr key={k.id} className={cn(!k.activo && "opacity-50")}>
              <td className="px-3 py-2 font-medium">{k.nombre}</td>
              <td className="px-3 py-2">{k.clientNombre}</td>
              <td className="px-3 py-2 font-mono text-xs">{k.keyPrefix}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {k.scopes.map((s) => (
                    <span key={s} className="rounded bg-leaf/15 px-1.5 py-0.5 text-xs text-leaf">
                      {s}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">{k.rateLimitRpm}</td>
              <td className="px-3 py-2">
                <span className={cn("rounded px-1.5 py-0.5 text-xs", k.activo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                  {k.activo ? "Activa" : "Revocada"}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-muted">{k.ultimoUso ? k.ultimoUso.slice(0, 10) : "Nunca"}</td>
              <td className="px-3 py-2">
                {k.activo && (
                  <Button size="sm" variant="secondary" onClick={() => onRevoke(k.id)}>
                    Revocar
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModalKeyCreada({ apiKey, onClose }: { apiKey: ApiKeyCreada; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(apiKey.keyPlano);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 space-y-4">
        <p className="font-display text-lg font-semibold">API Key generada</p>
        <div className="rounded-md border border-terra/30 bg-warn-bg p-3 text-sm text-terra">
          Esta es la unica vez que se muestra la clave completa. Copiala y guardala en un lugar seguro.
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs">
            {apiKey.keyPlano}
          </code>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? "Copiada!" : "Copiar"}
          </Button>
        </div>
        <p className="text-xs text-muted">Prefijo: {apiKey.keyPrefix}</p>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Webhooks ─────────────────────────────────────────────────

function TabWebhooks() {
  const qc = useQueryClient();
  const webhooks = useQuery({ queryKey: ["torre-webhooks"], queryFn: () => listarWebhooks() });
  const clients = useQuery({ queryKey: ["torre-clients"], queryFn: () => listClients() });
  const [showForm, setShowForm] = useState(false);
  const [logWebhookId, setLogWebhookId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{webhooks.data?.length ?? 0} webhooks registrados</p>
        <Button size="sm" onClick={() => setShowForm(true)}>
          Registrar webhook
        </Button>
      </div>

      {showForm && (
        <FormWebhook
          clients={clients.data ?? []}
          onCreated={() => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ["torre-webhooks"] });
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <TablaWebhooks
        webhooks={webhooks.data ?? []}
        isLoading={webhooks.isPending}
        onViewLog={(id) => setLogWebhookId(id)}
        onDelete={(id) => {
          void eliminarWebhook({ data: id })
            .then(() => {
              toast.success("Webhook eliminado");
              void qc.invalidateQueries({ queryKey: ["torre-webhooks"] });
            })
            .catch((err: Error) => toast.error(err.message));
        }}
      />

      {logWebhookId && (
        <ModalWebhookLog webhookId={logWebhookId} onClose={() => setLogWebhookId(null)} />
      )}
    </div>
  );
}

function FormWebhook({
  clients,
  onCreated,
  onCancel,
}: {
  clients: { id: string; name: string }[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleEvento = (e: string) =>
    setEventos((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const submit = () => {
    setBusy(true);
    void crearWebhook({ data: { clientId, url: url.trim(), eventos } })
      .then(() => {
        toast.success("Webhook registrado");
        onCreated();
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
      <p className="text-sm font-medium">Registrar Webhook</p>
      <label className="block text-sm">
        Cliente
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        URL
        <input
          className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
        />
      </label>
      <div className="text-sm">
        <p className="font-medium">Eventos</p>
        <div className="mt-1 flex flex-wrap gap-3">
          {EVENTOS.map((e) => (
            <label key={e} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={eventos.includes(e)}
                onChange={() => toggleEvento(e)}
              />
              <span className="text-sm">{e}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? "Guardando..." : "Guardar"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function TablaWebhooks({
  webhooks,
  isLoading,
  onViewLog,
  onDelete,
}: {
  webhooks: Webhook[];
  isLoading: boolean;
  onViewLog: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (isLoading) return <p className="text-sm text-muted">Cargando webhooks...</p>;
  if (webhooks.length === 0) return <p className="text-sm text-muted">No hay webhooks registrados.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs text-muted uppercase">
          <tr>
            <th className="px-3 py-2">URL</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2">Eventos</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {webhooks.map((w) => (
            <tr key={w.id} className={cn(!w.activo && "opacity-50")}>
              <td className="px-3 py-2 font-mono text-xs max-w-48 truncate">{w.url}</td>
              <td className="px-3 py-2">{w.clientNombre}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {w.eventos.map((e) => (
                    <span key={e} className="rounded bg-[#e3c56a]/15 px-1.5 py-0.5 text-xs text-terra">
                      {e}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">
                <span className={cn("rounded px-1.5 py-0.5 text-xs", w.activo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                  {w.activo ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => onViewLog(w.id)}>
                    Ver log
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onDelete(w.id)}>
                    Eliminar
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModalWebhookLog({ webhookId, onClose }: { webhookId: string; onClose: () => void }) {
  const log = useQuery({
    queryKey: ["torre-webhook-log", webhookId],
    queryFn: () => listarWebhookLog({ data: { webhookId } }),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-full max-w-3xl rounded-xl border border-line bg-surface p-6 space-y-4 max-h-[80dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-semibold">Log de entregas</p>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
        {log.isPending ? (
          <p className="text-sm text-muted">Cargando...</p>
        ) : !log.data || log.data.length === 0 ? (
          <p className="text-sm text-muted">Sin entregas registradas.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Respuesta</th>
                  <th className="px-3 py-2">Resultado</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {log.data.map((entry: WebhookLogEntry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 text-xs">{entry.createdAt?.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-3 py-2">{entry.evento}</td>
                    <td className="px-3 py-2">{entry.statusCode ?? "-"}</td>
                    <td className="px-3 py-2">{entry.respuestaMs != null ? `${entry.respuestaMs}ms` : "-"}</td>
                    <td className="px-3 py-2">
                      <span className={cn("rounded px-1.5 py-0.5 text-xs", entry.exito ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                        {entry.exito ? "OK" : "FAIL"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted max-w-32 truncate">{entry.error ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Documentacion ────────────────────────────────────────────

function TabDocs() {
  return (
    <div className="prose-custom space-y-6 rounded-lg border border-line bg-surface p-6 text-sm">
      <Section title="Autenticacion">
        <p>Todas las llamadas a la API deben incluir el header <Code>X-API-Key</Code> con tu clave secreta.</p>
        <CodeBlock>{`curl -H "X-API-Key: mk_live_tu_clave_aqui" https://api.ejemplo.com/v1/pedidos`}</CodeBlock>
        <p>La clave se genera desde la pestana "API Keys" y solo se muestra una vez.</p>
      </Section>

      <Section title="Endpoints disponibles">
        <EndpointRow method="GET" path="/v1/pedidos" desc="Listar pedidos del tenant" />
        <EndpointRow method="GET" path="/v1/pedidos/:id" desc="Detalle de un pedido" />
        <EndpointRow method="POST" path="/v1/pedidos" desc="Crear un pedido" scope="write" />
        <EndpointRow method="GET" path="/v1/productos" desc="Listar productos" />
        <EndpointRow method="GET" path="/v1/clientes" desc="Listar clientes" />
        <EndpointRow method="POST" path="/v1/clientes" desc="Crear un cliente" scope="write" />
        <EndpointRow method="GET" path="/v1/webhooks" desc="Listar webhooks registrados" scope="webhooks" />
      </Section>

      <Section title="Rate Limits">
        <p>Cada API key tiene un limite de requests por minuto (RPM). Si se excede, la API responde con <Code>429 Too Many Requests</Code>.</p>
        <p>Los limites se configuran al crear la clave y pueden ajustarse posteriormente.</p>
        <p>Headers de respuesta: <Code>X-RateLimit-Limit</Code>, <Code>X-RateLimit-Remaining</Code>, <Code>X-RateLimit-Reset</Code>.</p>
      </Section>

      <Section title="Webhooks">
        <p>Los webhooks permiten recibir notificaciones en tiempo real cuando ocurren eventos en el sistema.</p>
        <p>Cada webhook incluye un header <Code>X-Webhook-Signature</Code> con HMAC-SHA256 del payload usando el secreto registrado.</p>
        <SubSection title="Eventos disponibles">
          {EVENTOS.map((e) => (
            <p key={e}><Code>{e}</Code></p>
          ))}
        </SubSection>
        <SubSection title="Reintentos">
          <p>Si tu endpoint responde con un status 5xx o no responde en 10 segundos, se reintenta 3 veces con backoff exponencial.</p>
        </SubSection>
      </Section>

      <Section title="Codigos de error">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted uppercase">
              <tr>
                <th className="py-1 pr-4">Codigo</th>
                <th className="py-1 pr-4">Descripcion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="py-1.5 pr-4 font-mono">401</td><td className="py-1.5">API key invalida o revocada</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono">403</td><td className="py-1.5">Scope insuficiente para la operacion</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono">404</td><td className="py-1.5">Recurso no encontrado</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono">429</td><td className="py-1.5">Limite de requests excedido</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono">500</td><td className="py-1.5">Error interno del servidor</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <div className="mt-2 space-y-2 text-muted">{children}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ml-4">
      <h4 className="font-medium text-ink">{title}</h4>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs text-ink border border-line">{children}</code>;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-paper border border-line p-3 font-mono text-xs text-ink">
      {children}
    </pre>
  );
}

function EndpointRow({ method, path, desc, scope }: { method: string; path: string; desc: string; scope?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className={cn("rounded px-2 py-0.5 text-xs font-bold", method === "GET" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800")}>
        {method}
      </span>
      <code className="font-mono text-xs">{path}</code>
      <span className="text-muted">- {desc}</span>
      {scope && <span className="rounded bg-leaf/15 px-1.5 py-0.5 text-xs text-leaf">{scope}</span>}
    </div>
  );
}
