import { newId } from "../ids.ts";
import { getSql } from "../db.ts";

export async function auditar(
  email: string,
  action: string,
  entity: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  const sql = await getSql();
  await sql`
    insert into torre.saas_audit (id, actor_email, action, entity, entity_id, metadata)
    values (${newId("aud")}, ${email}, ${action}, ${entity}, ${entityId}, ${JSON.stringify(metadata)}::jsonb)
  `;
}
