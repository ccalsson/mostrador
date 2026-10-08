import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { efectosDePromocion, type PromoConfig } from "@/lib/torre/comercial";

function day(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function configOf(value: unknown): PromoConfig {
  if (value && typeof value === "object") return value as PromoConfig;
  if (typeof value === "string" && value.trim()) {
    try {
      return JSON.parse(value) as PromoConfig;
    } catch {
      return {};
    }
  }
  return {};
}

/** Materializa bonificación, descuento, congelamiento y comisión sin reescribir el precio contratado. */
export async function materializarAjustes(tenantId: string) {
  const sql = await getSql();
  const grants = await sql<{ id: string; starts_on: unknown; config: unknown }>`
    select g.id, g.starts_on, p.config
    from torre.saas_promotion_grants g
    join torre.saas_promotions p on p.id = g.promotion_id
    where g.tenant_id = ${tenantId} and g.status = 'active'
  `;
  const lines = await sql<{ id: string; slug: string; currency: string; unit_price: unknown }>`
    select l.id, pr.slug, l.currency, l.unit_price
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_products pr on pr.id = l.product_id
    where s.tenant_id = ${tenantId} and l.status = 'active'
  `;
  const existing = await sql<{ grant_id: string | null; line_id: string | null; kind: string }>`
    select grant_id, line_id, kind
    from torre.saas_price_adjustments
    where tenant_id = ${tenantId}
  `;
  const known = new Set(existing.map((row) => `${row.grant_id ?? ""}|${row.line_id ?? ""}|${row.kind}`));
  let inserted = 0;
  for (const grant of grants) {
    const efectos = efectosDePromocion({
      startsOn: day(grant.starts_on),
      config: configOf(grant.config),
      lines: lines.map((line) => ({ id: line.id, slug: line.slug, currency: line.currency, unitPrice: num(line.unit_price) })),
    });
    for (const efecto of efectos) {
      const key = `${grant.id}|${efecto.lineId ?? ""}|${efecto.kind}`;
      if (known.has(key)) continue;
      const id = newId("adj");
      await sql`
        insert into torre.saas_price_adjustments (
          id, tenant_id, line_id, grant_id, kind, percent, amount, currency, starts_on, ends_on, status, note
        ) values (
          ${id}, ${tenantId}, ${efecto.lineId}, ${grant.id}, ${efecto.kind}, ${efecto.percent}, ${efecto.amount},
          ${efecto.currency}, ${efecto.startsOn}::date, ${efecto.endsOn}::date, 'active', ${efecto.note}
        )
      `;
      known.add(key);
      inserted += 1;
      if (efecto.lineId) {
        await sql`
          update torre.saas_price_adjustments
          set status = 'ended'
          where tenant_id = ${tenantId} and grant_id = ${grant.id} and kind = ${efecto.kind} and line_id is null and status = 'active'
        `;
      }
    }
  }
  return { inserted };
}
