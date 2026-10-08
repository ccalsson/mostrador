import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { assertRole, audit } from "@/lib/server/context";
import type { Rol, Staff } from "@/lib/types";
import { hashPassword } from "better-auth/crypto";

export async function listUsuariosForStaff(staff: Staff) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  return sql<{
    id: string;
    nombre: string;
    email: string;
    rol: Rol;
    activo: boolean;
    ultimo_login: string | null;
  }>`
    select id, nombre, email, rol, activo, ultimo_login::text as ultimo_login
    from staff
    where tenant_id = ${staff.tenantId}
    order by nombre
  `;
}

export async function createUsuarioForStaff(
  staff: Staff,
  input: { nombre: string; email: string; password: string; rol: Rol },
) {
  assertRole(staff, ["admin"]);
  const sql = await getSql();
  const email = input.email.trim().toLowerCase();
  const exists = await sql<{ id: string }>`select id from "user" where email = ${email} limit 1`;
  if (exists[0]) throw new Error("Ya existe un usuario con ese email.");
  const userId = newId("usr").replace("usr_", "");
  const now = new Date().toISOString();
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${input.nombre.trim()}, ${email}, ${true}, ${now}::timestamptz, ${now}::timestamptz)
  `;
  const hash = await hashPassword(input.password);
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${newId("acc").replace("acc_", "")}, ${email}, ${"credential"}, ${userId}, ${hash}, ${now}::timestamptz, ${now}::timestamptz)
  `;
  await sql`
    insert into staff (id, tenant_id, user_id, nombre, email, rol, activo)
    values (${newId("stf")}, ${staff.tenantId}, ${userId}, ${input.nombre.trim()}, ${email}, ${input.rol}, ${true})
  `;
  await audit(staff.tenantId, staff, "alta_usuario", "staff", { email, rol: input.rol });
  return { ok: true as const };
}

export async function toggleUsuarioForStaff(staff: Staff, input: { id: string; activo: boolean }) {
  assertRole(staff, ["admin"]);
  if (!input.activo && input.id === staff.id) {
    const err = new Error("No podés eliminarte a vos mismo.");
    Object.assign(err, { status: 409 });
    throw err;
  }
  const sql = await getSql();
  await sql`
    update staff set activo = ${input.activo}
    where id = ${input.id} and tenant_id = ${staff.tenantId}
  `;
  await audit(staff.tenantId, staff, "cambiar_usuario", "staff", input);
  return { ok: true as const };
}
