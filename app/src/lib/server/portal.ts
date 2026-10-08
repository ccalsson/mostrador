import { hashPassword } from "better-auth/crypto";
import { TENANT_ID } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { createCredentialUser, ensureBootstrapped, SinAccesoError } from "@/lib/server/bootstrap";
import { loadPedido, loadPedidos, mapProducto } from "@/lib/server/context";
import { reservarLineas, soltarReserva } from "@/lib/server/stock";
import type { FormaPago, Producto } from "@/lib/types";

export type Ficha = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  cuit: string | null;
  direccion: string | null;
  cuentaCorriente: boolean;
  condicionIva: string;
  activo: boolean;
  userId: string | null;
  saldo: number;
  tenantId: string;
};

function mapFicha(r: {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  cuit: string | null;
  direccion: string | null;
  cuenta_corriente: boolean;
  condicion_iva?: string | null;
  activo: boolean;
  user_id: string | null;
  tenant_id: string;
  saldo?: unknown;
}): Ficha {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    email: r.email,
    cuit: r.cuit,
    direccion: r.direccion,
    cuentaCorriente: r.cuenta_corriente,
    condicionIva: r.condicion_iva || "consumidor_final",
    activo: r.activo,
    userId: r.user_id,
    saldo: num(r.saldo),
    tenantId: r.tenant_id,
  };
}

const FICHA_SQL = `
  select c.id, c.nombre, c.telefono, c.email, c.cuit, c.direccion,
         c.cuenta_corriente, c.condicion_iva, c.activo, c.user_id, c.tenant_id,
         coalesce((select sum(monto) from cuenta_movimientos m where m.cliente_id = c.id), 0) as saldo
`;

export async function fichaActivaPorUsuario(userId: string): Promise<Ficha> {
  await ensureBootstrapped();
  const sql = await getSql();
  const rows = await sql.query<Parameters<typeof mapFicha>[0]>(
    `${FICHA_SQL} from clientes c where c.user_id = $1 limit 1`,
    [userId],
  );
  const ficha = rows[0] ? mapFicha(rows[0]) : null;
  if (!ficha || !ficha.activo) throw new SinAccesoError("No hay una ficha de cliente activa para esta cuenta.");
  return ficha;
}

function enmascarar(email: string) {
  const [nombre, dominio] = email.split("@");
  if (!dominio) return "correo registrado";
  const visible = nombre.slice(0, 1);
  return `${visible}***@${dominio}`;
}

export async function registrarClienteForPublic(data: {
  nombre: string;
  email: string;
  password: string;
  telefono: string;
  cuit: string;
  direccion: string;
}) {
  await ensureBootstrapped();
  const email = data.email.trim().toLowerCase();
  const nombre = data.nombre.trim();
  const cuit = data.cuit.trim();
  const direccion = data.direccion.trim();
  const telefono = data.telefono.trim();
  if (!nombre || !email || !cuit || !direccion || !telefono) throw new Error("Completá todos los datos.");
  if (data.password.length < 6) throw new Error("La contraseña necesita al menos 6 caracteres.");
  const sql = await getSql();
  const staff = await sql<{ id: string }>`
    select id from staff where lower(email) = ${email} limit 1
  `;
  if (staff[0]) throw new Error("Ese correo pertenece al puesto. Usá otro.");
  const userId = await createCredentialUser(email, data.password, nombre);
  const id = newId("cli");
  await sql`
    insert into clientes (id, tenant_id, nombre, telefono, email, cuit, direccion, cuenta_corriente, activo, user_id)
    values (
      ${id}, ${TENANT_ID}, ${nombre}, ${telefono}, ${email}, ${cuit}, ${direccion}, ${false}, ${true}, ${userId}
    )
  `;
  return { id };
}

export async function recordarUsuarioForPublic(dato: string) {
  await ensureBootstrapped();
  const valor = dato.trim();
  if (!valor) throw new Error("Ingresá el CUIT o el teléfono.");
  const sql = await getSql();
  const rows = await sql<{ email: string | null }>`
    select email from clientes
    where tenant_id = ${TENANT_ID}
      and user_id is not null
      and (cuit = ${valor} or telefono = ${valor})
    limit 1
  `;
  const email = rows[0]?.email;
  if (!email) throw new Error("No encontramos una cuenta de cliente con ese dato.");
  return { email: enmascarar(email) };
}

export async function recuperarClaveForPublic(data: { email: string; cuit: string; password: string }) {
  await ensureBootstrapped();
  const email = data.email.trim().toLowerCase();
  if (data.password.length < 6) throw new Error("La contraseña necesita al menos 6 caracteres.");
  const sql = await getSql();
  const staff = await sql<{ id: string }>`
    select id from staff where lower(email) = ${email} limit 1
  `;
  if (staff[0]) throw new Error("Esa cuenta la administra el puesto.");
  const rows = await sql<{ user_id: string | null; cuit: string | null }>`
    select user_id, cuit from clientes
    where tenant_id = ${TENANT_ID} and lower(email) = ${email}
    limit 1
  `;
  const ficha = rows[0];
  if (!ficha?.user_id || (ficha.cuit ?? "").trim() !== data.cuit.trim()) {
    throw new Error("No coincide el correo con el CUIT.");
  }
  const hash = await hashPassword(data.password);
  await sql`
    update account set password = ${hash}, "updatedAt" = now()
    where "userId" = ${ficha.user_id} and "providerId" = 'credential'
  `;
  return { ok: true };
}

type ProductoRow = Parameters<typeof mapProducto>[0];

export async function catalogoClienteForClient(ficha: Ficha): Promise<Producto[]> {
  const sql = await getSql();
  const rows = await sql<ProductoRow & { orden: unknown }>`
    select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, orden
    from productos
    where tenant_id = ${ficha.tenantId} and activo = true
    order by orden nulls last, lower(nombre)
  `;
  return rows.map((r) => mapProducto(r));
}

export async function miFichaForClient(ficha: Ficha): Promise<Ficha> {
  return ficha;
}

export async function guardarMiFichaForClient(
  userId: string,
  ficha: Ficha,
  data: { nombre: string; telefono: string; cuit: string; direccion: string },
) {
  const nombre = data.nombre.trim();
  const telefono = data.telefono.trim();
  const cuit = data.cuit.trim();
  const direccion = data.direccion.trim();
  if (!nombre || !telefono || !cuit || !direccion) throw new Error("Completá los datos.");
  const sql = await getSql();
  await sql`
    update clientes
    set nombre = ${nombre}, telefono = ${telefono}, cuit = ${cuit}, direccion = ${direccion}
    where id = ${ficha.id} and tenant_id = ${ficha.tenantId}
  `;
  await sql`update "user" set name = ${nombre}, "updatedAt" = now() where id = ${userId}`;
  return fichaActivaPorUsuario(userId);
}

export async function misMovimientosForClient(ficha: Ficha) {
  const sql = await getSql();
  const rows = await sql<{ id: string; tipo: string; monto: unknown; nota: string | null; created_at: string }>`
    select id, tipo, monto, nota, created_at::text as created_at
    from cuenta_movimientos
    where cliente_id = ${ficha.id}
    order by created_at desc
    limit 40
  `;
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    monto: num(r.monto),
    nota: r.nota,
    createdAt: r.created_at,
  }));
}

export async function misPedidosForClient(ficha: Ficha) {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from pedidos
    where tenant_id = ${ficha.tenantId} and cliente_id = ${ficha.id}
    order by created_at desc
    limit 40
  `;
  return loadPedidos(
    rows.map((row) => row.id),
    ficha.tenantId,
  );
}

export type PedirComoClienteInput = {
  items: { productoId: string; cantidad: number }[];
  nota?: string;
  formaPago: FormaPago;
  comprobanteNombre?: string;
  comprobanteData?: string;
};

export async function pedirComoClienteForClient(ficha: Ficha, input: PedirComoClienteInput) {
  const items = input.items.filter((line) => line.cantidad > 0);
  if (items.length === 0) throw new Error("El pedido no tiene productos.");
  if (input.formaPago === "cuenta_corriente" && !ficha.cuentaCorriente) {
    throw new Error("El puesto todavía no te habilitó la cuenta corriente.");
  }
  if (input.formaPago === "transferencia") {
    if (!input.comprobanteData) throw new Error("Subí el comprobante de la transferencia.");
    if (input.comprobanteData.length > 900_000) throw new Error("El comprobante es muy pesado. Bajalo de 700 KB.");
  }
  const tenantId = ficha.tenantId;
  const sql = await getSql();
  const pedidoId = newId("ped");
  await sql`
    insert into pedidos (
      id, tenant_id, client_uuid, vendedor_id, cliente_id, cliente_nombre, estado, nota, forma_pago,
      comprobante_nombre, comprobante_data
    ) values (
      ${pedidoId}, ${tenantId}, ${pedidoId}, ${null}, ${ficha.id}, ${ficha.nombre}, ${"enviado"},
      ${input.nota?.trim() || null}, ${input.formaPago},
      ${input.formaPago === "transferencia" ? input.comprobanteNombre ?? "comprobante" : null},
      ${input.formaPago === "transferencia" ? input.comprobanteData ?? null : null}
    )
  `;
  const productos = await sql<ProductoRow>`
    select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo
    from productos where tenant_id = ${tenantId} and activo = true
  `;
  const byId = new Map(productos.map((p) => [p.id, mapProducto(p)]));
  const lineas: { productoId: string; cantidad: number }[] = [];
  for (const line of items) {
    const prod = byId.get(line.productoId);
    if (!prod) throw new Error("Hay un producto que ya no está.");
    lineas.push({ productoId: prod.id, cantidad: line.cantidad });
    await sql`
      insert into pedido_items (
        id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
      ) values (
        ${newId("itm")}, ${pedidoId}, ${prod.id}, ${prod.nombre}, ${line.cantidad},
        ${prod.precio}, ${prod.unidad}, ${prod.unidadLabel}
      )
    `;
  }
  try {
    await reservarLineas(tenantId, pedidoId, lineas);
  } catch (error) {
    await soltarReserva(tenantId, pedidoId);
    await sql`delete from pedidos where id = ${pedidoId}`;
    throw error;
  }
  await sql`
    insert into alertas (id, tenant_id, tipo, mensaje, leida)
    values (
      ${newId("alr")}, ${tenantId}, ${"pedido_cliente"},
      ${`${ficha.nombre} mandó un pedido.`}, ${false}
    )
  `;
  return loadPedido(pedidoId, tenantId);
}

export async function verComprobanteForClient(ficha: Ficha, pedidoId: string) {
  const sql = await getSql();
  const rows = await sql<{
    cliente_id: string | null;
    comprobante_nombre: string | null;
    comprobante_data: string | null;
  }>`
    select cliente_id, comprobante_nombre, comprobante_data
    from pedidos where id = ${pedidoId} and tenant_id = ${ficha.tenantId} limit 1
  `;
  const row = rows[0];
  if (!row?.comprobante_data) throw new Error("Este pedido no tiene comprobante.");
  if (row.cliente_id !== ficha.id) throw new Error("Ese comprobante no es tuyo.");
  return { nombre: row.comprobante_nombre, data: row.comprobante_data };
}
