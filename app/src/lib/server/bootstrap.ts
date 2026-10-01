import { hashPassword } from "better-auth/crypto";
import {
  CATALOG,
  DEMO_USERS,
  SEED_CLIENTES,
  TENANT_ID,
  TENANT_NOMBRE,
  TENANT_PIE,
} from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { newId, slugId } from "@/lib/ids";
import { num } from "@/lib/money";
import type { Rol, Staff } from "@/lib/types";
import { loadStaffByUserId } from "./context";

const g = globalThis as typeof globalThis & {
  __mostradorBoot__?: Promise<void>;
};

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

  const prodCount = await sql<{ n: number }>`select count(*)::int as n from productos where tenant_id = ${TENANT_ID}`;
  if (num(prodCount[0]?.n) === 0) {
    for (const item of CATALOG) {
      const id = slugId("p", item.nombre);
      await sql.query(
        `insert into productos (
           id, tenant_id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, true)`,
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

  await seedHistory();
}

async function seedHistory() {
  const sql = await getSql();
  const existing = await sql<{ n: number }>`select count(*)::int as n from cobros where tenant_id = ${TENANT_ID}`;
  if (num(existing[0]?.n) > 0) return;

  const cajero = await sql<{ id: string }>`
    select id from staff where tenant_id = ${TENANT_ID} and rol = 'cajero' limit 1
  `;
  const vendedor = await sql<{ id: string }>`
    select id from staff where tenant_id = ${TENANT_ID} and rol = 'vendedor' limit 1
  `;
  const cliente = await sql<{ id: string; nombre: string }>`
    select id, nombre from clientes where tenant_id = ${TENANT_ID} and nombre <> 'Mostrador' limit 1
  `;
  const productos = await sql<{
    id: string;
    nombre: string;
    precio: unknown;
    unidad: string;
    unidad_label: string;
  }>`select id, nombre, precio, unidad, unidad_label from productos where tenant_id = ${TENANT_ID} order by nombre`;
  if (!cajero[0] || productos.length === 0) return;

  const cajeroId = cajero[0].id;
  const vendedorId = vendedor[0]?.id ?? cajeroId;

  for (let day = 6; day >= 0; day -= 1) {
    const orders = day === 0 ? 3 : 4 + (day % 3);
    for (let i = 0; i < orders; i += 1) {
      const when = new Date();
      when.setDate(when.getDate() - day);
      when.setHours(7 + i * 2, 10 + i * 7, 0, 0);
      const iso = when.toISOString();
      const pedidoId = newId("ped");
      const cobroId = newId("cob");
      const clientUuid = crypto.randomUUID();
      await sql`
        insert into pedidos (
          id, tenant_id, client_uuid, vendedor_id, cliente_id, cliente_nombre, estado, created_at, updated_at
        ) values (
          ${pedidoId}, ${TENANT_ID}, ${clientUuid}, ${vendedorId},
          ${cliente[0]?.id ?? null}, ${cliente[0]?.nombre ?? "Mostrador"},
          ${"cobrado"}, ${iso}::timestamptz, ${iso}::timestamptz
        )
      `;
      let total = 0;
      const picks = [productos[(day * 5 + i * 3) % productos.length], productos[(day * 5 + i * 3 + 7) % productos.length]];
      for (const prod of picks) {
        const qty = 1 + ((i + day) % 3);
        const precio = num(prod.precio);
        total += qty * precio;
        await sql`
          insert into pedido_items (
            id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
          ) values (
            ${newId("itm")}, ${pedidoId}, ${prod.id}, ${prod.nombre}, ${qty}, ${precio}, ${prod.unidad}, ${prod.unidad_label}
          )
        `;
      }
      const formas = ["efectivo", "transferencia", "tarjeta", "efectivo"] as const;
      const forma = formas[(day + i) % formas.length];
      await sql`
        insert into cobros (
          id, tenant_id, pedido_id, client_uuid, forma_pago, monto, monto_recibido, vuelto, usuario_id, created_at
        ) values (
          ${cobroId}, ${TENANT_ID}, ${pedidoId}, ${clientUuid}, ${forma}, ${total},
          ${forma === "efectivo" ? total + 2000 : total},
          ${forma === "efectivo" ? 2000 : 0},
          ${cajeroId}, ${iso}::timestamptz
        )
      `;
      const seq = await sql<{ ultimo: number }>`
        update ticket_seq set ultimo = ultimo + 1 where tenant_id = ${TENANT_ID} returning ultimo
      `;
      const contenido = {
        puesto: TENANT_NOMBRE,
        numero: seq[0]?.ultimo ?? 1000,
        fecha: iso,
        items: picks.map((p) => ({
          nombre: p.nombre,
          cantidad: 1 + ((i + day) % 3),
          unidad: p.unidad_label,
          precio: num(p.precio),
        })),
        total,
        formaPago: forma,
        pie: TENANT_PIE,
      };
      await sql.query(
        `insert into tickets (id, cobro_id, tenant_id, numero, contenido, created_at)
         values ($1,$2,$3,$4,$5::jsonb,$6::timestamptz)`,
        [newId("tck"), cobroId, TENANT_ID, contenido.numero, JSON.stringify(contenido), iso],
      );
    }
  }

  const waiting = [
    ["Banana Ecuador", "Tomate perita", "Limón"],
    ["Papa blanca", "Cebolla", "Lechuga criolla"],
  ];
  for (const names of waiting) {
    const pedidoId = newId("ped");
    await sql`
      insert into pedidos (
        id, tenant_id, client_uuid, vendedor_id, cliente_nombre, estado
      ) values (
        ${pedidoId}, ${TENANT_ID}, ${crypto.randomUUID()}, ${vendedorId}, ${"Verdulería San Telmo"}, ${"enviado"}
      )
    `;
    for (const name of names) {
      const prod = productos.find((p) => p.nombre === name);
      if (!prod) continue;
      await sql`
        insert into pedido_items (
          id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
        ) values (
          ${newId("itm")}, ${pedidoId}, ${prod.id}, ${prod.nombre}, ${2}, ${num(prod.precio)}, ${prod.unidad}, ${prod.unidad_label}
        )
      `;
    }
  }

  await sql`
    insert into alertas (id, tenant_id, tipo, mensaje, leida)
    values
      (${newId("alr")}, ${TENANT_ID}, ${"stock_bajo"}, ${"Kiwi: stock bajo (3 cajones, mínimo 6)."}, ${false}),
      (${newId("alr")}, ${TENANT_ID}, ${"stock_bajo"}, ${"Palta Hass: stock bajo (4 cajones, mínimo 6)."}, ${false})
  `;

  await sql`
    insert into cierres_caja (id, tenant_id, usuario_id, abierto_at)
    values (${newId("cje")}, ${TENANT_ID}, ${cajeroId}, now())
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
  if (cliente[0]) throw new Error("Esta cuenta es de un cliente.");
  const existing = await loadStaffByUserId(userId);
  if (existing) {
    const sql = await getSql();
    await sql`update staff set ultimo_login = now() where id = ${existing.id}`;
    return existing;
  }
  const users = await sql<{ email: string; name: string }>`
    select email, name from "user" where id = ${userId} limit 1
  `;
  const email = users[0]?.email ?? "";
  const demo = DEMO_USERS.find((u) => u.email === email);
  const rol: Rol = demo?.rol ?? "admin";
  const nombre = demo?.nombre ?? users[0]?.name ?? "Dueño";
  const id = newId("stf");
  await sql`
    insert into staff (id, tenant_id, user_id, nombre, email, rol, activo, ultimo_login)
    values (${id}, ${TENANT_ID}, ${userId}, ${nombre}, ${email || `${userId}@frutasroman.local`}, ${rol}, ${true}, now())
  `;
  const staff = await loadStaffByUserId(userId);
  if (!staff) throw new Error("No se pudo dar de alta el usuario.");
  return staff;
}

export async function seedDemoAccounts() {
  await ensureBootstrapped();
  return DEMO_USERS.map((u) => ({
    email: u.email,
    password: u.password,
    nombre: u.nombre,
    rol: u.rol,
  }));
}
