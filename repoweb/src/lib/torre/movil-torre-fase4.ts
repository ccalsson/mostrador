import type { TorreFnMovil } from "@/lib/torre/movil-tipos";
import {
  crearApiKeyCore,
  crearWebhookCore,
  eliminarWebhookCore,
  listarApiKeysCore,
  listarWebhookLogCore,
  listarWebhooksCore,
  revocarApiKeyCore,
} from "@/lib/torre/api-marketplace-server";
import {
  actualizarGrupoCore,
  asignarClienteAGrupoCore,
  crearGrupoCore,
  desasignarClienteCore,
  detalleGrupoCore,
  eliminarGrupoCore,
  listarClientesParaGrupoCore,
  listarGruposCore,
} from "@/lib/torre/grupos-fn";
import {
  eliminarWhiteLabelCore,
  guardarWhiteLabelCore,
  listarWhiteLabelCore,
  obtenerWhiteLabelCore,
  previewWhiteLabelCore,
} from "@/lib/torre/white-label-fn";

// El móvil manda el id como string plano o dentro del body; ambos son válidos.
function idMovil(data: any, clave = "id"): string {
  if (typeof data === "string") return data;
  const v = data?.[clave] ?? data?.id;
  return v == null ? "" : String(v);
}

function textoMovil(v: unknown): string {
  return v == null ? "" : String(v);
}

function listaMovil(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function rpmMovil(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 60;
}

// El core arma `limit ${limite}` en SQL: se normaliza y acota acá.
function limiteMovil(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 200) : 50;
}

function blancoMovil(data: any) {
  return {
    marcaNombre: textoMovil(data?.marcaNombre),
    logoUrl: textoMovil(data?.logoUrl),
    colorPrimario: textoMovil(data?.colorPrimario),
    colorSecundario: textoMovil(data?.colorSecundario),
    colorFondo: textoMovil(data?.colorFondo),
    colorTexto: textoMovil(data?.colorTexto),
    fuente: textoMovil(data?.fuente),
    template: textoMovil(data?.template),
    dominioPropio: textoMovil(data?.dominioPropio),
    dominioActivo: data?.dominioActivo === true,
  };
}

// Clave = nombre exacto del export web. La app Flutter llama /api/torre/v1/fn/<clave>.
// El body JSON es el `data` que produce el validator de la función web.
export const torreFase4Movil: Record<string, TorreFnMovil> = {
  listarGrupos: (email) => listarGruposCore(email),
  crearGrupo: (email, data) =>
    crearGrupoCore(email, { nombre: textoMovil(data?.nombre), descripcion: textoMovil(data?.descripcion) }),
  actualizarGrupo: (email, data) =>
    actualizarGrupoCore(email, idMovil(data), {
      nombre: textoMovil(data?.nombre),
      descripcion: textoMovil(data?.descripcion),
    }),
  eliminarGrupo: (email, data) => eliminarGrupoCore(email, idMovil(data)),
  detalleGrupo: (email, data) => detalleGrupoCore(email, idMovil(data)),
  listarClientesParaGrupo: (email) => listarClientesParaGrupoCore(email),
  asignarClienteAGrupo: (email, data) => asignarClienteAGrupoCore(email, textoMovil(data?.clienteId), textoMovil(data?.grupoId)),
  desasignarCliente: (email, data) => desasignarClienteCore(email, idMovil(data, "clienteId")),

  listarApiKeys: (email) => listarApiKeysCore(email),
  crearApiKey: (email, data) =>
    crearApiKeyCore(email, {
      clientId: textoMovil(data?.clientId),
      nombre: textoMovil(data?.nombre),
      scopes: listaMovil(data?.scopes),
      rateLimitRpm: rpmMovil(data?.rateLimitRpm),
      expiresAt: textoMovil(data?.expiresAt).trim() || null,
    }),
  revocarApiKey: (email, data) => revocarApiKeyCore(email, idMovil(data, "keyId")),
  listarWebhooks: (email) => listarWebhooksCore(email),
  crearWebhook: (email, data) =>
    crearWebhookCore(email, { clientId: textoMovil(data?.clientId), url: textoMovil(data?.url), eventos: listaMovil(data?.eventos) }),
  eliminarWebhook: (email, data) => eliminarWebhookCore(email, idMovil(data)),
  listarWebhookLog: (email, data) => listarWebhookLogCore(email, textoMovil(data?.webhookId), limiteMovil(data?.limite)),

  listarWhiteLabel: (email) => listarWhiteLabelCore(email),
  obtenerWhiteLabel: (email, data) => obtenerWhiteLabelCore(email, idMovil(data, "tenantId")),
  guardarWhiteLabel: (email, data) => guardarWhiteLabelCore(email, idMovil(data, "tenantId"), blancoMovil(data)),
  eliminarWhiteLabel: (email, data) => eliminarWhiteLabelCore(email, idMovil(data, "tenantId")),
  previewWhiteLabel: (email, data) => previewWhiteLabelCore(email, idMovil(data, "tenantId")),
};
