import { createHash, randomBytes } from "node:crypto";
import { correoConfirmacion, enviarPorResend } from "@/lib/correo/recuperacion";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";

// El enlace sale con el origen del servidor que atiende el alta: en Vercel el
// proyecto manda BETTER_AUTH_URL, en local el host por el que se está entrando.
export function origenDe(request: Request) {
  const fijo = process.env.BETTER_AUTH_URL?.trim();
  if (fijo) return fijo.replace(/\/$/, "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return host ? `${proto}://${host}` : "http://127.0.0.1:8080";
}

async function enviar(email: string, enlace: string) {
  return enviarPorResend(correoConfirmacion(email, enlace, process.env.RESEND_FROM?.trim() || ""));
}

export async function pedirConfirmacion(email: string, origen: string) {
  const sql = await getSql();
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const id = newId("ver").replace("ver_", "");
  const now = new Date().toISOString();
  await sql`delete from verification where identifier = ${`mail:${email}`}`;
  await sql`
    insert into verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
    values (${id}, ${`mail:${email}`}, ${hash}, now() + interval '24 hours', ${now}::timestamptz, ${now}::timestamptz)
  `;
  const enlace = `${origen}/confirmar?token=${token}`;
  const enviado = await enviar(email, enlace);
  // Sólo fuera de producción se muestra el enlace: sin correo configurado es la
  // única forma de probar el alta, y en Vercel jamás tiene que aparecer.
  const mostrar = !enviado && process.env.VERCEL !== "1";
  return {
    aviso: enviado
      ? "Te mandamos un enlace para confirmar el correo. Hasta que lo abras, la cuenta no entra."
      : "La cuenta quedó creada, pero el correo no salió. Pedí otro enlace antes de entrar.",
    enlace: mostrar ? enlace : null,
  };
}

export async function reenviarSiPendiente(email: string, origen: string) {
  const sql = await getSql();
  const users = await sql<{ emailVerified: boolean }>`
    select "emailVerified" from "user" where lower(email) = ${email} limit 1
  `;
  if (!users[0] || users[0].emailVerified) return;
  await pedirConfirmacion(email, origen);
}

export async function confirmarToken(token: string) {
  const limpio = token.trim();
  if (limpio.length < 20) throw new Error("El enlace no sirve. Pedí otro.");
  const sql = await getSql();
  const hash = createHash("sha256").update(limpio).digest("hex");
  const rows = await sql<{ identifier: string }>`
    select identifier from verification
    where value = ${hash} and identifier like 'mail:%' and "expiresAt" > now()
    limit 1
  `;
  const identifier = rows[0]?.identifier;
  if (!identifier) throw new Error("El enlace venció. Pedí otro.");
  const email = identifier.slice("mail:".length);
  const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  if (!users[0]) throw new Error("El enlace venció. Pedí otro.");
  await sql`update "user" set "emailVerified" = true, "updatedAt" = now() where id = ${users[0].id}`;
  await sql`delete from verification where identifier = ${identifier}`;
  return { ok: true as const };
}
