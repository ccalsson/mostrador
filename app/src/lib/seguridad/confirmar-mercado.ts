import { createHash, randomBytes } from "node:crypto";
import { correoConfirmacion, enviarPorResend } from "@/lib/correo/recuperacion";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import type { MercadoPerfil } from "@/lib/server/mercado";

async function enviar(email: string, enlace: string) {
  return enviarPorResend(correoConfirmacion(email, enlace, process.env.RESEND_FROM?.trim() || ""));
}

export async function pedirConfirmacionMercado(
  email: string,
  perfil: MercadoPerfil,
  origen: string,
) {
  const sql = await getSql();
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const id = newId("ver").replace("ver_", "");
  const now = new Date().toISOString();
  await sql`delete from verification where identifier = ${`mercado:${perfil}:${email}`}`;
  await sql`
    insert into verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
    values (${id}, ${`mercado:${perfil}:${email}`}, ${hash}, now() + interval '24 hours', ${now}::timestamptz, ${now}::timestamptz)
  `;
  const enlace = `${origen}/confirmar-mercado?token=${token}&perfil=${perfil}`;
  const enviado = await enviar(email, enlace);
  const mostrar = !enviado && process.env.VERCEL !== "1";
  return {
    aviso: enviado
      ? "Te mandamos un enlace para confirmar el correo. Hasta que lo abras, la cuenta no entra."
      : "La cuenta quedó creada, pero el correo no salió. Pedí otro enlace antes de entrar.",
    enlace: mostrar ? enlace : null,
  };
}

export async function reenviarSiPendienteMercado(
  email: string,
  perfil: MercadoPerfil,
  origen: string,
) {
  const sql = await getSql();
  const tabla = perfil === "comprador" ? "mercado_compradores" : "mercado_cargadores";
  const users = await sql.query<{ email_verified: boolean }>(
    `select email_verified from ${tabla} where lower(email) = $1 limit 1`,
    [email],
  );
  if (!users[0] || users[0].email_verified) return;
  await pedirConfirmacionMercado(email, perfil, origen);
}

export async function confirmarTokenMercado(token: string, perfil: MercadoPerfil) {
  const limpio = token.trim();
  if (limpio.length < 20) throw new Error("El enlace no sirve. Pedí otro.");
  const sql = await getSql();
  const hash = createHash("sha256").update(limpio).digest("hex");
  const rows = await sql<{ identifier: string }>`
    select identifier from verification
    where value = ${hash} and identifier like ${`mercado:${perfil}:%`} and "expiresAt" > now()
    limit 1
  `;
  const identifier = rows[0]?.identifier;
  if (!identifier) throw new Error("El enlace venció. Pedí otro.");
  const email = identifier.slice(`mercado:${perfil}:`.length);
  const tabla = perfil === "comprador" ? "mercado_compradores" : "mercado_cargadores";
  const result = await sql.query<{ id: string }>(
    `update ${tabla} set email_verified = true where lower(email) = $1 returning id`,
    [email],
  );
  if (!result[0]) throw new Error("El enlace venció. Pedí otro.");
  await sql`delete from verification where identifier = ${identifier}`;
  return { ok: true as const };
}
