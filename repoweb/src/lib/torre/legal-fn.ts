import { createServerFn } from "@tanstack/react-start";
import { materializarAjustes } from "@/lib/torre/aplicar-ajustes";
import { auditar } from "@/lib/torre/audit";
import { hashDocumento, versionEsInmutable } from "@/lib/torre/legal";
import { exigirAccion } from "@/lib/torre/roles";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { requireTorre, torreGuard } from "@/lib/torre-fn";

function day(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export const listLegal = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const documents = await sql<{
      id: string;
      code: string;
      title: string;
      audience: string;
      reaccept_on_change: boolean;
      status: string;
    }>`
      select id, code, title, audience, reaccept_on_change, status
      from torre.saas_legal_documents order by title
    `;
    const versions = await sql<{
      id: string;
      document_id: string;
      version_label: string;
      body: string;
      content_hash: string;
      status: string;
      published_at: string | null;
    }>`
      select id, document_id, version_label, body, content_hash, status, published_at::text as published_at
      from torre.saas_legal_versions order by created_at desc
    `;
    const contracts = await sql<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      document_id: string;
      version_id: string;
      status: string;
      snapshot_hash: string;
    }>`
      select c.id, c.tenant_id, t.name as tenant_name, c.document_id, c.version_id, c.status, c.snapshot_hash
      from torre.saas_tenant_contracts c
      join torre.saas_tenants t on t.id = c.tenant_id
      order by c.offered_at desc
    `;
    const acceptances = await sql<{
      id: string;
      tenant_id: string | null;
      user_email: string;
      snapshot_hash: string;
      accepted_at: string;
      action: string;
    }>`
      select id, tenant_id, user_email, snapshot_hash, accepted_at::text as accepted_at, action
      from torre.saas_contract_acceptances order by accepted_at desc limit 100
    `;
    return {
      documents: documents.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        audience: row.audience,
        reacceptOnChange: row.reaccept_on_change,
        status: row.status,
      })),
      versions: versions.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        label: row.version_label,
        body: row.body,
        hash: row.content_hash,
        status: row.status,
        publishedAt: row.published_at ? row.published_at.slice(0, 16).replace("T", " ") : "",
      })),
      contracts: contracts.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        documentId: row.document_id,
        versionId: row.version_id,
        status: row.status,
        hash: row.snapshot_hash,
      })),
      acceptances: acceptances.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id ?? "",
        email: row.user_email,
        hash: row.snapshot_hash,
        at: row.accepted_at.slice(0, 16).replace("T", " "),
        action: row.action,
      })),
    };
  });

export const saveDocument = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id?: string; code: string; title: string; audience: string; reacceptOnChange: boolean; status: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "legal");
    if (!data.code.trim() || !data.title.trim()) throw new Error("Código y título son obligatorios.");
    const sql = await getSql();
    const id = data.id || newId("doc");
    if (data.id) {
      await sql`
        update torre.saas_legal_documents set
          code = ${data.code.trim()}, title = ${data.title.trim()}, audience = ${data.audience},
          reaccept_on_change = ${data.reacceptOnChange}, status = ${data.status}, updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_legal_documents (id, code, title, audience, reaccept_on_change, status)
        values (${id}, ${data.code.trim()}, ${data.title.trim()}, ${data.audience}, ${data.reacceptOnChange}, ${data.status})
      `;
    }
    await auditar(email, "guardar_documento", "legal_document", id, { code: data.code, audience: data.audience });
    return { id };
  });

export const publishVersion = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { documentId: string; label: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "legal");
    if (!data.body.trim() || !data.label.trim()) throw new Error("La versión necesita etiqueta y texto.");
    const sql = await getSql();
    const prev = await sql<{ id: string; status: string }>`
      select id, status from torre.saas_legal_versions
      where document_id = ${data.documentId} and version_label = ${data.label.trim()} limit 1
    `;
    if (prev[0] && versionEsInmutable(prev[0].status)) {
      throw new Error("Esa versión ya está publicada. Hay que crear otra etiqueta.");
    }
    const hash = hashDocumento(data.body);
    const id = prev[0]?.id || newId("lver");
    if (prev[0]) {
      await sql`
        update torre.saas_legal_versions
        set body = ${data.body}, content_hash = ${hash}, status = 'published', published_at = now()
        where id = ${id}
      `;
    } else {
      await sql`
        insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status, published_at)
        values (${id}, ${data.documentId}, ${data.label.trim()}, ${data.body}, ${hash}, 'published', now())
      `;
    }
    await sql`update torre.saas_legal_documents set status = 'published', updated_at = now() where id = ${data.documentId}`;
    await auditar(email, "publicar_version_legal", "legal_version", id, { hash, label: data.label });
    return { id, hash };
  });

export const offerContract = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { tenantId: string; versionId: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "legal");
    const sql = await getSql();
    const versions = await sql<{ id: string; document_id: string; body: string; content_hash: string; status: string; audience: string }>`
      select v.id, v.document_id, v.body, v.content_hash, v.status, d.audience
      from torre.saas_legal_versions v
      join torre.saas_legal_documents d on d.id = v.document_id
      where v.id = ${data.versionId} limit 1
    `;
    const version = versions[0];
    if (!version || version.status !== "published") throw new Error("Solo se ofrece una versión publicada.");
    if (version.audience !== "saas_b2b" && version.audience !== "privacy") {
      throw new Error("Ese documento no es de la relación con el puesto.");
    }
    await sql`
      update torre.saas_tenant_contracts
      set status = 'superseded'
      where tenant_id = ${data.tenantId} and document_id = ${version.document_id} and status = 'pending'
    `;
    const id = newId("ctr");
    await sql`
      insert into torre.saas_tenant_contracts (
        id, tenant_id, document_id, version_id, status, snapshot_body, snapshot_hash
      ) values (
        ${id}, ${data.tenantId}, ${version.document_id}, ${version.id}, 'pending', ${version.body}, ${version.content_hash}
      )
    `;
    await auditar(email, "ofrecer_contrato", "tenant_contract", id, { tenantId: data.tenantId, hash: version.content_hash });
    return { id, hash: version.content_hash };
  });

export const listPromotions = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const promos = await sql<{ id: string; code: string; name: string; description: string; status: string; config: unknown }>`
      select id, code, name, description, status, config from torre.saas_promotions order by name
    `;
    const grants = await sql<{
      id: string;
      promotion_id: string;
      tenant_name: string;
      status: string;
      starts_on: unknown;
      ends_on: unknown;
      conditions: string;
    }>`
      select g.id, g.promotion_id, t.name as tenant_name, g.status, g.starts_on, g.ends_on, g.conditions
      from torre.saas_promotion_grants g
      join torre.saas_tenants t on t.id = g.tenant_id
      order by g.starts_on desc
    `;
    const adjustments = await sql<{ id: string; tenant_name: string; kind: string; status: string; starts_on: unknown; ends_on: unknown }>`
      select a.id, t.name as tenant_name, a.kind, a.status, a.starts_on, a.ends_on
      from torre.saas_price_adjustments a
      join torre.saas_tenants t on t.id = a.tenant_id
      order by a.created_at desc
      limit 50
    `;
    return {
      promotions: promos.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        status: row.status,
        config: typeof row.config === "string" ? row.config : JSON.stringify(row.config ?? {}),
      })),
      grants: grants.map((row) => ({
        id: row.id,
        promotionId: row.promotion_id,
        tenantName: row.tenant_name,
        status: row.status,
        startsOn: day(row.starts_on),
        endsOn: row.ends_on ? day(row.ends_on) : "",
        conditions: row.conditions,
      })),
      adjustments: adjustments.map((row) => ({
        id: row.id,
        tenantName: row.tenant_name,
        kind: row.kind,
        status: row.status,
        startsOn: day(row.starts_on),
        endsOn: row.ends_on ? day(row.ends_on) : "",
      })),
    };
  });

export const savePromotion = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id?: string; code: string; name: string; description: string; status: string; config: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    if (!data.code.trim() || !data.name.trim()) throw new Error("Código y nombre son obligatorios.");
    let config = "{}";
    try {
      config = JSON.stringify(JSON.parse(data.config || "{}"));
    } catch {
      throw new Error("La configuración tiene que ser JSON.");
    }
    const sql = await getSql();
    const id = data.id || newId("promo");
    if (data.id) {
      await sql`
        update torre.saas_promotions set
          code = ${data.code.trim()}, name = ${data.name.trim()}, description = ${data.description.trim()},
          status = ${data.status}, config = ${config}::jsonb, updated_at = now()
        where id = ${data.id}
      `;
    } else {
      await sql`
        insert into torre.saas_promotions (id, code, name, description, status, config)
        values (${id}, ${data.code.trim()}, ${data.name.trim()}, ${data.description.trim()}, ${data.status}, ${config}::jsonb)
      `;
    }
    await auditar(email, "guardar_promocion", "promotion", id, { code: data.code, status: data.status });
    return { id };
  });

export const grantPromotion = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { promotionId: string; tenantId: string; startsOn: string; endsOn: string; conditions: string; evidenceRef: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "comercial");
    const sql = await getSql();
    const promos = await sql<{ status: string }>`select status from torre.saas_promotions where id = ${data.promotionId} limit 1`;
    if (promos[0]?.status !== "active") throw new Error("La promoción tiene que estar activa para asignarla.");
    const id = newId("grant");
    await sql`
      insert into torre.saas_promotion_grants (
        id, promotion_id, tenant_id, status, starts_on, ends_on, conditions, evidence_ref
      ) values (
        ${id}, ${data.promotionId}, ${data.tenantId}, 'active', ${data.startsOn}::date,
        ${data.endsOn || null}::date, ${data.conditions.trim()}, ${data.evidenceRef.trim()}
      )
    `;
    const ajustes = await materializarAjustes(data.tenantId);
    await auditar(email, "asignar_promocion", "promotion_grant", id, {
      tenantId: data.tenantId,
      promotionId: data.promotionId,
      startsOn: data.startsOn,
      endsOn: data.endsOn || null,
      conditions: data.conditions.trim(),
      evidenceRef: data.evidenceRef.trim(),
      adjustments: ajustes.inserted,
    });
    return { id, adjustments: ajustes.inserted };
  });

export const listProcessors = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    await requireTorre(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; category: string; purpose: string; legal_role_note: string; status: string }>`
      select id, name, category, purpose, legal_role_note, status from torre.saas_processors order by name
    `;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      purpose: row.purpose,
      legalRoleNote: row.legal_role_note,
      status: row.status,
    }));
  });

export const saveProcessor = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { name: string; category: string; purpose: string; legalRoleNote: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    await exigirAccion(email, "legal");
    if (!data.name.trim() || !data.category.trim()) throw new Error("Nombre y categoría son obligatorios.");
    const sql = await getSql();
    const id = newId("proc");
    await sql`
      insert into torre.saas_processors (id, name, category, purpose, legal_role_note)
      values (${id}, ${data.name.trim()}, ${data.category.trim()}, ${data.purpose.trim()}, ${data.legalRoleNote.trim() || "Pendiente de revisión jurídica. No clasifica responsable ni encargado."})
    `;
    await auditar(email, "documentar_procesador", "processor", id, { name: data.name });
    return { id };
  });
