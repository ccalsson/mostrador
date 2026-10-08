// Suscripción y contratos (Parte A, mostrador admin) y documentos legales del
// canal (Parte B, perfiles mercado) sobre el schema torre, según
// `app/docs/suscripcion-legal-propuesta.md`. Torre sigue siendo la fuente de
// verdad: aquí solo se leen versiones publicadas y se registran aceptaciones
// inmutables. Versión entera = row_number por documento (created_at, id), la
// misma en A.1–A.4 y B.1–B.3.

import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import type { Sql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { audit } from "@/lib/server/context";
import { MercadoError, auditMercado } from "@/lib/server/mercado";
import type { MercadoActor, MercadoPerfil } from "@/lib/server/mercado";
import type { Staff } from "@/lib/types";

export class LegalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LegalError";
  }
}

function fail(status: number, code: string, message: string): never {
  throw new LegalError(status, code, message);
}

function mfail(status: number, code: string, message: string): never {
  throw new MercadoError(status, code, message);
}

function canonico(body: string) {
  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function hashDocumento(body: string) {
  return createHash("sha256").update(canonico(body), "utf8").digest("hex");
}

function audienciasDe(actor: "mostrador" | MercadoPerfil): readonly string[] {
  if (actor === "mostrador") return ["saas_b2b", "privacy"];
  if (actor === "comprador") return ["mercado_comprador", "privacy"];
  return ["mercado_cargador", "privacy"];
}

function pendienteDeAceptacion(input: {
  reacceptOnChange: boolean;
  publishedHash: string;
  acceptedHashes: string[];
}) {
  if (input.acceptedHashes.includes(input.publishedHash)) return false;
  if (input.acceptedHashes.length === 0) return true;
  return input.reacceptOnChange;
}

function beneficioVigente(grant: { status: string; startsOn: string; endsOn: string | null }, today: string) {
  if (grant.status !== "active") return false;
  if (grant.startsOn > today) return false;
  if (grant.endsOn && grant.endsOn < today) return false;
  return true;
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function asConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type VersionRow = {
  id: string;
  version_label: string;
  body: string;
  content_hash: string;
  status: string;
  published_at: string | null;
  version: number;
};

async function versionesDe(sql: Sql, documentId: string): Promise<VersionRow[]> {
  return sql<VersionRow>`
    select v.id, v.version_label, v.body, v.content_hash, v.status, v.published_at,
           row_number() over (order by v.created_at, v.id)::int as version
    from torre.saas_legal_versions v
    where v.document_id = ${documentId}
    order by v.created_at, v.id
  `;
}

async function torreTenantIdDe(sql: Sql, operationalTenantId: string): Promise<string | null> {
  const rows = await sql<{ id: string }>`
    select id from torre.saas_tenants
    where operational_tenant_ref = ${operationalTenantId} and status = 'active'
    order by created_at
    limit 1
  `;
  return rows[0]?.id ?? null;
}

function assertAdmin(staff: Staff) {
  if (staff.rol !== "admin") fail(403, "rol_no_permitido", "Solo el dueño del puesto puede ver esto.");
}

function parseVersionInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(400, "cuerpo_invalido", "version debe ser un entero positivo.");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Parte A — suscripción y contratos (solo admin, tenant vinculado a Torre).
// ---------------------------------------------------------------------------

export async function resumenSuscripcionForStaff(staff: Staff) {
  assertAdmin(staff);
  const sql = await getSql();
  const torreTenantId = await torreTenantIdDe(sql, staff.tenantId);
  if (!torreTenantId) fail(404, "sin_suscripcion", "Este puesto no tiene suscripción.");

  const subs = await sql<{
    id: string;
    status: string;
    start_date: unknown;
    next_payment_date: unknown;
    monthly_price: unknown;
    plan_code: string | null;
    plan_name: string;
    currency: string;
    periodicity: string;
  }>`
    select s.id, s.status, s.start_date, s.next_payment_date, s.monthly_price,
           p.code as plan_code, p.name as plan_name, p.currency, p.periodicity
    from torre.saas_subscriptions s
    join torre.saas_plans p on p.id = s.plan_id
    where s.tenant_id = ${torreTenantId}
    order by s.start_date desc
    limit 1
  `;
  const sub = subs[0];
  if (!sub) fail(404, "sin_suscripcion", "Este puesto no tiene suscripción.");

  const lines = await sql<{
    product_name: string;
    slug: string;
    kind: string;
    config: unknown;
    quantity: unknown;
    status: string;
  }>`
    select pr.name as product_name, pr.slug, pr.kind, pr.config, l.quantity, l.status
    from torre.saas_subscription_lines l
    join torre.saas_products pr on pr.id = l.product_id
    where l.subscription_id = ${sub.id}
    order by l.starts_on
  `;
  const grants = await sql<{ status: string; starts_on: unknown; ends_on: unknown; conditions: string }>`
    select g.status, g.starts_on, g.ends_on, g.conditions
    from torre.saas_promotion_grants g
    where g.tenant_id = ${torreTenantId}
  `;

  const docRows = await sql<{ id: string; reaccept_on_change: boolean }>`
    select id, reaccept_on_change from torre.saas_legal_documents
    where audience = 'saas_b2b'
    order by created_at, id
    limit 1
  `;
  const doc = docRows[0];
  const versiones = doc ? await versionesDe(sql, doc.id) : [];
  const vigente = [...versiones].reverse().find((v) => v.status === "published");
  const acceptances = vigente
    ? await sql<{ snapshot_hash: string; accepted_at: string }>`
        select snapshot_hash, accepted_at from torre.saas_contract_acceptances
        where tenant_id = ${torreTenantId} and version_id = ${vigente.id}
        order by accepted_at desc
      `
    : [];
  const acceptedHashes = acceptances.map((row) => row.snapshot_hash);
  const pendiente = vigente && doc
    ? pendienteDeAceptacion({
        reacceptOnChange: doc.reaccept_on_change,
        publishedHash: vigente.content_hash,
        acceptedHashes,
      })
    : false;

  const today = hoy();
  const vigentesMercado = lines.filter((line) => {
    const config = asConfig(line.config);
    return (
      config.family === "mercado" &&
      line.status === "active" &&
      (sub.status === "active" || sub.status === "past_due")
    );
  });
  const periodo = sub.periodicity === "monthly" ? "mensual" : sub.periodicity === "yearly" ? "anual" : sub.periodicity;
  const condiciones = grants
    .map((g) => ({
      status: g.status,
      startsOn: String(g.starts_on).slice(0, 10),
      endsOn: g.ends_on ? String(g.ends_on).slice(0, 10) : null,
      conditions: g.conditions,
    }))
    .filter((g) => beneficioVigente(g, today));

  return {
    suscripcion: {
      plan: { codigo: sub.plan_code ?? "", nombre: sub.plan_name },
      estado:
        sub.status === "active"
          ? "activa"
          : sub.status === "cancelled"
            ? "cancelada"
            : sub.status === "pending"
              ? "prueba"
              : "vencida",
      inicio: String(sub.start_date).slice(0, 10),
      proximaRenovacion: sub.next_payment_date ? String(sub.next_payment_date).slice(0, 10) : null,
    },
    addons: lines
      .filter((line) => line.kind !== "base_product")
      .map((line) => {
        const config = asConfig(line.config);
        const detalle =
          config.family === "mercado"
            ? `Tier ${String(config.tier ?? "")}`.trim()
            : line.kind === "branch"
              ? "Sucursal adicional"
              : line.kind === "messaging"
                ? "Mensajería"
                : line.kind === "advertising"
                  ? "Publicidad"
                  : null;
        return { codigo: line.slug, nombre: line.product_name, activo: line.status === "active", detalle };
      }),
    sucursalesContratadas: 1 + lines.filter((line) => line.kind === "branch" && line.status === "active").length,
    mercadoAlToqueContratado: vigentesMercado.length > 0,
    precioVigente: { moneda: sub.currency, monto: num(sub.monthly_price), periodo },
    condicionesComerciales:
      condiciones.length > 0
        ? { resumen: condiciones.map((c) => c.conditions).join(" · "), actualizado: condiciones[0].startsOn }
        : null,
    contratoVigente:
      vigente && doc
        ? {
            documentoId: doc.id,
            version: vigente.version,
            hash: vigente.content_hash,
            estado: "vigente",
            aceptadoPorMi: acceptedHashes.includes(vigente.content_hash),
            fechaAceptacion: acceptances[0]?.accepted_at ?? null,
          }
        : null,
    pendiente: {
      hayPendiente: pendiente,
      documentoId: pendiente && doc ? doc.id : null,
      version: pendiente && vigente ? vigente.version : null,
      hash: pendiente && vigente ? vigente.content_hash : null,
    },
  };
}

async function documentoB2B(sql: Sql) {
  const docRows = await sql<{ id: string; title: string }>`
    select id, title from torre.saas_legal_documents
    where audience = 'saas_b2b'
    order by created_at, id
    limit 1
  `;
  return docRows[0] ?? null;
}

export async function contratoDocumentoForStaff(staff: Staff, versionInt?: number) {
  assertAdmin(staff);
  const sql = await getSql();
  if (!(await torreTenantIdDe(sql, staff.tenantId))) {
    fail(404, "contrato_no_encontrado", "No hay contrato para este puesto.");
  }
  const doc = await documentoB2B(sql);
  if (!doc) fail(404, "contrato_no_encontrado", "No hay contrato para este puesto.");
  const versiones = await versionesDe(sql, doc.id);
  const publicadas = versiones.filter((v) => v.status === "published");
  const actual = publicadas[publicadas.length - 1] ?? null;
  if (!actual) fail(404, "contrato_no_encontrado", "No hay contrato para este puesto.");

  let row: VersionRow | null = actual;
  if (versionInt !== undefined) {
    row = versiones.find((v) => v.version === versionInt) ?? null;
    if (!row) fail(404, "version_no_encontrada", "No existe esa versión del contrato.");
  }
  return {
    documentoId: doc.id,
    version: row.version,
    hash: row.content_hash,
    estado: row.id === actual.id ? "vigente" : "reemplazada",
    titulo: doc.title,
    fechaVigencia: row.published_at ? String(row.published_at).slice(0, 10) : null,
    contenido: { formato: "texto", valor: row.body },
    anexos: [],
  };
}

export async function historialContratoForStaff(staff: Staff) {
  assertAdmin(staff);
  const sql = await getSql();
  const doc = await documentoB2B(sql);
  if (!doc) return { entradas: [] };
  const versiones = (await versionesDe(sql, doc.id)).filter((v) => v.status !== "draft");
  const publicadas = versiones.filter((v) => v.status === "published");
  const actual = publicadas[publicadas.length - 1] ?? null;
  const aceptaciones = await sql<{ version_id: string; user_id: string; accepted_at: string }>`
    select version_id, user_id, accepted_at from torre.saas_contract_acceptances
    where tenant_id = ${(await torreTenantIdDe(sql, staff.tenantId)) ?? ""}
    order by accepted_at desc
  `;
  const entradas = versiones.map((row) => {
    const aceptacion = aceptaciones.find((a) => a.version_id === row.id);
    return {
      documentoId: doc.id,
      version: row.version,
      hash: row.content_hash,
      tipo: "contrato",
      estado: row.id === actual?.id ? "vigente" : "reemplazada",
      fechaDesde: row.published_at ? String(row.published_at).slice(0, 10) : "",
      fechaHasta: null,
      aceptacion: aceptacion
        ? { fecha: aceptacion.accepted_at, aceptadoPor: aceptacion.user_id }
        : null,
    };
  });
  return { entradas };
}

export async function aceptarContratoForStaff(
  staff: Staff,
  input: { documentoId: string; version: number; hash: string },
  ip: string,
  userAgent: string,
) {
  assertAdmin(staff);
  const sql = await getSql();
  const torreTenantId = await torreTenantIdDe(sql, staff.tenantId);
  if (!torreTenantId) fail(404, "version_no_encontrada", "No existe esa versión del contrato.");
  const doc = await documentoB2B(sql);
  if (!doc || doc.id !== input.documentoId) {
    fail(404, "version_no_encontrada", "No existe esa versión del contrato.");
  }
  const versiones = await versionesDe(sql, doc.id);
  const row = versiones.find((v) => v.version === input.version);
  if (!row) fail(404, "version_no_encontrada", "No existe esa versión del contrato.");
  if (row.status !== "published") fail(409, "version_obsoleta", "Esa versión ya no está vigente.");
  if (row.content_hash !== input.hash) fail(409, "hash_mismatch", "El hash no coincide con la versión vigente.");

  const existente = await sql<{ id: string; accepted_at: string }>`
    select id, accepted_at from torre.saas_contract_acceptances
    where tenant_id = ${torreTenantId} and version_id = ${row.id}
    limit 1
  `;
  let aceptacionId = existente[0]?.id ?? null;
  let fecha = existente[0]?.accepted_at ?? null;
  if (!aceptacionId) {
    aceptacionId = newId("acc");
    await sql`
      insert into torre.saas_contract_acceptances (
        id, version_id, tenant_id, user_id, user_email, snapshot_hash, ip, user_agent, action
      ) values (
        ${aceptacionId}, ${row.id}, ${torreTenantId}, ${staff.userId}, ${staff.email},
        ${row.content_hash}, ${ip}, ${userAgent}, 'electronic_acceptance'
      )
      on conflict (tenant_id, version_id) where tenant_id is not null do nothing
    `;
    const guardada = await sql<{ id: string; accepted_at: string }>`
      select id, accepted_at from torre.saas_contract_acceptances
      where tenant_id = ${torreTenantId} and version_id = ${row.id}
      limit 1
    `;
    aceptacionId = guardada[0]?.id ?? aceptacionId;
    fecha = guardada[0]?.accepted_at ?? new Date().toISOString();
    await sql`
      update torre.saas_tenant_contracts set status = 'accepted'
      where tenant_id = ${torreTenantId} and document_id = ${doc.id} and status = 'pending'
    `;
    await audit(staff.tenantId, staff, "contrato_aceptado", "suscripcion_contrato", {
      documentoId: doc.id,
      version: row.version,
      hash: row.content_hash,
    });
  }
  return {
    aceptacionId,
    documentoId: doc.id,
    version: row.version,
    fecha,
    contratoVigente: { aceptadoPorMi: true },
  };
}

// ---------------------------------------------------------------------------
// Parte B — documentos legales del canal (perfil del token, JSON directo).
// ---------------------------------------------------------------------------

function tipoDe(audience: string): string {
  if (audience === "privacy") return "privacidad";
  if (audience === "other") return "consentimiento";
  return "terminos";
}

export async function listarDocumentosLegales(actor: MercadoActor) {
  const sql = await getSql();
  const audiencias = audienciasDe(actor.perfil);
  const rows = await sql<{
    document_id: string;
    title: string;
    audience: string;
    reaccept_on_change: boolean;
  }>`
    select distinct on (d.id) d.id as document_id, d.title, d.audience, d.reaccept_on_change
    from torre.saas_legal_documents d
    join torre.saas_legal_versions v on v.document_id = d.id
    where v.status = 'published' and d.audience in ('mercado_comprador', 'mercado_cargador', 'privacy', 'other')
    order by d.id, v.published_at desc nulls last, v.created_at desc, v.id desc
  `;
  const aceptadas = await sql<{ version_id: string; accepted_at: string }>`
    select version_id, accepted_at from torre.saas_contract_acceptances
    where user_id = ${actor.id} and tenant_id is null
    order by accepted_at desc
  `;
  const documentos = [];
  for (const row of rows) {
    if (!audiencias.includes(row.audience)) continue;
    const versiones = await versionesDe(sql, row.document_id);
    const vigente = [...versiones].reverse().find((v) => v.status === "published");
    if (!vigente) continue;
    const hashes = versiones
      .filter((v) => aceptadas.some((a) => a.version_id === v.id))
      .map((v) => v.content_hash);
    const estado = pendienteDeAceptacion({
      reacceptOnChange: row.reaccept_on_change,
      publishedHash: vigente.content_hash,
      acceptedHashes: hashes,
    })
      ? "pendiente"
      : "aceptado";
    const ultima = aceptadas.find((a) => versiones.some((v) => v.id === a.version_id));
    documentos.push({
      documentoId: row.document_id,
      titulo: row.title,
      tipo: tipoDe(row.audience),
      versionVigente: vigente.version,
      hash: vigente.content_hash,
      estado,
      fechaAceptacion: ultima?.accepted_at ?? null,
      versionAceptada: ultima ? versiones.find((v) => v.id === ultima.version_id)?.version ?? null : null,
    });
  }
  if (documentos.length === 0) {
    mfail(404, "sin_documentos", "Todavía no hay documentos legales publicados.");
  }
  return { documentos };
}

export async function documentoLegalContenido(actor: MercadoActor, documentoId: string, versionInt?: number) {
  const sql = await getSql();
  const audiencias = audienciasDe(actor.perfil);
  const docRows = await sql<{ id: string; title: string; audience: string }>`
    select id, title, audience from torre.saas_legal_documents where id = ${documentoId} limit 1
  `;
  const doc = docRows[0];
  if (!doc) mfail(404, "documento_no_encontrado", "No existe ese documento.");
  if (!audiencias.includes(doc.audience)) mfail(403, "perfil_invalido", "Ese documento no es de tu perfil.");
  const versiones = await versionesDe(sql, doc.id);
  const publicadas = versiones.filter((v) => v.status === "published");
  const actual = publicadas[publicadas.length - 1] ?? null;
  if (!actual) mfail(404, "documento_no_encontrado", "No existe ese documento.");
  let row: VersionRow | null = actual;
  if (versionInt !== undefined) {
    row = versiones.find((v) => v.version === versionInt) ?? null;
    if (!row) mfail(404, "documento_no_encontrado", "No existe esa versión del documento.");
  }
  const mias = await sql<{ accepted_at: string }>`
    select accepted_at from torre.saas_contract_acceptances
    where user_id = ${actor.id} and tenant_id is null and version_id = ${row.id}
    order by accepted_at desc
    limit 1
  `;
  return {
    documentoId: doc.id,
    version: row.version,
    hash: row.content_hash,
    titulo: doc.title,
    fechaVigencia: row.published_at ? String(row.published_at).slice(0, 10) : null,
    contenido: { formato: "texto", valor: row.body },
    miAceptacion: mias[0] ? { version: row.version, fecha: mias[0].accepted_at } : null,
  };
}

export async function aceptarDocumentoLegal(
  actor: MercadoActor,
  documentoId: string,
  input: { version: number; hash: string },
  ip: string,
  userAgent: string,
) {
  const sql = await getSql();
  const audiencias = audienciasDe(actor.perfil);
  const docRows = await sql<{ id: string; audience: string }>`
    select id, audience from torre.saas_legal_documents where id = ${documentoId} limit 1
  `;
  const doc = docRows[0];
  if (!doc) mfail(404, "documento_no_encontrado", "No existe ese documento.");
  if (!audiencias.includes(doc.audience)) mfail(403, "perfil_invalido", "Ese documento no es de tu perfil.");
  const versiones = await versionesDe(sql, doc.id);
  const row = versiones.find((v) => v.version === input.version);
  if (!row) mfail(404, "documento_no_encontrado", "No existe esa versión del documento.");
  if (row.status !== "published") mfail(409, "version_obsoleta", "Esa versión ya no está vigente.");
  if (row.content_hash !== input.hash) mfail(409, "hash_mismatch", "El hash no coincide con la versión vigente.");

  const existente = await sql<{ accepted_at: string }>`
    select accepted_at from torre.saas_contract_acceptances
    where user_id = ${actor.id} and tenant_id is null and version_id = ${row.id}
    limit 1
  `;
  let fecha = existente[0]?.accepted_at ?? null;
  if (!fecha) {
    await sql`
      insert into torre.saas_contract_acceptances (
        id, version_id, user_id, user_email, snapshot_hash, ip, user_agent, action
      ) values (
        ${newId("acc")}, ${row.id}, ${actor.id}, ${actor.email},
        ${row.content_hash}, ${ip}, ${userAgent}, 'electronic_acceptance'
      )
      on conflict (user_id, version_id) where tenant_id is null do nothing
    `;
    const guardada = await sql<{ accepted_at: string }>`
      select accepted_at from torre.saas_contract_acceptances
      where user_id = ${actor.id} and tenant_id is null and version_id = ${row.id}
      limit 1
    `;
    fecha = guardada[0]?.accepted_at ?? new Date().toISOString();
    await auditMercado(sql, actor, "legal_documento_aceptado", "mercado", {
      documentoId: doc.id,
      version: row.version,
      hash: row.content_hash,
    });
  }
  return { documentoId: doc.id, version: row.version, estado: "aceptado", fecha };
}
