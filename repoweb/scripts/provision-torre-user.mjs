#!/usr/bin/env node
/**
 * Alta del usuario operador de la Torre, durante el deploy.
 *
 * Corre después de `scripts/migrate.mjs` en `npm run build`, así que la cuenta
 * existe antes de que nadie intente entrar. Los valores los ponen las variables
 * de entorno del proyecto (`TORRE_USER_EMAIL`, `TORRE_USER_PASSWORD`, opcionales
 * `TORRE_USER_ROLE` y `TORRE_USER_NAME`): la clave nunca vive en un archivo
 * versionado ni en un comando.
 *
 * Idempotente y no destructivo: si el correo ya existe en `"user"` no toca su
 * clave, sólo asegura el permiso en `torre.saas_access`. Sin `DATABASE_URL`
 * (Preview local, que corre sobre PGLite) se salta.
 */
import crypto from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const email = process.env.TORRE_USER_EMAIL?.trim().toLowerCase();
const password = process.env.TORRE_USER_PASSWORD;
const role = process.env.TORRE_USER_ROLE?.trim() || "administracion";
const name = process.env.TORRE_USER_NAME?.trim() || "Operador de la Torre";
const databaseUrl = process.env.DATABASE_URL?.trim();
const ROLES = ["administracion", "comercial", "legal", "soporte", "auditoria"];

if (!email || !password || !databaseUrl) {
  console.log("[torre-user] sin TORRE_USER_EMAIL / TORRE_USER_PASSWORD / DATABASE_URL — nada que hacer.");
  process.exit(0);
}
if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error("[torre-user] TORRE_USER_EMAIL no parece un correo válido.");
  process.exit(1);
}
if (password.trim().length < 8) {
  console.error("[torre-user] TORRE_USER_PASSWORD necesita 8 caracteres o más.");
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`[torre-user] rol inválido "${role}". Usá uno de: ${ROLES.join(", ")}.`);
  process.exit(1);
}

function id() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const found = await client.query(`select id from "user" where lower(email) = $1`, [email]);
  const userId = found.rows[0]?.id;
  if (userId) {
    console.log(`[torre-user] ${email} ya existe — no se toca su clave.`);
  } else {
    const nueva = id();
    const now = new Date().toISOString();
    await client.query(
      `insert into "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
       values ($1, $2, $3, true, null, $4::timestamptz, $4::timestamptz)`,
      [nueva, name, email, now],
    );
    const hash = await hashPassword(password);
    await client.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $3, $4, $5::timestamptz, $5::timestamptz)`,
      [id(), email, nueva, hash, now],
    );
    // bcrypt es con sal, así que se compara contra el mismo hash recién insertado:
    // prueba que la credencial se guardó completa, sin exponerla.
    const stored = await client.query(
      `select count(*)::int as n from account where "userId" = $1 and password = $2`,
      [nueva, hash],
    );
    if (stored.rows[0].n !== 1) throw new Error("la credencial no quedó escrita como se esperaba");
    console.log(`[torre-user] creada la cuenta ${email}`);
  }

  await client.query(
    `insert into torre.saas_access (email, role) values ($1, $2) on conflict (email) do nothing`,
    [email, role],
  );
  await client.query("COMMIT");
} catch (err) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // conexión caída: se conserva el error original
  }
  throw err;
}

const acceso = await client.query(
  `select a.role,
          exists (select 1 from account ac where ac."userId" = u.id and ac."providerId" = 'credential') as clave
     from torre.saas_access a
     join "user" u on lower(u.email) = a.email
    where a.email = $1`,
  [email],
);
console.log(
  acceso.rows[0]
    ? `[torre-user] ${email} → rol ${acceso.rows[0].role}, credencial ${acceso.rows[0].clave ? "ok" : "falta"}`
    : `[torre-user] ${email} quedó sin fila en torre.saas_access`,
);

await client.release();
await pool.end();
