import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ensureStaffForUser } from "@/lib/server/bootstrap";

export async function esPremium(casaId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select l.id
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id and s.status in ('active', 'past_due')
    join torre.saas_tenants t on t.id = s.tenant_id and t.status = 'active'
    join torre.saas_products p on p.id = l.product_id
    where t.operational_tenant_ref = ${casaId}
      and l.status = 'active'
      and coalesce(p.config, '{}'::jsonb)->>'plan' = 'premium'
    limit 1
  `;
  return Boolean(rows[0]);
}

export async function exigirPremium(casaId: string) {
  if (!(await esPremium(casaId))) throw new Error("Esto es del plan Premium.");
}

export const planDelPuesto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    return { premium: await esPremium(staff.casaId) };
  });
