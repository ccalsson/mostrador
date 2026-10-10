import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { hashPassword } from "better-auth/crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { appApi } from "@/lib/app-api.server";
import { TENANT_ID } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { createCredentialUser, ensureBootstrapped, ensureStaffForUser } from "@/lib/server/bootstrap";
import { audit, loadPedido, mapProducto } from "@/lib/server/context";
import { reservarLineas, soltarReserva } from "@/lib/server/stock";
import type { Cliente, FormaPago, Pedido, Producto } from "@/lib/types";
import { condicionOperativa } from "@/lib/torre/presencia";

type Ficha = {
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
  puedeCuentaCorriente: boolean;
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
    puedeCuentaCorriente: false,
  };
}

const FICHA_SQL = `
  select c.id, c.nombre, c.telefono, c.email, c.cuit, c.direccion,
         c.cuenta_corriente, c.condicion_iva, c.activo, c.user_id,
         coalesce((select sum(monto) from cuenta_movimientos m where m.cliente_id = c.id), 0) as saldo
`;

async function fichaPorUsuario(userId: string) {
  await ensureBootstrapped();
  const sql = await getSql();
  const rows = await sql.query<Parameters<typeof mapFicha>[0]>(
    `${FICHA_SQL} from clientes c where c.user_id = $1 limit 1`,
    [userId],
  );
  const ficha = rows[0] ? mapFicha(rows[0]) : null;
  if (!ficha || !ficha.activo) throw new Error("No hay una ficha de cliente activa para esta cuenta.");
  const tenant = await sql<{ tenant_id: string }>`select tenant_id from clientes where id = ${ficha.id} limit 1`;
  const condicion = await condicionOperativa(tenant[0]?.tenant_id ?? "");
  return { ...ficha, puedeCuentaCorriente: condicion.cuentaCorriente };
}

function enmascarar(email: string) {
  const [nombre, dominio] = email.split("@");
  if (!dominio) return "correo registrado";
  const visible = nombre.slice(0, 1);
  return `${visible}***@${dominio}`;
}

export const registrarCliente = createServerFn({ method: "POST" })
  .validator((input: {
    nombre: string;
    email: string;
    password: string;
    telefono: string;
    cuit: string;
    direccion: string;
  }) => input)
  .handler(async ({ data }) => {
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
  });

function origenPublico() {
  const fijo = process.env.BETTER_AUTH_URL?.trim();
  if (fijo) return fijo.replace(/\/$/, "");
  const request = getRequest();
  const host =
    request?.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request?.headers.get("host") || "";
  const proto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return host ? `${proto}://${host}` : "http://127.0.0.1:8080";
}

async function enviarEnlace(email: string, enlace: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const from = process.env.RESEND_FROM?.trim() || "Mostrador <onboarding@resend.dev>";
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Recuperar el acceso",
      text: `Para elegir una clave nueva abrí este enlace. Vence en 30 minutos.\n\n${enlace}\n\nSi no lo pediste, ignorá este mensaje.`,
    }),
  });
  return respuesta.ok;
}

export const pedirRecuperacion = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    await ensureBootstrapped();
    const email = data.email.trim().toLowerCase();
    const aviso = "Si ese correo tiene cuenta, le llega un enlace para elegir otra clave.";
    if (!email.includes("@")) throw new Error("Ingresá un correo.");
    const sql = await getSql();
    const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
    const user = users[0];
    if (!user) return { aviso, enlace: null as string | null };
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    const id = newId("ver").replace("ver_", "");
    const now = new Date().toISOString();
    await sql`delete from verification where identifier = ${`reset:${email}`}`;
    await sql`
      insert into verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
      values (${id}, ${`reset:${email}`}, ${hash}, now() + interval '30 minutes', ${now}::timestamptz, ${now}::timestamptz)
    `;
    const enlace = `${origenPublico()}/recuperar?token=${token}`;
    const enviado = await enviarEnlace(email, enlace);
    const mostrar = !enviado && process.env.VERCEL !== "1";
    return { aviso, enlace: mostrar ? enlace : null };
  });

export const confirmarRecuperacion = createServerFn({ method: "POST" })
  .validator((input: { token: string; password: string }) => input)
  .handler(async ({ data }) => {
    await ensureBootstrapped();
    const token = data.token.trim();
    if (token.length < 20) throw new Error("El enlace no sirve. Pedí otro.");
    if (data.password.length < 8) throw new Error("La clave necesita al menos 8 caracteres.");
    const sql = await getSql();
    const hash = createHash("sha256").update(token).digest("hex");
    const rows = await sql<{ identifier: string }>`
      select identifier from verification
      where value = ${hash} and identifier like 'reset:%' and "expiresAt" > now()
      limit 1
    `;
    const identifier = rows[0]?.identifier;
    if (!identifier) throw new Error("El enlace venció. Pedí otro.");
    const email = identifier.slice("reset:".length);
    const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
    const userId = users[0]?.id;
    if (!userId) throw new Error("El enlace venció. Pedí otro.");
    const clave = await hashPassword(data.password);
    const cuentas = await sql<{ id: string }>`
      select id from account where "userId" = ${userId} and "providerId" = 'credential' limit 1
    `;
    if (!cuentas[0]) throw new Error("Esta cuenta entra con Google, no con clave.");
    await sql`
      update account set password = ${clave}, "updatedAt" = now()
      where id = ${cuentas[0].id}
    `;
    await sql`delete from session where "userId" = ${userId}`;
    await sql`delete from verification where identifier = ${identifier}`;
    try {
      await sql`delete from mercado_sesiones where user_id = ${userId}`;
    } catch {
      /* el canal puede no estar migrado */
    }
    return { ok: true };
  });

export const recordarUsuario = createServerFn({ method: "POST" })
  .validator((input: { dato: string }) => input)
  .handler(async ({ data }) => {
    await ensureBootstrapped();
    const dato = data.dato.trim();
    if (!dato) throw new Error("Ingresá el CUIT o el teléfono.");
    const sql = await getSql();
    const rows = await sql<{ email: string | null }>`
      select email from clientes
      where tenant_id = ${TENANT_ID}
        and user_id is not null
        and (cuit = ${dato} or telefono = ${dato})
      limit 1
    `;
    const email = rows[0]?.email;
    if (!email) throw new Error("No encontramos una cuenta de cliente con ese dato.");
    return { email: enmascarar(email) };
  });

export const catalogoCliente = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await fichaPorUsuario(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      nombre: string;
      unidad: Producto["unidad"];
      unidad_label: string;
      precio: unknown;
      stock: unknown;
      stock_minimo: unknown;
      alias: unknown;
      activo: boolean;
      orden: unknown;
    }>`
      select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo, orden
      from productos
      where tenant_id = ${TENANT_ID} and activo = true
      order by orden nulls last, lower(nombre)
    `;
    return rows.map((r) => mapProducto(r));
  });

export const miFicha = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => fichaPorUsuario(context.userId));

export const guardarMiFicha = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; telefono: string; cuit: string; direccion: string }) => input)
  .handler(async ({ context, data }) => {
    const ficha = await fichaPorUsuario(context.userId);
    const nombre = data.nombre.trim();
    const telefono = data.telefono.trim();
    const cuit = data.cuit.trim();
    const direccion = data.direccion.trim();
    if (!nombre || !telefono || !cuit || !direccion) throw new Error("Completá los datos.");
    const sql = await getSql();
    await sql`
      update clientes
      set nombre = ${nombre}, telefono = ${telefono}, cuit = ${cuit}, direccion = ${direccion}
      where id = ${ficha.id}
    `;
    await sql`update "user" set name = ${nombre}, "updatedAt" = now() where id = ${context.userId}`;
    return fichaPorUsuario(context.userId);
  });

export const misMovimientos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ficha = await fichaPorUsuario(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      tipo: string;
      monto: unknown;
      nota: string | null;
      created_at: string;
    }>`
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
  });

export const misPedidos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ficha = await fichaPorUsuario(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from pedidos
      where tenant_id = ${TENANT_ID} and cliente_id = ${ficha.id}
      order by created_at desc
      limit 40
    `;
    const out: Pedido[] = [];
    for (const row of rows) {
      const pedido = await loadPedido(row.id, TENANT_ID);
      if (pedido) out.push(pedido);
    }
    return out;
  });

export const pedirComoCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    items: { productoId: string; cantidad: number }[];
    nota?: string;
    formaPago: FormaPago;
    comprobanteNombre?: string;
    comprobanteData?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const ficha = await fichaPorUsuario(context.userId);
    const items = data.items.filter((line) => line.cantidad > 0);
    if (items.length === 0) throw new Error("El pedido no tiene productos.");
    if (data.formaPago === "cuenta_corriente" && (!ficha.cuentaCorriente || !ficha.puedeCuentaCorriente)) {
      throw new Error(ficha.puedeCuentaCorriente ? "El puesto todavía no te habilitó la cuenta corriente." : "La cuenta corriente no está incluida en el plan.");
    }
    if (data.formaPago === "transferencia") {
      if (!data.comprobanteData) throw new Error("Subí el comprobante de la transferencia.");
      if (data.comprobanteData.length > 900_000) throw new Error("El comprobante es muy pesado. Bajalo de 700 KB.");
    }
    const sql = await getSql();
    const pedidoId = newId("ped");
    await sql`
      insert into pedidos (
        id, tenant_id, client_uuid, vendedor_id, cliente_id, cliente_nombre, estado, nota, forma_pago,
        comprobante_nombre, comprobante_data
      ) values (
        ${pedidoId}, ${TENANT_ID}, ${pedidoId}, ${null}, ${ficha.id}, ${ficha.nombre}, ${"enviado"},
        ${data.nota?.trim() || null}, ${data.formaPago},
        ${data.formaPago === "transferencia" ? data.comprobanteNombre ?? "comprobante" : null},
        ${data.formaPago === "transferencia" ? data.comprobanteData ?? null : null}
      )
    `;
    const productos = await sql<{
      id: string;
      nombre: string;
      unidad: Producto["unidad"];
      unidad_label: string;
      precio: unknown;
      stock: unknown;
      stock_minimo: unknown;
      alias: unknown;
      activo: boolean;
    }>`
      select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo
      from productos where tenant_id = ${TENANT_ID} and activo = true
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
      await reservarLineas(TENANT_ID, pedidoId, lineas);
    } catch (error) {
      await soltarReserva(TENANT_ID, pedidoId);
      await sql`delete from pedidos where id = ${pedidoId}`;
      throw error;
    }
    await sql`
      insert into alertas (id, tenant_id, tipo, mensaje, leida)
      values (
        ${newId("alr")}, ${TENANT_ID}, ${"pedido_cliente"},
        ${`${ficha.nombre} mandó un pedido.`}, ${false}
      )
    `;
    return loadPedido(pedidoId, TENANT_ID);
  });

export const verComprobante = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((pedidoId: string) => pedidoId)
  .handler(async ({ context, data: pedidoId }) => {
    await ensureBootstrapped();
    const sql = await getSql();
    const rows = await sql<{
      cliente_id: string | null;
      comprobante_nombre: string | null;
      comprobante_data: string | null;
    }>`
      select cliente_id, comprobante_nombre, comprobante_data
      from pedidos where id = ${pedidoId} and tenant_id = ${TENANT_ID} limit 1
    `;
    const row = rows[0];
    if (!row?.comprobante_data) throw new Error("Este pedido no tiene comprobante.");
    const ficha = await sql<{ id: string }>`
      select id from clientes where user_id = ${context.userId} limit 1
    `;
    if (ficha[0]) {
      if (ficha[0].id !== row.cliente_id) throw new Error("Ese comprobante no es tuyo.");
    } else {
      await ensureStaffForUser(context.userId);
    }
    return { nombre: row.comprobante_nombre, data: row.comprobante_data };
  });

export const listarClientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<Omit<Ficha, "puedeCuentaCorriente">[]>({
      token: context.token,
      method: "GET",
      path: ["clientes"],
    });
  });

export const guardarCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id: string;
    nombre: string;
    telefono: string;
    cuit: string;
    direccion: string;
    cuentaCorriente: boolean;
    condicionIva: string;
    activo: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    const { id, ...body } = data;
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["clientes", id], body });
  });

export const anotarPagoCuenta = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clienteId: string; monto: number; nota?: string }) => input)
  .handler(async ({ context, data }) => {
    const { clienteId, ...body } = data;
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["clientes", clienteId, "pagos"],
      body,
    });
  });

export const movimientosCliente = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((clienteId: string) => clienteId)
  .handler(async ({ context, data: clienteId }) => {
    return appApi<{
      saldo: number;
      movimientos: { id: string; tipo: string; monto: number; nota: string | null; createdAt: string }[];
    }>({ token: context.token, method: "GET", path: ["clientes", clienteId, "cuenta"] });
  });

export type Proveedor = {
  id: string;
  nombre: string;
  cuit: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  observaciones: string | null;
  activo: boolean;
};

export const listarProveedores = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin" && staff.rol !== "cajero") throw new Error("No tenés permiso para esta acción.");
    const sql = await getSql();
    const rows = await sql<Proveedor & { observaciones: string | null }>`
      select id, nombre, cuit, telefono, email, direccion, observaciones, activo
      from proveedores
      where tenant_id = ${staff.tenantId}
      order by activo desc, lower(nombre)
    `;
    return rows;
  });

export const guardarProveedor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id?: string;
    nombre: string;
    cuit?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    observaciones?: string;
    activo?: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin") throw new Error("No tenés permiso para esta acción.");
    const nombre = data.nombre.trim();
    if (!nombre) throw new Error("El proveedor necesita un nombre.");
    const sql = await getSql();
    if (data.id) {
      await sql`
        update proveedores
        set nombre = ${nombre},
            cuit = ${data.cuit?.trim() || null},
            telefono = ${data.telefono?.trim() || null},
            email = ${data.email?.trim() || null},
            direccion = ${data.direccion?.trim() || null},
            observaciones = ${data.observaciones?.trim() || null},
            activo = ${data.activo ?? true}
        where id = ${data.id} and tenant_id = ${staff.tenantId}
      `;
      await audit(staff.tenantId, staff, "editar_proveedor", "proveedor", { id: data.id });
      return { id: data.id };
    }
    const id = newId("prv");
    await sql`
      insert into proveedores (id, tenant_id, nombre, cuit, telefono, email, direccion, observaciones, activo)
      values (
        ${id}, ${staff.tenantId}, ${nombre}, ${data.cuit?.trim() || null}, ${data.telefono?.trim() || null},
        ${data.email?.trim() || null}, ${data.direccion?.trim() || null}, ${data.observaciones?.trim() || null}, ${true}
      )
    `;
    await audit(staff.tenantId, staff, "alta_proveedor", "proveedor", { id, nombre });
    return { id };
  });

export const productosDelProveedor = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((proveedorId: string) => proveedorId)
  .handler(async ({ context, data: proveedorId }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin") throw new Error("No tenés permiso para esta acción.");
    const sql = await getSql();
    const rows = await sql<{ nombre: string }>`
      select distinct p.nombre
      from remito_items ri
      join remitos r on r.id = ri.remito_id
      join productos p on p.id = ri.producto_id
      where r.tenant_id = ${staff.tenantId} and r.proveedor_id = ${proveedorId}
      order by p.nombre
      limit 40
    `;
    return rows.map((r) => r.nombre);
  });

export const asignarProveedorRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { remitoId: string; proveedorId: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin" && staff.rol !== "cajero") throw new Error("No tenés permiso para esta acción.");
    const sql = await getSql();
    const prov = await sql<{ nombre: string }>`
      select nombre from proveedores
      where id = ${data.proveedorId} and tenant_id = ${staff.tenantId} and activo = true
      limit 1
    `;
    if (!prov[0]) throw new Error("Elegí un proveedor activo.");
    await sql`
      update remitos
      set proveedor_id = ${data.proveedorId}, proveedor = ${prov[0].nombre}
      where id = ${data.remitoId} and tenant_id = ${staff.tenantId}
    `;
    return { ok: true };
  });

export type { Cliente };
