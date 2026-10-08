export const TORRE_ROLES = ["administracion", "comercial", "legal", "soporte", "auditoria"] as const;
export type TorreRol = (typeof TORRE_ROLES)[number];
export type TorreAccion = "comercial" | "legal" | "acceso" | "lectura" | "auditoria";

const PUEDE: Record<TorreRol, ReadonlySet<TorreAccion>> = {
  administracion: new Set(["comercial", "legal", "acceso", "lectura", "auditoria"]),
  comercial: new Set(["comercial", "lectura"]),
  legal: new Set(["legal", "lectura"]),
  soporte: new Set(["lectura"]),
  auditoria: new Set(["lectura", "auditoria"]),
};

export function rolPermite(rol: string, accion: TorreAccion) {
  if (!TORRE_ROLES.includes(rol as TorreRol)) return false;
  return PUEDE[rol as TorreRol].has(accion);
}

export async function exigirAccion(email: string, accion: TorreAccion) {
  const { getSql } = await import("../db.ts");
  const sql = await getSql();
  const rows = await sql<{ role: string }>`
    select role from torre.saas_access where lower(email) = ${email} limit 1
  `;
  const role = rows[0]?.role;
  if (!role) throw new Error("No tenés acceso a Torre.");
  if (!rolPermite(role, accion)) throw new Error("No tenés permiso para esta acción.");
  return role;
}
