import { loadStaffByUserId } from "@/lib/server/context";
import { getSessionUser } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { auditar } from "@/lib/torre/audit";
import { audienciasDe, beneficioVigente, hashDocumento, pendienteDeAceptacion } from "@/lib/torre/legal";
import { precioEfectivo } from "@/lib/torre/comercial";
import { condicionOperativa } from "@/lib/torre/presencia";
import { leerSesion } from "@/lib/mercado/servicio";
import type { Rol } from "@/lib/types";

export class CentralError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CentralError";
  }
}

type Actor =
  | { kind: "mostrador"; torreTenantId: string; userId: string; email: string; rol: Rol }
  | { kind: "mercado"; perfil: "comprador" | "cargador"; userId: string; email: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

async function resolver(request: Request): Promise<Actor> {
  const user = await getSessionUser(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || undefined);
  if (user) {
    const staff = await loadStaffByUserId(user.id);
    if (staff) {
      const sql = await getSql();
      const tenants = await sql<{ id: string }>`
        select id from torre.saas_tenants
        where operational_tenant_ref = ${staff.tenantId} and status = 'active'
        order by created_at
        limit 1
      `;
      if (!tenants[0]) throw new CentralError("Este puesto no está vinculado a un tenant de Torre.", 404, "tenant_not_linked");
      return { kind: "mostrador", torreTenantId: tenants[0].id, userId: user.id, email: staff.email, rol: staff.rol };
    }
  }
  try {
    const ses = await leerSesion(request);
    const sql = await getSql();
    const users = await sql<{ email: string }>`select email from "user" where id = ${ses.userId} limit 1`;
    return { kind: "mercado", perfil: ses.perfil, userId: ses.userId, email: users[0]?.email ?? "" };
  } catch {
    throw new CentralError("Tenés que iniciar sesión.", 401, "unauthenticated");
  }
}

async function suscripcionDe(tenantId: string) {
  const sql = await getSql();
  const subs = await sql<{
    id: string;
    status: string;
    start_date: unknown;
    next_payment_date: unknown;
    plan_code: string | null;
    plan_name: string;
    currency: string;
    periodicity: string;
  }>`
    select s.id, s.status, s.start_date, s.next_payment_date, p.code as plan_code, p.name as plan_name,
           p.currency, p.periodicity
    from torre.saas_subscriptions s
    join torre.saas_plans p on p.id = s.plan_id
    where s.tenant_id = ${tenantId}
    order by s.start_date desc
    limit 1
  `;
  const sub = subs[0];
  if (!sub) return null;
  const lines = await sql<{
    id: string;
    product_name: string;
    slug: string;
    kind: string;
    quantity: unknown;
    unit_price: unknown;
    currency: string;
    frequency: string;
    charge: string;
    subtotal: unknown;
    status: string;
    starts_on: unknown;
    ends_on: unknown;
  }>`
    select l.id, pr.name as product_name, pr.slug, pr.kind, l.quantity, l.unit_price, l.currency,
           l.frequency, l.charge, l.subtotal, l.status, l.starts_on, l.ends_on
    from torre.saas_subscription_lines l
    join torre.saas_products pr on pr.id = l.product_id
    where l.subscription_id = ${sub.id}
    order by l.starts_on
  `;
  const grants = await sql<{ code: string; status: string; starts_on: unknown; ends_on: unknown; conditions: string }>`
    select p.code, g.status, g.starts_on, g.ends_on, g.conditions
    from torre.saas_promotion_grants g
    join torre.saas_promotions p on p.id = g.promotion_id
    where g.tenant_id = ${tenantId}
  `;
  const adjustments = await sql<{
    id: string;
    line_id: string | null;
    kind: string;
    percent: unknown;
    amount: unknown;
    currency: string | null;
    starts_on: unknown;
    ends_on: unknown;
    status: string;
    note: string;
  }>`
    select id, line_id, kind, percent, amount, currency, starts_on, ends_on, status, note
    from torre.saas_price_adjustments
    where tenant_id = ${tenantId}
  `;
  const today = hoy();
  const mappedAdjustments = adjustments.map((row) => ({
    id: row.id,
    lineId: row.line_id,
    kind: row.kind,
    percent: row.percent == null ? null : num(row.percent),
    amount: row.amount == null ? null : num(row.amount),
    currency: row.currency,
    startsOn: String(row.starts_on).slice(0, 10),
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    status: row.status,
    note: row.note,
  }));
  return {
    id: sub.id,
    status: sub.status,
    plan: { code: sub.plan_code, name: sub.plan_name, currency: sub.currency, periodicity: sub.periodicity },
    startDate: String(sub.start_date).slice(0, 10),
    nextPaymentDate: sub.next_payment_date ? String(sub.next_payment_date).slice(0, 10) : null,
    lines: lines.map((line) => {
      const propios = mappedAdjustments.filter((row) => row.lineId === line.id);
      const efecto = precioEfectivo(num(line.unit_price), propios, today);
      return {
        id: line.id,
        product: line.product_name,
        code: line.slug,
        kind: line.kind,
        quantity: num(line.quantity),
        unitPrice: efecto.contracted,
        effectivePrice: efecto.effective,
        amountDue: Math.round(efecto.effective * num(line.quantity) * 100) / 100,
        bonus: efecto.bonus,
        discount: efecto.discount,
        frozen: efecto.frozen,
        currency: line.currency,
        frequency: line.frequency,
        charge: line.charge,
        subtotal: num(line.subtotal),
        status: line.status,
        startsOn: String(line.starts_on).slice(0, 10),
        endsOn: line.ends_on ? String(line.ends_on).slice(0, 10) : null,
        adjustments: propios.map((row) => ({
          kind: row.kind,
          percent: row.percent,
          amount: row.amount,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          status: row.status,
        })),
      };
    }),
    grants: grants
      .filter((grant) => beneficioVigente({
        status: grant.status,
        startsOn: String(grant.starts_on).slice(0, 10),
        endsOn: grant.ends_on ? String(grant.ends_on).slice(0, 10) : null,
      }, today))
      .map((grant) => ({ code: grant.code, startsOn: String(grant.starts_on).slice(0, 10), endsOn: grant.ends_on ? String(grant.ends_on).slice(0, 10) : null, conditions: grant.conditions })),
    commissionOverrides: mappedAdjustments
      .filter((row) => row.kind === "commission_override" && row.status === "active")
      .map((row) => ({ percent: row.percent, startsOn: row.startsOn, endsOn: row.endsOn, status: row.status })),
  };
}

export async function handleCentral(request: Request) {
  try {
    const ruta = new URL(request.url).pathname.replace(/^\/api\/central\/v1\/?/, "").replace(/\/$/, "");
    const actor = await resolver(request);
    if (request.method === "GET" && (ruta === "subscription" || ruta === "addons")) {
      if (actor.kind !== "mostrador") throw new CentralError("Esto es de la relación comercial del puesto.", 403, "not_a_tenant");
      if (actor.rol !== "admin") throw new CentralError("Solo el dueño del puesto puede ver esto.", 403, "rol_no_permitido");
      const sub = await suscripcionDe(actor.torreTenantId);
      if (!sub) throw new CentralError("No hay suscripción para este puesto.", 404, "subscription_not_found");
      if (ruta === "addons") {
        return json({ addons: sub.lines.filter((line) => line.kind !== "base_product" && line.status === "active") });
      }
      return json({ subscription: sub });
    }
    if (request.method === "GET" && ruta === "capabilities") {
      if (actor.kind !== "mostrador") throw new CentralError("Esto es de la relación comercial del puesto.", 403, "not_a_tenant");
      if (actor.rol !== "admin") throw new CentralError("Solo el dueño del puesto puede ver esto.", 403, "rol_no_permitido");
      const sql = await getSql();
      const refs = await sql<{ ref: string | null }>`
        select operational_tenant_ref as ref from torre.saas_tenants where id = ${actor.torreTenantId} limit 1
      `;
      return json(await condicionOperativa(refs[0]?.ref ?? ""));
    }
    if (request.method === "GET" && (ruta === "contracts" || ruta.startsWith("contracts/") || ruta === "legal-documents")) {
      return json(await leerDocumentos(actor, ruta));
    }
    const aceptar = ruta.match(/^contracts\/([^/]+)\/accept$/);
    if (request.method === "POST" && aceptar) {
      return json(await aceptarDocumento(actor, aceptar[1], request), 201);
    }
    throw new CentralError("No existe esa ruta.", 404, "not_found");
  } catch (err) {
    if (err instanceof CentralError) return json({ error: { code: err.code, message: err.message } }, err.status);
    const message = err instanceof Error ? err.message : "Error";
    const status = message === "Unauthorized" ? 401 : 500;
    return json({ error: { code: status === 401 ? "unauthenticated" : "internal", message } }, status);
  }
}

async function leerDocumentos(actor: Actor, ruta: string) {
  if (actor.kind === "mostrador" && actor.rol !== "admin") {
    throw new CentralError("Solo el dueño del puesto puede ver esto.", 403, "rol_no_permitido");
  }
  const perfil = actor.kind === "mostrador" ? "mostrador" : actor.perfil;
  const permitidas = new Set<string>(audienciasDe(perfil));
  const sql = await getSql();
  const versions = await sql<{
    id: string;
    document_id: string;
    code: string;
    title: string;
    audience: string;
    reaccept_on_change: boolean;
    version_label: string;
    body: string;
    content_hash: string;
  }>`
    select v.id, v.document_id, d.code, d.title, d.audience, d.reaccept_on_change, v.version_label, v.body, v.content_hash
    from torre.saas_legal_versions v
    join torre.saas_legal_documents d on d.id = v.document_id
    where v.status = 'published'
  `;
  const visibles = versions.filter((row) => permitidas.has(row.audience));
  if (ruta === "legal-documents") {
    return {
      documents: visibles.map((row) => ({
        id: row.document_id,
        code: row.code,
        title: row.title,
        audience: row.audience,
        versionId: row.id,
        version: row.version_label,
        hash: row.content_hash,
        reacceptOnChange: row.reaccept_on_change,
      })),
    };
  }
  const hashes = actor.kind === "mostrador"
    ? await sql<{ snapshot_hash: string; document_id: string }>`
        select a.snapshot_hash, v.document_id
        from torre.saas_contract_acceptances a
        join torre.saas_legal_versions v on v.id = a.version_id
        where a.tenant_id = ${actor.torreTenantId}
      `
    : await sql<{ snapshot_hash: string; document_id: string }>`
        select a.snapshot_hash, v.document_id
        from torre.saas_contract_acceptances a
        join torre.saas_legal_versions v on v.id = a.version_id
        where a.user_id = ${actor.userId} and a.tenant_id is null
      `;
  const contracts = actor.kind === "mostrador"
    ? await sql<{ id: string; document_id: string; status: string; snapshot_hash: string; snapshot_body: string; version_id: string }>`
        select id, document_id, status, snapshot_hash, snapshot_body, version_id
        from torre.saas_tenant_contracts where tenant_id = ${actor.torreTenantId}
      `
    : [];
  const pending = [];
  for (const version of visibles) {
    const accepted = hashes.filter((row) => row.document_id === version.document_id).map((row) => row.snapshot_hash);
    const falta = pendienteDeAceptacion({
      reacceptOnChange: version.reaccept_on_change,
      publishedHash: version.content_hash,
      acceptedHashes: accepted,
    });
    if (!falta) continue;
    const ofrecido = contracts.find((row) => row.document_id === version.document_id && row.status === "pending");
    if (actor.kind === "mostrador" && version.audience === "saas_b2b" && !ofrecido) continue;
    pending.push({
      id: ofrecido?.id ?? version.id,
      code: version.code,
      title: version.title,
      audience: version.audience,
      version: version.version_label,
      hash: ofrecido?.snapshot_hash ?? version.content_hash,
      body: ofrecido?.snapshot_body ?? version.body,
    });
  }
  const history = hashes.map((row) => ({ hash: row.snapshot_hash, documentId: row.document_id }));
  if (ruta === "contracts/pending") return { pending };
  if (ruta === "contracts/history") return { history };
  if (ruta === "contracts/current") {
    return {
      current: visibles.filter((version) => hashes.some((row) => row.document_id === version.document_id && row.snapshot_hash === version.content_hash)).map((version) => ({
        code: version.code,
        title: version.title,
        version: version.version_label,
        hash: version.content_hash,
        body: version.body,
      })),
    };
  }
  return { pending, history };
}

async function aceptarDocumento(actor: Actor, id: string, request: Request) {
  const sql = await getSql();
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "";
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 300);
  if (actor.kind === "mostrador") {
    if (actor.rol !== "admin") throw new CentralError("Solo el dueño del puesto puede aceptar contratos.", 403, "rol_no_permitido");
    const rows = await sql<{ id: string; tenant_id: string; status: string; snapshot_body: string; snapshot_hash: string; version_id: string }>`
      select id, tenant_id, status, snapshot_body, snapshot_hash, version_id
      from torre.saas_tenant_contracts where id = ${id} limit 1
    `;
    const contract = rows[0];
    if (!contract || contract.tenant_id !== actor.torreTenantId) throw new CentralError("No está ese contrato.", 404, "not_found");
    if (contract.status === "accepted") throw new CentralError("Ese contrato ya fue aceptado.", 409, "already_accepted");
    if (contract.status !== "pending") throw new CentralError("Ese contrato no está pendiente.", 409, "not_pending");
    if (hashDocumento(contract.snapshot_body) !== contract.snapshot_hash) {
      throw new CentralError("El snapshot no coincide con su hash.", 409, "hash_mismatch");
    }
    const acceptanceId = newId("acc");
    await sql`
      insert into torre.saas_contract_acceptances (
        id, contract_id, version_id, tenant_id, user_id, user_email, snapshot_hash, ip, user_agent, action
      ) values (
        ${acceptanceId}, ${contract.id}, ${contract.version_id}, ${actor.torreTenantId}, ${actor.userId},
        ${actor.email}, ${contract.snapshot_hash}, ${ip}, ${userAgent}, 'electronic_acceptance'
      )
    `;
    await sql`update torre.saas_tenant_contracts set status = 'accepted' where id = ${contract.id}`;
    await auditar(actor.email || actor.userId, "aceptar_contrato", "tenant_contract", contract.id, { hash: contract.snapshot_hash, tenantId: actor.torreTenantId });
    return { acceptanceId, hash: contract.snapshot_hash, action: "electronic_acceptance" };
  }
  const versions = await sql<{ id: string; body: string; content_hash: string; status: string; audience: string }>`
    select v.id, v.body, v.content_hash, v.status, d.audience
    from torre.saas_legal_versions v
    join torre.saas_legal_documents d on d.id = v.document_id
    where v.id = ${id} limit 1
  `;
  const version = versions[0];
  const permitidas = new Set<string>(audienciasDe(actor.perfil));
  if (!version || !permitidas.has(version.audience) || version.status !== "published") {
    throw new CentralError("No está ese documento.", 404, "not_found");
  }
  if (hashDocumento(version.body) !== version.content_hash) throw new CentralError("El documento no coincide con su hash.", 409, "hash_mismatch");
  const previos = await sql<{ id: string }>`
    select id from torre.saas_contract_acceptances
    where user_id = ${actor.userId} and version_id = ${version.id} and snapshot_hash = ${version.content_hash}
    limit 1
  `;
  if (previos[0]) throw new CentralError("Ese documento ya fue aceptado.", 409, "already_accepted");
  const acceptanceId = newId("acc");
  await sql`
    insert into torre.saas_contract_acceptances (
      id, version_id, user_id, user_email, snapshot_hash, ip, user_agent, action
    ) values (
      ${acceptanceId}, ${version.id}, ${actor.userId}, ${actor.email}, ${version.content_hash}, ${ip}, ${userAgent}, 'electronic_acceptance'
    )
  `;
  await auditar(actor.email || actor.userId, "aceptar_terminos", "legal_version", version.id, { hash: version.content_hash, perfil: actor.perfil });
  return { acceptanceId, hash: version.content_hash, action: "electronic_acceptance" };
}
