import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { exigirAccion } from "@/lib/torre/roles";
import { consolidarUsuarios, filtrarUsuarios, type UsuarioUnificado, type FiltroUsuarios } from "./usuarios-core";

export type { UsuarioUnificado, FiltroUsuarios, AppAccess } from "./usuarios-core";

export async function usuariosCentralizadosCore(
  email: string,
  filtro: FiltroUsuarios,
): Promise<UsuarioUnificado[]> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  // Users base
  const usersRows = await sql<{
    id: string;
    name: string;
    email: string;
    created_at: string;
  }>`
    select u.id, u.name, u.email, u."createdAt"::text as created_at
    from "user" u
    order by u.name
  `;

  // Staff with tenant info
  const staffRows = await sql<{
    user_id: string;
    rol: string;
    activo: boolean;
    ultimo_login: string | null;
    tenant_nombre: string;
  }>`
    select s.user_id, s.rol, s.activo, s.ultimo_login::text as ultimo_login,
           coalesce(suc.nombre, t.nombre) as tenant_nombre
    from staff s
    join tenants t on t.id = s.tenant_id
    left join sucursales suc on suc.id = s.sucursal_actual_id
  `;

  // Mercado buyers
  const compradoresRows = await sql<{
    user_id: string;
    nombre: string;
    email: string;
    telefono: string | null;
  }>`
    select user_id, nombre, email, telefono from mercado_compradores
  `;

  // Mercado carriers
  const cargadoresRows = await sql<{
    user_id: string;
    nombre: string;
    email: string;
    telefono: string | null;
    activo: boolean;
  }>`
    select user_id, nombre, email, telefono, activo from mercado_cargadores
  `;

  // Torre access
  const torreAccessRows = await sql<{
    email: string;
    role: string;
  }>`
    select email, role from torre.saas_access
  `;

  const users = usersRows.map((r) => ({
    id: r.id,
    nombre: r.name,
    email: r.email,
    telefono: null as string | null,
    createdAt: r.created_at,
  }));

  const staff = staffRows.map((r) => ({
    userId: r.user_id,
    rol: r.rol,
    tenantNombre: r.tenant_nombre,
    activo: r.activo,
    ultimoLogin: r.ultimo_login,
  }));

  const compradores = compradoresRows.map((r) => ({
    userId: r.user_id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
  }));

  const cargadores = cargadoresRows.map((r) => ({
    userId: r.user_id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
    activo: r.activo,
  }));

  const torreAccess = torreAccessRows.map((r) => ({
    email: r.email,
    role: r.role,
  }));

  const consolidados = consolidarUsuarios(users, staff, compradores, cargadores, torreAccess);
  return filtrarUsuarios(consolidados, filtro);
}

export const usuariosCentralizados = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: FiltroUsuarios | undefined) => input ?? {})
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return usuariosCentralizadosCore(email, data);
  });
