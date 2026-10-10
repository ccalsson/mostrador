import { hashPassword } from "better-auth/crypto";
import {
  CATALOG,
  DEMO_PASSWORD,
  DEMO_USERS,
  SEED_CLIENTES,
  TENANT_ID,
  TENANT_NOMBRE,
  TENANT_PIE,
} from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { newId, slugId } from "@/lib/ids";
import { num } from "@/lib/money";
import type { Staff } from "@/lib/types";
import { loadStaffByUserId } from "./context";

const g = globalThis as typeof globalThis & {
  __mostradorBoot__?: Promise<void>;
};

/** Cuenta autenticada sin acceso al mostrador (cliente, dada de baja o sin alta). */
export class SinAccesoError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "SinAccesoError";
  }
}

/** El seed/demo sólo corre en DEV con SEED_DEMO=true. */
function seedDemoEnabled(): boolean {
  return (process.env.SEED_DEMO ?? "").trim().toLowerCase() === "true";
}

async function seedAuthUser(email: string, password: string, name: string) {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`select id from "user" where email = ${email} limit 1`;
  if (existing[0]) return existing[0].id;
  return insertCredentialUser(email, password, name);
}

export async function createCredentialUser(email: string, password: string, name: string) {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`select id from "user" where lower(email) = lower(${email}) limit 1`;
  if (existing[0]) throw new Error("Ese correo ya está usado.");
  return insertCredentialUser(email, password, name);
}

async function insertCredentialUser(email: string, password: string, name: string) {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`select id from "user" where email = ${email} limit 1`;
  if (existing[0]) return existing[0].id;
  const id = newId("usr").replace("usr_", "");
  const now = new Date().toISOString();
  await sql`
    insert into "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
    values (${id}, ${name}, ${email}, ${true}, ${null}, ${now}::timestamptz, ${now}::timestamptz)
  `;
  const hash = await hashPassword(password);
  const accId = newId("acc").replace("acc_", "");
  await sql`
    insert into account (
      id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
    ) values (
      ${accId}, ${email}, ${"credential"}, ${id}, ${hash}, ${now}::timestamptz, ${now}::timestamptz
    )
  `;
  return id;
}

async function seedCore() {
  const sql = await getSql();
  await sql.query(
    `insert into tenants (id, nombre, config)
     values ($1,$2,$3::jsonb)
     on conflict (id) do nothing`,
    [TENANT_ID, TENANT_NOMBRE, JSON.stringify({ pieTicket: TENANT_PIE })],
  );
  await sql`
    insert into ticket_seq (tenant_id, ultimo)
    values (${TENANT_ID}, ${1040})
    on conflict (tenant_id) do nothing
  `;

  if (!seedDemoEnabled()) return;

  await asegurarCatalogo(sql);

  const cliCount = await sql<{ n: number }>`select count(*)::int as n from clientes where tenant_id = ${TENANT_ID}`;
  if (num(cliCount[0]?.n) === 0) {
    for (const c of SEED_CLIENTES) {
      await sql`
        insert into clientes (id, tenant_id, nombre, telefono, cuenta_corriente)
        values (${newId("cli")}, ${TENANT_ID}, ${c.nombre}, ${c.telefono}, ${c.cuentaCorriente})
      `;
    }
  }

  for (const u of DEMO_USERS) {
    const userId = await seedAuthUser(u.email, u.password, u.nombre);
    const staff = await sql<{ id: string }>`select id from staff where user_id = ${userId} limit 1`;
    if (!staff[0]) {
      await sql`
        insert into staff (id, tenant_id, user_id, nombre, email, rol, activo)
        values (${newId("stf")}, ${TENANT_ID}, ${userId}, ${u.nombre}, ${u.email}, ${u.rol}, ${true})
      `;
    }
  }

  await limpiarOperacionesDePrueba();
  await provisionTorreOwner();
  await asegurarCuentaDePrueba();
  if (process.env.VERCEL !== "1") await asegurarPuestoPrueba(sql);
}

async function asegurarPuestoPrueba(sql: Awaited<ReturnType<typeof getSql>>) {
  const id = "puesto-prueba";
  await sql.query(
    `insert into tenants (id, nombre, config)
     values ($1, $2, $3::jsonb)
     on conflict (id) do nothing`,
    [id, "Puesto de prueba", JSON.stringify({ mercadoAlToque: true })],
  );
  await sql`
    insert into ticket_seq (tenant_id, ultimo)
    values (${id}, ${1000})
    on conflict (tenant_id) do nothing
  `;
  await sql.query(
    `insert into productos (
       id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, publicado_online
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, true, true)
     on conflict (id) do nothing`,
    ["p_prueba_tomate", id, "Tomate de prueba", "bulto", "cajón", 1500, 40, 4, "[]"],
  );
  const userId = await seedAuthUser("puesto-prueba@example.com", DEMO_PASSWORD, "Dueño de prueba");
  const staff = await sql<{ id: string }>`select id from staff where user_id = ${userId} limit 1`;
  if (!staff[0]) {
    await sql`
      insert into staff (id, tenant_id, user_id, nombre, email, rol, activo)
      values (${newId("stf")}, ${id}, ${userId}, ${"Dueño de prueba"}, ${"puesto-prueba@example.com"}, ${"admin"}, ${true})
    `;
  }
}

export const PRUEBA_EMAIL = "calssonclaudio@gmail.com";
const PRUEBA_PASSWORD = "12345678";

async function leerConfigTenant(sql: Awaited<ReturnType<typeof getSql>>) {
  const rows = await sql<{ config: unknown }>`select config from tenants where id = ${TENANT_ID}`;
  const raw = rows[0]?.config;
  if (typeof raw === "string") return JSON.parse(raw) as Record<string, unknown>;
  return (raw ?? {}) as Record<string, unknown>;
}

async function asegurarCatalogo(sql: Awaited<ReturnType<typeof getSql>>) {
  const config = await leerConfigTenant(sql);
  const ya = config.catalog20261006 === true;
  for (const item of CATALOG) {
    const id = slugId("p", item.nombre);
    if (ya) {
      await sql.query(
        `insert into productos (
           id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, publicado_online
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, true, true)
         on conflict (id) do nothing`,
        [
          id,
          TENANT_ID,
          item.nombre,
          item.unidad,
          item.unidadLabel,
          item.precio,
          item.stock,
          item.stockMinimo,
          JSON.stringify(item.alias),
        ],
      );
    } else {
      await sql.query(
        `insert into productos (
           id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, publicado_online
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, true, true)
         on conflict (id) do update set
           precio = excluded.precio,
           unidad = excluded.unidad,
           unidad_label = excluded.unidad_label,
           alias = excluded.alias,
           publicado_online = true,
           activo = true`,
        [
          id,
          TENANT_ID,
          item.nombre,
          item.unidad,
          item.unidadLabel,
          item.precio,
          item.stock,
          item.stockMinimo,
          JSON.stringify(item.alias),
        ],
      );
    }
  }
  await sql.query(
    `update tenants
     set config = coalesce(config, '{}'::jsonb) || '{"mercadoAlToque": true, "catalog20261006": true}'::jsonb
     where id = $1`,
    [TENANT_ID],
  );
}

async function asegurarCuentaDePrueba() {
  const sql = await getSql();
  const email = PRUEBA_EMAIL;
  const config = await leerConfigTenant(sql);
  const claveLista = config.clave12345678 === true;
  const existing = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  let userId = existing[0]?.id;
  if (!userId) {
    userId = await insertCredentialUser(email, PRUEBA_PASSWORD, "Claudio Calsson");
  } else if (!claveLista) {
    const hash = await hashPassword(PRUEBA_PASSWORD);
    const account = await sql<{ id: string }>`
      select id from account where "userId" = ${userId} and "providerId" = ${"credential"} limit 1
    `;
    if (account[0]) {
      await sql`update account set password = ${hash}, "updatedAt" = now() where id = ${account[0].id}`;
    } else {
      const accId = newId("acc").replace("acc_", "");
      const now = new Date().toISOString();
      await sql`
        insert into account (
          id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
        ) values (
          ${accId}, ${email}, ${"credential"}, ${userId}, ${hash}, ${now}::timestamptz, ${now}::timestamptz
        )
      `;
    }
    await sql`delete from session where "userId" = ${userId}`;
    try {
      await sql`delete from mercado_sesiones where user_id = ${userId}`;
    } catch {
      /* el canal todavía no está migrado */
    }
  }
  const staff = await sql<{ id: string }>`select id from staff where user_id = ${userId} limit 1`;
  if (!staff[0]) {
    await sql`
      insert into staff (id, tenant_id, user_id, nombre, email, rol, activo)
      values (${newId("stf")}, ${TENANT_ID}, ${userId}, ${"Claudio Calsson"}, ${email}, ${"admin"}, ${true})
    `;
  }
  try {
    const comprador = await sql<{ id: string }>`select id from mercado_compradores where user_id = ${userId} limit 1`;
    if (!comprador[0]) {
      await sql`
        insert into mercado_compradores (id, user_id, nombre, identidad_estado)
        values (${newId("mc")}, ${userId}, ${"Claudio Calsson"}, ${"documentacion_cargada"})
      `;
    } else {
      await sql`
        update mercado_compradores
        set identidad_estado = ${"documentacion_cargada"}
        where user_id = ${userId}
      `;
    }
    const cargador = await sql<{ id: string }>`select id from mercado_cargadores where user_id = ${userId} limit 1`;
    if (!cargador[0]) {
      await sql`
        insert into mercado_cargadores (id, user_id, nombre, disponibilidad)
        values (${newId("cg")}, ${userId}, ${"Claudio"}, ${"disponible"})
      `;
    }
  } catch {
    /* el canal todavía no está migrado */
  }
  if (!claveLista) {
    await sql.query(
      `update tenants
       set config = coalesce(config, '{}'::jsonb) || '{"cuentaPruebaLista": true, "clave12345678": true}'::jsonb
       where id = $1`,
      [TENANT_ID],
    );
  }
}

async function provisionTorreOwner() {
  const password = process.env.TORRE_INITIAL_PASSWORD?.trim();
  if (!password || password.length < 8) return;
  const email = "calssonclaudio@gmail.com";
  try {
    const sql = await getSql();
    const allowed = await sql<{ email: string }>`
      select email from torre.saas_access where lower(email) = ${email} limit 1
    `;
    if (!allowed[0]) return;
    const existing = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
    if (!existing[0]) {
      await createCredentialUser(email, password, "Claudio Calsson");
      return;
    }
    const hash = await hashPassword(password);
    const account = await sql<{ id: string }>`
      select id from account
      where "userId" = ${existing[0].id} and "providerId" = ${"credential"}
      limit 1
    `;
    if (account[0]) {
      await sql`update account set password = ${hash}, "updatedAt" = now() where id = ${account[0].id}`;
      return;
    }
    const accId = newId("acc").replace("acc_", "");
    const now = new Date().toISOString();
    await sql`
      insert into account (
        id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
      ) values (
        ${accId}, ${email}, ${"credential"}, ${existing[0].id}, ${hash}, ${now}::timestamptz, ${now}::timestamptz
      )
    `;
  } catch {
    /* la Torre todavía no está migrada; el puesto sigue */
  }
}

async function limpiarOperacionesDePrueba() {
  const sql = await getSql();
  const rows = await sql<{ config: unknown }>`select config from tenants where id = ${TENANT_ID}`;
  const raw = rows[0]?.config;
  const config =
    typeof raw === "string"
      ? (JSON.parse(raw) as { operacionesPruebaBorradas?: boolean })
      : ((raw ?? {}) as { operacionesPruebaBorradas?: boolean });
  if (config.operacionesPruebaBorradas) return;

  await sql`delete from tickets where tenant_id = ${TENANT_ID}`;
  await sql`delete from cobros where tenant_id = ${TENANT_ID}`;
  await sql`delete from pedidos where tenant_id = ${TENANT_ID}`;
  await sql`delete from alertas where tenant_id = ${TENANT_ID}`;
  await sql`delete from cierres_caja where tenant_id = ${TENANT_ID}`;
  await sql`delete from cuenta_movimientos where tenant_id = ${TENANT_ID}`;
  await sql`delete from auditoria where tenant_id = ${TENANT_ID}`;
  await sql`update ticket_seq set ultimo = 0 where tenant_id = ${TENANT_ID}`;
  await sql`
    update tenants
    set config = coalesce(config, '{}'::jsonb) || '{"operacionesPruebaBorradas": true}'::jsonb
    where id = ${TENANT_ID}
  `;
}

export async function ensureBootstrapped() {
  g.__mostradorBoot__ ??= seedCore();
  try {
    await g.__mostradorBoot__;
  } catch (err) {
    g.__mostradorBoot__ = undefined;
    throw err;
  }
}

export async function ensureStaffForUser(userId: string): Promise<Staff> {
  await ensureBootstrapped();
  const sql = await getSql();
  const cliente = await sql<{ id: string }>`
    select id from clientes where user_id = ${userId} limit 1
  `;
  if (cliente[0]) throw new SinAccesoError("Esta cuenta es de un cliente.");
  const existing = await loadStaffByUserId(userId);
  if (existing) {
    await sql`update staff set ultimo_login = now() where id = ${existing.id}`;
    return existing;
  }
  const baja = await sql<{ activo: boolean }>`
    select activo from staff where user_id = ${userId} limit 1
  `;
  if (baja[0]) {
    throw new SinAccesoError("Tu cuenta está dada de baja. Pedile al dueño que te reactive.");
  }
  const users = await sql<{ email: string }>`
    select email from "user" where id = ${userId} limit 1
  `;
  const emailKey = (users[0]?.email ?? "").trim().toLowerCase();
  if (emailKey) {
    try {
      const mercado = await sql<{ id: string }>`
        select id from mercado_compradores where user_id = ${userId}
        union all
        select id from mercado_cargadores where user_id = ${userId}
        limit 1
      `;
      if (mercado[0]) throw new SinAccesoError("Esta cuenta es de Mercado al Toque.");
    } catch (err) {
      if (err instanceof SinAccesoError) throw err;
      const code = (err as { code?: string }).code;
      if (code !== "42P01" && code !== "3F000") throw err;
    }
    try {
      const acceso = await sql<{ email: string }>`
        select email from torre.saas_access where lower(email) = ${emailKey} limit 1
      `;
      if (acceso[0]) throw new SinAccesoError("Esta cuenta no es del puesto.");
    } catch (err) {
      if (err instanceof SinAccesoError) throw err;
      const code = (err as { code?: string }).code;
      if (code !== "42P01" && code !== "3F000") throw err;
    }
  }
  throw new SinAccesoError(
    "Tu cuenta no tiene acceso al mostrador. Pedile al dueño que te dé de alta en Usuarios.",
  );
}

export async function seedDemoAccounts() {
  await ensureBootstrapped();
  if (!seedDemoEnabled()) return [];
  return DEMO_USERS.map((u) => ({
    email: u.email,
    password: u.password,
    nombre: u.nombre,
    rol: u.rol,
  }));
}
