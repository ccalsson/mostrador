import { createHash, randomBytes } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { ensureBootstrapped } from "@/lib/server/bootstrap";
import { habilitarPedido } from "@/lib/torre/control-fn";

export class TorreMovilError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function dia(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function idAviso(texto: string) {
  return createHash("sha256").update(texto).digest("hex").slice(0, 16);
}

async function sql() {
  await ensureBootstrapped();
  return getSql();
}

export async function ingresarTorre(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) throw new TorreMovilError("Completá correo y clave.");
  const db = await sql();
  const acceso = await db<{ email: string }>`
    select email from torre.saas_access where lower(email) = ${email} limit 1
  `;
  if (!acceso[0]) throw new TorreMovilError("Esta cuenta no abre la Torre.", 403);
  const users = await db<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  const user = users[0];
  if (!user) throw new TorreMovilError("Correo o clave incorrectos.", 401);
  const cuentas = await db<{ password: string | null }>`
    select password from account where "userId" = ${user.id} and "providerId" = 'credential' limit 1
  `;
  const hash = cuentas[0]?.password;
  if (!hash || !(await verifyPassword({ hash, password }))) {
    throw new TorreMovilError("Correo o clave incorrectos.", 401);
  }
  const token = randomBytes(32).toString("hex");
  await db`
    insert into torre.saas_sesiones (token_hash, user_id, email, expires_at)
    values (${hashToken(token)}, ${user.id}, ${email}, now() + interval '30 days')
  `;
  return { token, email };
}

export async function sesionTorre(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new TorreMovilError("Tenés que entrar.", 401);
  const db = await sql();
  const rows = await db<{ user_id: string; email: string }>`
    select user_id, email from torre.saas_sesiones
    where token_hash = ${hashToken(token)} and expires_at > now()
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new TorreMovilError("La sesión no sirve. Entrá de nuevo.", 401);
  return { userId: row.user_id, email: row.email };
}

export async function pendientesTorre() {
  const db = await sql();
  const pedidos = await db<{
    id: string;
    tenant: string;
    product: string;
    amount: unknown;
    currency: string;
    medio: string | null;
    notes: string;
    tiene_comprobante: boolean;
    created_at: string;
  }>`
    select p.id, t.name as tenant, pr.name as product, p.amount, p.currency, p.medio, p.notes,
           (p.comprobante_data is not null and p.comprobante_data <> '') as tiene_comprobante,
           p.created_at::text as created_at
    from torre.saas_payments p
    join torre.saas_tenants t on t.id = p.tenant_id
    join torre.saas_products pr on pr.id = p.product_id
    where p.status = 'pending' and p.line_id is null and p.kind in ('addon', 'publicidad', 'push')
    order by p.created_at desc
  `;
  const textos: string[] = [];
  const vencidas = await db<{ name: string; next_due: unknown }>`
    select t.name, l.next_due
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_tenants t on t.id = s.tenant_id
    where l.status = 'active' and l.frequency = 'monthly' and l.next_due is not null and l.next_due < current_date
  `;
  for (const row of vencidas) textos.push(`Abono vencido: ${row.name} (${dia(row.next_due)}).`);
  const porVencer = await db<{ name: string; ends_on: unknown }>`
    select t.name, l.ends_on
    from torre.saas_subscription_lines l
    join torre.saas_subscriptions s on s.id = l.subscription_id
    join torre.saas_tenants t on t.id = s.tenant_id
    where l.status = 'active' and l.ends_on is not null and l.ends_on <= current_date + 7
  `;
  for (const row of porVencer) textos.push(`Contrato por vencer: ${row.name} (${dia(row.ends_on)}).`);
  const ads = await db<{ tenant: string; ends_on: unknown; status: string }>`
    select t.name as tenant, a.ends_on, a.status
    from torre.saas_ads a
    join torre.saas_tenants t on t.id = a.tenant_id
    where a.status in ('scheduled', 'active') and a.ends_on <= current_date + 3
  `;
  const hoy = new Date().toISOString().slice(0, 10);
  for (const row of ads) {
    textos.push(`Publicidad ${row.status === "active" && dia(row.ends_on) < hoy ? "vencida" : "por vencer"}: ${row.tenant} (${dia(row.ends_on)}).`);
  }
  return {
    pedidos: pedidos.map((row) => ({
      id: row.id,
      tenant: row.tenant,
      product: row.product,
      amount: num(row.amount),
      currency: row.currency,
      medio: row.medio ?? "",
      notes: row.notes,
      tieneComprobante: row.tiene_comprobante,
      at: row.created_at,
    })),
    alertas: textos.map((texto) => ({ id: idAviso(texto), texto })),
  };
}

export async function habilitarDesdeMovil(email: string, paymentId: string) {
  if (!paymentId.trim()) throw new TorreMovilError("Falta el pedido.");
  try {
    return await habilitarPedido(email, paymentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo habilitar.";
    throw new TorreMovilError(message, 400);
  }
}
