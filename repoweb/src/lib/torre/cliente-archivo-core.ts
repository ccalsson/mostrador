import { getSql } from "../db.ts";
import { auditar } from "./audit.ts";
import { exigirAccion } from "./roles.ts";

export type HijosCliente = { negocios: number; suscripciones: number; pagos: number };
export type ArchivoClienteResultado = { ok: true; yaEstaba: boolean } & HijosCliente;

/**
 * Baja lógica (o alta) de un cliente SaaS de la Torre. No borra la fila:
 * `saas_clients` es referenciado sin `on delete cascade` por tenants,
 * suscripciones, pagos y claves de API, así que un DELETE real fallaría justo en
 * los clientes que ya compraron. Archivar lo saca de los contadores y de las
 * listas activas y deja el historial intacto.
 * Pedirlo dos veces seguidas no deja una segunda auditoría: la segunda responde
 * `yaEstaba` y no escribe nada.
 */
export async function archivarClienteCore(
  email: string,
  id: string,
  archivado: boolean,
): Promise<ArchivoClienteResultado> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();
  const fila = await sql<{ name: string; status: string }>`
    select name, status from torre.saas_clients where id = ${id}
  `;
  if (!fila[0]) throw new Error("Ese cliente no existe.");
  const hijos = await sql<HijosCliente>`
    select
      (select count(*)::int from torre.saas_tenants where client_id = ${id}) as negocios,
      (select count(*)::int from torre.saas_subscriptions where client_id = ${id}) as suscripciones,
      (select count(*)::int from torre.saas_payments where client_id = ${id}) as pagos
  `;
  if ((fila[0].status === "archived") === archivado) return { ok: true, yaEstaba: true, ...hijos[0] };
  await sql`
    update torre.saas_clients set status = ${archivado ? "archived" : "active"}, updated_at = now()
    where id = ${id}
  `;
  await auditar(email, archivado ? "archivar_cliente" : "restaurar_cliente", "cliente", id, {
    nombre: fila[0].name,
    ...hijos[0],
  });
  return { ok: true, yaEstaba: false, ...hijos[0] };
}
