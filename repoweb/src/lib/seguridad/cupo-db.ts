import { getSql } from "@/lib/db";
import { cupo } from "@/lib/seguridad/cupo";

/** Cupo que vale en todas las instancias. La memoria corta antes; la base es la que cuenta. */
export async function cupoFirme(clave: string, limite: number, ventanaMs: number) {
  const local = cupo(`mem:${clave}`, limite, ventanaMs);
  if (!local.ok) return local;
  try {
    const sql = await getSql();
    const secs = Math.max(1, Math.ceil(ventanaMs / 1000));
    const rows = await sql<{ n: number; falta: number }>`
      insert into seguridad_cupo (clave, n, vence)
      values (${clave}, 1, now() + (${secs} * interval '1 second'))
      on conflict (clave) do update set
        n = case when seguridad_cupo.vence <= now() then 1 else seguridad_cupo.n + 1 end,
        vence = case when seguridad_cupo.vence <= now() then excluded.vence else seguridad_cupo.vence end
      returning n, greatest(1, ceil(extract(epoch from (vence - now()))))::int as falta
    `;
    const row = rows[0];
    if (row && Number(row.n) > limite) return { ok: false as const, reintento: Number(row.falta) || secs };
    return { ok: true as const };
  } catch {
    return local;
  }
}
