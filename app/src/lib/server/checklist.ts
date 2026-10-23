import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { assertRole, audit } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

export type ChecklistItem = {
  id: string;
  pedidoId: string;
  descripcion: string;
  completado: boolean;
  createdAt: string;
};

export type ChecklistTemplate = {
  id: string;
  nombre: string;
  items: string[];
  activo: boolean;
  createdAt: string;
};

// ── Checklist Items ──────────────────────────────────────────────────

export async function listChecklistItemsForStaff(
  staff: Staff,
  pedidoId: string,
): Promise<ChecklistItem[]> {
  assertRole(staff, ["admin", "cajero", "vendedor"]);
  const sql = await getSql();
  // Verificar que el pedido pertenece al tenant
  const pedidos = await sql<{ id: string }>`
    select id from pedidos where id = ${pedidoId} and tenant_id = ${staff.tenantId} limit 1
  `;
  if (!pedidos.length) throw new Error("Pedido no encontrado.");
  const rows = await sql<{
    id: string;
    pedido_id: string;
    descripcion: string;
    completado: boolean;
    created_at: string;
  }>`
    select id, pedido_id, descripcion, completado, created_at::text as created_at
    from checklist_items
    where pedido_id = ${pedidoId}
    order by created_at asc
  `;
  return rows.map(mapChecklistItem);
}

export async function createChecklistItemForStaff(
  staff: Staff,
  input: { pedidoId: string; descripcion: string },
): Promise<ChecklistItem> {
  assertRole(staff, ["admin", "cajero", "vendedor"]);
  const sql = await getSql();
  const pedidos = await sql<{ id: string }>`
    select id from pedidos where id = ${input.pedidoId} and tenant_id = ${staff.tenantId} limit 1
  `;
  if (!pedidos.length) throw new Error("Pedido no encontrado.");
  const id = newId("chk");
  await sql`
    insert into checklist_items (id, pedido_id, descripcion)
    values (${id}, ${input.pedidoId}, ${input.descripcion})
  `;
  await audit(staff.tenantId, staff, "checklist_crear", "pedido", { pedidoId: input.pedidoId, id });
  const rows = await sql<{
    id: string;
    pedido_id: string;
    descripcion: string;
    completado: boolean;
    created_at: string;
  }>`
    select id, pedido_id, descripcion, completado, created_at::text as created_at
    from checklist_items where id = ${id} limit 1
  `;
  return mapChecklistItem(rows[0]);
}

export async function toggleChecklistItemForStaff(
  staff: Staff,
  input: { pedidoId: string; itemId: string; completado: boolean },
): Promise<ChecklistItem> {
  assertRole(staff, ["admin", "cajero", "vendedor"]);
  const sql = await getSql();
  const rows = await sql<{ id: string; pedido_id: string }>`
    select ci.id, ci.pedido_id from checklist_items ci
    join pedidos p on p.id = ci.pedido_id
    where ci.id = ${input.itemId} and p.tenant_id = ${staff.tenantId} and p.id = ${input.pedidoId}
    limit 1
  `;
  if (!rows.length) throw new Error("Item no encontrado.");
  await sql`
    update checklist_items set completado = ${input.completado}
    where id = ${input.itemId}
  `;
  await audit(staff.tenantId, staff, "checklist_toggle", "pedido", {
    pedidoId: input.pedidoId,
    itemId: input.itemId,
    completado: input.completado,
  });
  const updated = await sql<{
    id: string;
    pedido_id: string;
    descripcion: string;
    completado: boolean;
    created_at: string;
  }>`
    select id, pedido_id, descripcion, completado, created_at::text as created_at
    from checklist_items where id = ${input.itemId} limit 1
  `;
  return mapChecklistItem(updated[0]);
}

export async function deleteChecklistItemForStaff(
  staff: Staff,
  input: { pedidoId: string; itemId: string },
): Promise<void> {
  assertRole(staff, ["admin", "cajero", "vendedor"]);
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select ci.id from checklist_items ci
    join pedidos p on p.id = ci.pedido_id
    where ci.id = ${input.itemId} and p.tenant_id = ${staff.tenantId} and p.id = ${input.pedidoId}
    limit 1
  `;
  if (!rows.length) throw new Error("Item no encontrado.");
  await sql`delete from checklist_items where id = ${input.itemId}`;
  await audit(staff.tenantId, staff, "checklist_borrar", "pedido", {
    pedidoId: input.pedidoId,
    itemId: input.itemId,
  });
}

// ── Verificación al entregar ─────────────────────────────────────────

export async function verificarChecklistCompleto(
  pedidoId: string,
  tenantId: string,
): Promise<{ ok: boolean; pendientes: number }> {
  const sql = await getSql();
  const rows = await sql<{ total: number; pendientes: number }>`
    select
      count(*)::int as total,
      count(*) filter (where not completado)::int as pendientes
    from checklist_items ci
    join pedidos p on p.id = ci.pedido_id
    where ci.pedido_id = ${pedidoId} and p.tenant_id = ${tenantId}
  `;
  const r = rows[0];
  if (!r || r.total === 0) return { ok: true, pendientes: 0 };
  return { ok: r.pendientes === 0, pendientes: r.pendientes };
}

// ── Templates ────────────────────────────────────────────────────────

export async function listChecklistTemplatesForStaff(
  staff: Staff,
): Promise<ChecklistTemplate[]> {
  assertRole(staff, ["admin", "cajero", "vendedor"]);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    nombre: string;
    items: unknown;
    activo: boolean;
    created_at: string;
  }>`
    select id, nombre, items, activo, created_at::text as created_at
    from checklist_templates
    where tenant_id = ${staff.tenantId} and activo = true
    order by created_at asc
  `;
  return rows.map(mapChecklistTemplate);
}

export async function createChecklistTemplateForStaff(
  staff: Staff,
  input: { nombre: string; items: string[] },
): Promise<ChecklistTemplate> {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const id = newId("cht");
  await sql`
    insert into checklist_templates (id, tenant_id, nombre, items)
    values (${id}, ${staff.tenantId}, ${input.nombre}, ${JSON.stringify(input.items)}::jsonb)
  `;
  await audit(staff.tenantId, staff, "checklist_template_crear", "checklist_template", { id, nombre: input.nombre });
  const rows = await sql<{
    id: string;
    nombre: string;
    items: unknown;
    activo: boolean;
    created_at: string;
  }>`
    select id, nombre, items, activo, created_at::text as created_at
    from checklist_templates where id = ${id} limit 1
  `;
  return mapChecklistTemplate(rows[0]);
}

// ── Mappers ──────────────────────────────────────────────────────────

function mapChecklistItem(row: {
  id: string;
  pedido_id: string;
  descripcion: string;
  completado: boolean;
  created_at: string;
}): ChecklistItem {
  return {
    id: row.id,
    pedidoId: row.pedido_id,
    descripcion: row.descripcion,
    completado: row.completado,
    createdAt: row.created_at,
  };
}

function mapChecklistTemplate(row: {
  id: string;
  nombre: string;
  items: unknown;
  activo: boolean;
  created_at: string;
}): ChecklistTemplate {
  let items: string[];
  if (Array.isArray(row.items)) {
    items = row.items.map(String);
  } else if (typeof row.items === "string") {
    try {
      items = JSON.parse(row.items) as string[];
    } catch {
      items = [];
    }
  } else {
    items = [];
  }
  return {
    id: row.id,
    nombre: row.nombre,
    items,
    activo: row.activo,
    createdAt: row.created_at,
  };
}
