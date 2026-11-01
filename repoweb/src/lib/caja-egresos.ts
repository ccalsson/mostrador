import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { audit, assertRole } from "@/lib/server/context";
import { ensureStaffForUser } from "@/lib/server/bootstrap";

export const CATEGORIAS_EGRESO = [
  { id: "alquiler", label: "Alquiler" },
  { id: "combustible", label: "Combustible" },
  { id: "servicios", label: "Servicios" },
  { id: "proveedores", label: "Proveedores" },
  { id: "mercaderia", label: "Mercadería" },
  { id: "sueldos", label: "Sueldos" },
  { id: "otros", label: "Otros" },
] as const;

const IDS = new Set<string>(CATEGORIAS_EGRESO.map((item) => item.id));

export const egresosDelTurno = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const abierto = await sql<{ abierto_at: string }>`
      select abierto_at::text as abierto_at from cierres_caja
      where tenant_id = ${staff.tenantId} and cerrado_at is null
      order by abierto_at desc limit 1
    `;
    const desde = abierto[0]?.abierto_at ?? new Date(0).toISOString();
    const rows = await sql<{ id: string; categoria: string; concepto: string; monto: unknown; medio: string; created_at: string }>`
      select id, categoria, concepto, monto, medio, created_at::text as created_at
      from caja_egresos
      where tenant_id = ${staff.tenantId} and created_at >= ${desde}::timestamptz
      order by created_at desc
      limit 12
    `;
    const efectivo = rows.filter((row) => row.medio === "efectivo").reduce((suma, row) => suma + num(row.monto), 0);
    return {
      efectivo,
      items: rows.map((row) => ({
        id: row.id,
        categoria: row.categoria,
        concepto: row.concepto,
        monto: num(row.monto),
        medio: row.medio,
        createdAt: row.created_at,
      })),
    };
  });

export const cargarEgreso = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { categoria: string; concepto: string; monto: number; medio: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    if (!IDS.has(data.categoria)) throw new Error("Esa categoría no está.");
    const medio = data.medio === "transferencia" || data.medio === "otro" ? data.medio : "efectivo";
    const concepto = data.concepto.trim().slice(0, 120);
    const monto = Math.round(Number(data.monto) * 100) / 100;
    if (!concepto) throw new Error("Decí en qué se fue.");
    if (!(monto > 0) || monto > 99_999_999) throw new Error("El monto no sirve.");
    const sql = await getSql();
    await sql`
      insert into caja_egresos (id, tenant_id, categoria, concepto, monto, medio, usuario_id)
      values (${newId("egr")}, ${staff.tenantId}, ${data.categoria}, ${concepto}, ${monto}, ${medio}, ${staff.id})
    `;
    await audit(staff.tenantId, staff, "egreso", "caja", { categoria: data.categoria, concepto, monto, medio });
    return { ok: true };
  });
