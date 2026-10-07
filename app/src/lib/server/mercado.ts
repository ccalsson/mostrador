import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import type { Sql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { reservarLineas } from "@/lib/server/stock";

export type MercadoPerfil = "comprador" | "cargador";
export type MercadoActor = {
  perfil: MercadoPerfil;
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  estadoIdentidad?: string;
};

export class MercadoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MercadoError";
  }
}

type PedidoMercadoRow = {
  id: string;
  tenant_id: string;
  tenant_nombre: string;
  estado: string;
  nota: string | null;
  forma_pago: string | null;
  pago_estado: string;
  created_at: string;
  confirmed_at: string | null;
  preparation_started_at: string | null;
  prepared_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  total: unknown;
  bultos: unknown;
};

function fail(status: number, code: string, message: string): never {
  throw new MercadoError(status, code, message);
}

function assertPerfil(actor: MercadoActor, perfil: MercadoPerfil, message: string) {
  if (actor.perfil !== perfil) fail(403, "forbidden", message);
}

async function auditMercado(
  sql: Sql,
  actor: MercadoActor,
  accion: string,
  tenantId: string,
  detalle: Record<string, unknown>,
) {
  await sql`
    insert into auditoria (id, tenant_id, usuario_id, usuario_nombre, accion, entidad, detalle)
    values (${newId("aud")}, ${tenantId}, ${actor.id}, ${actor.nombre}, ${accion}, 'mercado',
            ${JSON.stringify({ resultado: "ok", ...detalle })}::jsonb)
  `;
}

function emailValue(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    fail(400, "invalid_request", "El correo no es válido.");
  }
  return email;
}

function passwordValue(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    fail(400, "invalid_request", "La contraseña debe tener entre 8 y 200 caracteres.");
  }
  return value;
}

function textValue(value: unknown, field: string, max = 160): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) fail(400, "invalid_request", `${field} es obligatorio.`);
  return text;
}

function passwordHash(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("base64url")}.${scryptSync(password, salt, 64).toString("base64url")}`;
}

function passwordMatches(password: string, encoded: string | null): boolean {
  if (!encoded) return false;
  const [saltText, hashText] = encoded.split(".");
  if (!saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createToken(): string {
  return randomBytes(32).toString("base64url");
}

async function persistSession(
  sql: Sql,
  perfil: MercadoPerfil,
  id: string,
): Promise<string> {
  const token = createToken();
  await sql`
    insert into mercado_sesiones (id, perfil, usuario_id, token_hash, expires_at)
    values (${newId("mse")}, ${perfil}, ${id}, ${tokenHash(token)}, now() + interval '30 days')
  `;
  return token;
}

async function ensureEmailAvailable(sql: Sql, email: string) {
  const rows = await sql<{ email: string }>`
    select email from mercado_credenciales where email = ${email} limit 1
  `;
  if (rows[0]) fail(409, "email_in_use", "Ese correo ya tiene una cuenta de Mercado.");
}

export async function registerBuyer(input: Record<string, unknown>) {
  const nombre = textValue(input.nombre, "nombre");
  const email = emailValue(input.email);
  const password = passwordValue(input.password);
  const telefono = textValue(input.telefono, "telefono", 40);
  const pais = input.pais;
  const tipoDocumento = input.tipoDocumento;
  const numeroDocumento = textValue(input.numeroDocumento, "numeroDocumento", 40);
  if (pais !== "AR" && pais !== "PY") fail(400, "invalid_request", "pais debe ser AR o PY.");
  if (tipoDocumento !== (pais === "AR" ? "DNI" : "CI_PY")) {
    fail(400, "invalid_request", "El tipo de documento no corresponde al país.");
  }
  const id = newId("mco");
  const sql = await getSql();
  const token = await sql.transaction(async (tx) => {
    await ensureEmailAvailable(tx, email);
    await tx`
      insert into mercado_compradores (
        id, nombre, email, telefono, pais, tipo_documento, numero_documento
      ) values (
        ${id}, ${nombre}, ${email}, ${telefono}, ${pais}, ${tipoDocumento}, ${numeroDocumento}
      )
    `;
    await tx`
      insert into mercado_credenciales (email, perfil, usuario_id, password_hash)
      values (${email}, ${"comprador"}, ${id}, ${passwordHash(password)})
    `;
    return persistSession(tx, "comprador", id);
  });
  return { token, usuario: { id, nombre, email, perfil: "comprador", estadoIdentidad: "pendiente" } };
}

export async function registerCourier(input: Record<string, unknown>) {
  const nombre = textValue(input.nombre, "nombre");
  const email = emailValue(input.email);
  const password = passwordValue(input.password);
  const telefono = textValue(input.telefono, "telefono", 40);
  const id = newId("mca");
  const sql = await getSql();
  const token = await sql.transaction(async (tx) => {
    await ensureEmailAvailable(tx, email);
    await tx`
      insert into mercado_cargadores (id, nombre, email, telefono)
      values (${id}, ${nombre}, ${email}, ${telefono})
    `;
    await tx`
      insert into mercado_credenciales (email, perfil, usuario_id, password_hash)
      values (${email}, ${"cargador"}, ${id}, ${passwordHash(password)})
    `;
    return persistSession(tx, "cargador", id);
  });
  return { token, usuario: { id, nombre, email, perfil: "cargador" } };
}

export async function signIn(input: Record<string, unknown>) {
  const email = emailValue(input.email);
  const password = passwordValue(input.password);
  const perfil = input.perfil;
  if (perfil !== "comprador" && perfil !== "cargador") {
    fail(400, "invalid_request", "perfil debe ser comprador o cargador.");
  }
  const sql = await getSql();
  const credentials = await sql<{
    usuario_id: string;
    password_hash: string | null;
  }>`
    select usuario_id, password_hash from mercado_credenciales
    where email = ${email} and perfil = ${perfil} limit 1
  `;
  if (!passwordMatches(password, credentials[0]?.password_hash ?? null)) {
    fail(401, "invalid_credentials", "Correo o contraseña incorrectos.");
  }
  const actor = await actorFor(sql, perfil, credentials[0]!.usuario_id);
  const token = await persistSession(sql, perfil, actor.id);
  return { token, usuario: publicActor(actor) };
}

function publicActor(actor: MercadoActor) {
  return {
    id: actor.id,
    nombre: actor.nombre,
    email: actor.email,
    perfil: actor.perfil,
    ...(actor.estadoIdentidad ? { estadoIdentidad: actor.estadoIdentidad } : {}),
  };
}

async function actorFor(sql: Sql, perfil: MercadoPerfil, id: string): Promise<MercadoActor> {
  if (perfil === "comprador") {
    const rows = await sql<{
      id: string;
      nombre: string;
      email: string;
      telefono: string;
      estado_identidad: string;
    }>`
      select id, nombre, email, telefono, estado_identidad
      from mercado_compradores where id = ${id} limit 1
    `;
    const row = rows[0];
    if (!row) fail(401, "unauthorized", "La sesión no es válida.");
    return {
      perfil,
      id: row.id,
      nombre: row.nombre,
      email: row.email,
      telefono: row.telefono,
      estadoIdentidad: row.estado_identidad,
    };
  }
  const rows = await sql<{
    id: string;
    nombre: string;
    email: string;
    telefono: string;
    estado_cuenta: string;
  }>`
    select id, nombre, email, telefono, estado_cuenta
    from mercado_cargadores where id = ${id} limit 1
  `;
  const row = rows[0];
  if (!row) fail(401, "unauthorized", "La sesión no es válida.");
  if (row.estado_cuenta !== "activo") fail(403, "account_unavailable", "La cuenta del cargador no está activa.");
  return { perfil, id: row.id, nombre: row.nombre, email: row.email, telefono: row.telefono };
}

export async function authenticate(token: string | undefined): Promise<MercadoActor> {
  if (!token) fail(401, "unauthorized", "Falta el token de sesión.");
  const sql = await getSql();
  const rows = await sql<{ perfil: MercadoPerfil; usuario_id: string }>`
    select perfil, usuario_id from mercado_sesiones
    where token_hash = ${tokenHash(token)} and expires_at > now()
    limit 1
  `;
  const session = rows[0];
  if (!session) fail(401, "unauthorized", "La sesión venció o no es válida.");
  return actorFor(sql, session.perfil, session.usuario_id);
}

export async function signOut(token: string | undefined) {
  if (!token) fail(401, "unauthorized", "Falta el token de sesión.");
  const sql = await getSql();
  await sql`delete from mercado_sesiones where token_hash = ${tokenHash(token)}`;
  return { ok: true };
}

export async function getMe(actor: MercadoActor) {
  const sql = await getSql();
  const extra =
    actor.perfil === "comprador"
      ? await sql<{ pais: string; tipo_documento: string; estado_identidad: string }>`
          select pais, tipo_documento, estado_identidad
          from mercado_compradores where id = ${actor.id}
        `
      : await sql<{ estado_cuenta: string; disponibilidad: string; puntos: number; score: unknown }>`
          select estado_cuenta, disponibilidad, puntos, score
          from mercado_cargadores where id = ${actor.id}
        `;
  return { ...publicActor(actor), ...(extra[0] ?? {}) };
}

function decodeImage(value: unknown, field: string): Buffer {
  if (typeof value !== "string" || value.length > 12_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    fail(400, "invalid_request", `${field} no es una imagen Base64 válida.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 8 || bytes.length > 8_000_000) {
    fail(400, "invalid_request", `${field} excede el tamaño permitido.`);
  }
  return bytes;
}

export async function uploadIdentity(actor: MercadoActor, input: Record<string, unknown>) {
  assertPerfil(actor, "comprador", "Solo el comprador puede subir documentación.");
  const pais = input.pais;
  const tipoDocumento = input.tipoDocumento;
  const numeroDocumento = textValue(input.numeroDocumento, "numeroDocumento", 40);
  if ((pais !== "AR" && pais !== "PY") || tipoDocumento !== (pais === "AR" ? "DNI" : "CI_PY")) {
    fail(400, "invalid_request", "Los datos de identidad no son válidos.");
  }
  const documento = decodeImage(input.documentoBase64, "documentoBase64");
  const selfie = decodeImage(input.selfieBase64, "selfieBase64");
  const documentoRef = newId("mar");
  const selfieRef = newId("mar");
  const sql = await getSql();
  await sql.transaction(async (tx) => {
    const result = await tx`
      select id from mercado_compradores where id = ${actor.id} for update
    `;
    if (!result[0]) fail(404, "not_found", "Comprador no encontrado.");
    await tx`
      insert into mercado_archivos (id, comprador_id, tipo, contenido)
      values (${documentoRef}, ${actor.id}, ${"documento"}, ${documento})
    `;
    await tx`
      insert into mercado_archivos (id, comprador_id, tipo, contenido)
      values (${selfieRef}, ${actor.id}, ${"selfie"}, ${selfie})
    `;
    await tx`
      update mercado_compradores
      set pais = ${pais}, tipo_documento = ${tipoDocumento},
          numero_documento = ${numeroDocumento}, estado_identidad = 'documentacion_cargada'
      where id = ${actor.id}
    `;
    await auditMercado(tx, actor, "mercado_identidad_cargada", "mercado", { id: actor.id });
  });
  return { estado: "documentacion_cargada", referencias: { documento: documentoRef, selfie: selfieRef } };
}

export async function listStands() {
  const sql = await getSql();
  const rows = await sql<{ id: string; nombre: string; config: unknown }>`
    select id, nombre, config from tenants
    where config->>'mercadoAlToque' = 'true'
    order by lower(nombre)
  `;
  return {
    puestos: rows.map((row) => {
      const config =
        typeof row.config === "string"
          ? (JSON.parse(row.config) as Record<string, unknown>)
          : ((row.config ?? {}) as Record<string, unknown>);
      return { id: row.id, nombre: row.nombre, bajada: typeof config.mercadoBajada === "string" ? config.mercadoBajada : "" };
    }),
  };
}

export async function listStandProducts(tenantId: string) {
  const sql = await getSql();
  const tenants = await sql<{ id: string }>`
    select id from tenants where id = ${tenantId} and config->>'mercadoAlToque' = 'true'
  `;
  if (!tenants[0]) fail(404, "not_found", "El puesto no tiene Mercado al Toque habilitado.");
  const rows = await sql<{
    id: string;
    nombre: string;
    precio: unknown;
    stock: unknown;
    unidad: string;
    unidad_label: string;
  }>`
    select id, nombre, precio, stock, unidad, unidad_label
    from productos
    where tenant_id = ${tenantId} and activo = true and publicado_online = true
    order by orden nulls last, lower(nombre)
  `;
  return {
    productos: rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      precio: num(row.precio),
      disponible: Math.max(0, num(row.stock)),
      unidad: row.unidad,
      unidadLabel: row.unidad_label,
    })),
  };
}

function assertIdempotencyKey(value: string | undefined): string {
  if (!value || value.length < 8 || value.length > 200 || !/^[\w:.-]+$/.test(value)) {
    fail(400, "invalid_idempotency_key", "Idempotency-Key es obligatorio y debe ser válido.");
  }
  return value;
}

async function claimIdempotency(
  tx: Sql,
  actor: MercadoActor,
  key: string,
  request: unknown,
): Promise<unknown | null> {
  const digest = requestHash(request);
  const inserted = await tx<{ clave: string }>`
    insert into mercado_idempotencia (perfil, usuario_id, clave, request_hash, respuesta)
    values (${actor.perfil}, ${actor.id}, ${key}, ${digest}, ${JSON.stringify({ pending: true })}::jsonb)
    on conflict (perfil, usuario_id, clave) do nothing
    returning clave
  `;
  if (inserted[0]) return null;
  const rows = await tx<{ request_hash: string; respuesta: unknown }>`
    select request_hash, respuesta from mercado_idempotencia
    where perfil = ${actor.perfil} and usuario_id = ${actor.id} and clave = ${key}
    for update
  `;
  const existing = rows[0];
  if (!existing || existing.request_hash !== digest) {
    fail(409, "idempotency_conflict", "La clave de idempotencia ya se usó con otra solicitud.");
  }
  if ((existing.respuesta as { pending?: boolean })?.pending) {
    fail(409, "idempotency_pending", "La solicitud con esta clave todavía está en curso.");
  }
  return existing.respuesta;
}

async function saveIdempotency(
  tx: Sql,
  actor: MercadoActor,
  key: string,
  response: unknown,
) {
  await tx`
    update mercado_idempotencia set respuesta = ${JSON.stringify(response)}::jsonb
    where perfil = ${actor.perfil} and usuario_id = ${actor.id} and clave = ${key}
  `;
}

type CheckoutItem = { tenantId: string; productoId: string; cantidad: number };

export async function createOrders(
  actor: MercadoActor,
  keyInput: string | undefined,
  input: Record<string, unknown>,
) {
  assertPerfil(actor, "comprador", "Solo el comprador puede crear pedidos.");
  if (actor.estadoIdentidad !== "documentacion_cargada") {
    fail(400, "identity_required", "Completá la documentación de identidad antes de comprar.");
  }
  const key = assertIdempotencyKey(keyInput);
  const medioPago = input.medioPago;
  if (medioPago !== "efectivo" && medioPago !== "transferencia") {
    fail(400, "invalid_request", "medioPago debe ser efectivo o transferencia.");
  }
  const nota = typeof input.nota === "string" ? input.nota.trim().slice(0, 500) : "";
  const rawItems = input.items;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 200) {
    fail(400, "invalid_request", "El carrito debe incluir entre 1 y 200 líneas.");
  }
  const items: CheckoutItem[] = rawItems.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(400, "invalid_request", "Una línea del carrito no es válida.");
    }
    const row = value as Record<string, unknown>;
    const tenantId = textValue(row.tenantId, "tenantId", 100);
    const productoId = textValue(row.productoId, "productoId", 100);
    const cantidad = typeof row.cantidad === "number" ? row.cantidad : Number.NaN;
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100_000) {
      fail(400, "invalid_request", "La cantidad debe ser mayor que cero.");
    }
    return { tenantId, productoId, cantidad };
  });
  const unique = new Map<string, CheckoutItem>();
  for (const item of items) {
    const ref = `${item.tenantId}\u0000${item.productoId}`;
    const previous = unique.get(ref);
    unique.set(ref, { ...item, cantidad: (previous?.cantidad ?? 0) + item.cantidad });
  }
  const canonicalItems = [...unique.values()].sort(
    (a, b) => a.tenantId.localeCompare(b.tenantId) || a.productoId.localeCompare(b.productoId),
  );
  const request = { medioPago, nota, items: canonicalItems };
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const replay = await claimIdempotency(tx, actor, key, request);
    if (replay) return replay;
    const grouped = new Map<string, CheckoutItem[]>();
    for (const item of canonicalItems) {
      const group = grouped.get(item.tenantId) ?? [];
      group.push(item);
      grouped.set(item.tenantId, group);
    }
    const pedidos: Record<string, unknown>[] = [];
    for (const [tenantId, lines] of grouped) {
      const enabled = await tx<{ id: string }>`
        select id from tenants where id = ${tenantId} and config->>'mercadoAlToque' = 'true'
      `;
      if (!enabled[0]) fail(404, "not_found", "Uno de los puestos no tiene el canal habilitado.");
      const productoRows: Array<{
        id: string;
        nombre: string;
        precio: unknown;
        stock: unknown;
        unidad: string;
        unidad_label: string;
      }> = [];
      for (const line of lines) {
        const found = await tx<{
          id: string;
          nombre: string;
          precio: unknown;
          stock: unknown;
          unidad: string;
          unidad_label: string;
        }>`
          select id, nombre, precio, stock, unidad, unidad_label
          from productos
          where id = ${line.productoId} and tenant_id = ${tenantId}
            and activo = true and publicado_online = true
          for update
        `;
        if (!found[0]) fail(404, "not_found", "Un producto ya no está publicado en el puesto.");
        if (num(found[0].stock) < line.cantidad) {
          fail(409, "insufficient_stock", `No alcanza el stock de ${found[0].nombre}.`);
        }
        productoRows.push(found[0]);
      }

      const pedidoId = newId("ped");
      const clientUuid = `mercado-${createHash("sha256").update(`${actor.id}:${key}:${tenantId}`).digest("hex").slice(0, 48)}`;
      await tx`
        insert into pedidos (
          id, tenant_id, client_uuid, vendedor_id, cliente_id, cliente_nombre, estado, nota,
          origen, comprador_mercado_id, forma_pago, pago_estado, confirmed_at
        ) values (
          ${pedidoId}, ${tenantId}, ${clientUuid}, ${null}, ${null}, ${actor.nombre}, ${"enviado"},
          ${nota || null}, ${"mercado_al_toque"}, ${actor.id}, ${medioPago}, ${"pendiente"}, now()
        )
      `;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        const product = productoRows[index]!;
        await tx`
          insert into pedido_items (
            id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
          ) values (
            ${newId("itm")}, ${pedidoId}, ${product.id}, ${product.nombre}, ${line.cantidad},
            ${product.precio}, ${product.unidad}, ${product.unidad_label}
          )
        `;
      }
      await reservarLineas(
        tenantId,
        pedidoId,
        lines.map(({ productoId, cantidad }) => ({ productoId, cantidad })),
        tx,
      );
      const itemsRespuesta = lines.map((line, index) => {
        const product = productoRows[index]!;
        return {
          productoId: product.id,
          nombre: product.nombre,
          cantidad: line.cantidad,
          precioUnitario: num(product.precio),
          unidad: product.unidad,
          unidadLabel: product.unidad_label,
          subtotal: Math.round(line.cantidad * num(product.precio) * 100) / 100,
        };
      });
      const totalPedido = Math.round(itemsRespuesta.reduce((sum, item) => sum + num(item.subtotal), 0) * 100) / 100;
      await auditMercado(tx, actor, "mercado_pedido_creado", tenantId, {
        id: pedidoId,
        medioPago,
        items: itemsRespuesta.length,
        total: totalPedido,
      });
      pedidos.push({
        id: pedidoId,
        tenantId,
        estado: "confirmado",
        medioPago,
        pagoEstado: "pendiente",
        nota,
        items: itemsRespuesta,
        total: totalPedido,
        bultos: itemsRespuesta.reduce((sum, item) => sum + (item.unidad === "bulto" ? num(item.cantidad) : 0), 0),
        createdAt: new Date().toISOString(),
      });
    }
    const response = { pedidos };
    await saveIdempotency(tx, actor, key, response);
    return response;
  });
}

function buyerOrderState(row: PedidoMercadoRow): string {
  if (row.estado === "anulado") return "cancelado";
  if (row.delivered_at || row.estado === "entregado") return "entregado";
  if (row.picked_up_at) return "retirado";
  if (row.estado === "listo" || row.estado === "cobrado") return "preparado";
  if (row.estado === "en_preparacion") return "en_preparacion";
  return "confirmado";
}

function minutesBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
}

async function selectBuyerOrders(sql: Sql, buyerId: string, orderId?: string) {
  const rows = await sql.query<PedidoMercadoRow>(
    `select p.id, p.tenant_id, t.nombre as tenant_nombre, p.estado, p.nota,
            p.forma_pago, p.pago_estado, p.created_at::text as created_at,
            p.confirmed_at::text as confirmed_at,
            p.preparation_started_at::text as preparation_started_at,
            p.prepared_at::text as prepared_at, p.picked_up_at::text as picked_up_at,
            p.delivered_at::text as delivered_at,
            coalesce(sum(pi.cantidad * pi.precio_unitario), 0) as total,
            coalesce(sum(case when pi.unidad = 'bulto' then pi.cantidad else 0 end), 0) as bultos
     from pedidos p
     join tenants t on t.id = p.tenant_id
     left join pedido_items pi on pi.pedido_id = p.id
     where p.origen = 'mercado_al_toque' and p.comprador_mercado_id = $1
       and ($2::text is null or p.id = $2)
     group by p.id, t.nombre
     order by p.created_at desc`,
    [buyerId, orderId ?? null],
  );
  const pedidos = [];
  for (const row of rows) {
    if (orderId && row.id !== orderId) continue;
    const lines = await sql<{
      producto_id: string;
      nombre_snapshot: string;
      cantidad: unknown;
      precio_unitario: unknown;
      unidad: string;
      unidad_label: string;
    }>`
      select producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
      from pedido_items where pedido_id = ${row.id} order by nombre_snapshot
    `;
    pedidos.push({
      id: row.id,
      tenantId: row.tenant_id,
      puesto: row.tenant_nombre,
      estado: buyerOrderState(row),
      nota: row.nota,
      medioPago: row.forma_pago,
      pagoEstado: row.pago_estado,
      items: lines.map((line) => ({
        productoId: line.producto_id,
        nombre: line.nombre_snapshot,
        cantidad: num(line.cantidad),
        precioUnitario: num(line.precio_unitario),
        unidad: line.unidad,
        unidadLabel: line.unidad_label,
        subtotal: Math.round(num(line.cantidad) * num(line.precio_unitario) * 100) / 100,
      })),
      total: num(row.total),
      bultos: num(row.bultos),
      tiempos: {
        preparacion: minutesBetween(row.preparation_started_at, row.prepared_at),
        espera: minutesBetween(row.prepared_at, row.picked_up_at),
        entrega: minutesBetween(row.picked_up_at, row.delivered_at),
        total: minutesBetween(row.created_at, row.delivered_at),
      },
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      preparationStartedAt: row.preparation_started_at,
      preparedAt: row.prepared_at,
      pickedUpAt: row.picked_up_at,
      deliveredAt: row.delivered_at,
    });
  }
  return pedidos;
}

export async function listBuyerOrders(actor: MercadoActor) {
  assertPerfil(actor, "comprador", "Solo el comprador puede consultar sus pedidos.");
  return { pedidos: await selectBuyerOrders(await getSql(), actor.id) };
}

export async function getBuyerOrder(actor: MercadoActor, id: string) {
  assertPerfil(actor, "comprador", "Solo el comprador puede consultar sus pedidos.");
  const pedidos = await selectBuyerOrders(await getSql(), actor.id, id);
  if (!pedidos[0]) fail(404, "not_found", "Pedido no encontrado.");
  return { pedido: pedidos[0] };
}

export async function listCouriers() {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    nombre: string;
    puntos: number;
    score: unknown;
    recorridos_completados: number;
    calificacion: unknown;
    nivel: string | null;
  }>`
    select c.id, c.nombre, c.puntos, c.score,
      count(distinct r.id) filter (where r.estado = 'entregado')::int as recorridos_completados,
      coalesce(avg(k.estrellas), 0) as calificacion,
      (select n.nombre from mercado_niveles n where n.puntos_minimos <= c.puntos
       order by n.puntos_minimos desc limit 1) as nivel
    from mercado_cargadores c
    left join mercado_recorridos r on r.cargador_id = c.id
    left join mercado_calificaciones k on k.recorrido_id = r.id
    where c.estado_cuenta = 'activo' and c.disponibilidad = 'disponible'
    group by c.id order by c.score desc, c.nombre
  `;
  return {
    cargadores: rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      nivel: row.nivel ?? "Inicial",
      puntos: row.puntos,
      score: num(row.score),
      recorridosCompletados: row.recorridos_completados,
      calificacion: num(row.calificacion),
    })),
  };
}

async function assertIdempotency(tx: Sql, actor: MercadoActor, key: string, request: unknown) {
  return claimIdempotency(tx, actor, assertIdempotencyKey(key), request);
}

async function routeStops(tx: Sql, routeId: string) {
  const rows = await tx<{
    pedido_id: string;
    tenant_id: string;
    puesto: string;
    bultos: unknown;
    estado: string;
    picked_up_at: string | null;
    delivered_at: string | null;
  }>`
    select rp.pedido_id, rp.tenant_id, t.nombre as puesto, rp.bultos, rp.estado,
           rp.picked_up_at::text as picked_up_at, rp.delivered_at::text as delivered_at
    from mercado_recorrido_pedidos rp
    join tenants t on t.id = rp.tenant_id
    where rp.recorrido_id = ${routeId}
    order by t.nombre
  `;
  return rows.map((row) => ({
    pedidoId: row.pedido_id,
    tenantId: row.tenant_id,
    puesto: row.puesto,
    bultos: num(row.bultos),
    estado: row.estado,
    retiradoAt: row.picked_up_at,
    entregadoAt: row.delivered_at,
  }));
}

async function routeResponse(tx: Sql, routeId: string) {
  const rows = await tx<{
    id: string;
    comprador_id: string;
    comprador_nombre: string;
    comprador_telefono: string;
    cargador_id: string;
    cargador_nombre: string;
    estado: string;
    bultos: unknown;
    created_at: string;
    delivered_at: string | null;
    calificada: boolean;
  }>`
    select r.id, r.comprador_id, b.nombre as comprador_nombre,
           b.telefono as comprador_telefono, r.cargador_id, c.nombre as cargador_nombre,
           r.estado, r.bultos, r.created_at::text as created_at,
           r.delivered_at::text as delivered_at,
           exists(select 1 from mercado_calificaciones k where k.recorrido_id = r.id) as calificada
    from mercado_recorridos r join mercado_cargadores c on c.id = r.cargador_id
    join mercado_compradores b on b.id = r.comprador_id
    where r.id = ${routeId}
  `;
  const row = rows[0];
  if (!row) fail(404, "not_found", "Recorrido no encontrado.");
  const stops = await routeStops(tx, routeId);
  return {
    id: row.id,
    compradorId: row.comprador_id,
    compradorNombre: row.comprador_nombre,
    compradorTelefono: row.comprador_telefono,
    cargadorId: row.cargador_id,
    cargador: row.cargador_nombre,
    estado: row.estado,
    bultos: num(row.bultos),
    calificada: row.calificada,
    paradas: stops,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

export async function createRoute(
  actor: MercadoActor,
  keyInput: string | undefined,
  input: Record<string, unknown>,
) {
  assertPerfil(actor, "comprador", "Solo el comprador puede crear recorridos.");
  const key = assertIdempotencyKey(keyInput);
  const cargadorId = textValue(input.cargadorId, "cargadorId", 100);
  if (!Array.isArray(input.pedidoIds) || input.pedidoIds.length < 1 || input.pedidoIds.length > 40) {
    fail(400, "invalid_request", "Elegí entre 1 y 40 pedidos para el recorrido.");
  }
  const pedidoIds = [...new Set(input.pedidoIds.map((id) => textValue(id, "pedidoId", 100)))];
  if (pedidoIds.length !== input.pedidoIds.length) fail(400, "invalid_request", "No repitas pedidos en un recorrido.");
  const request = { cargadorId, pedidoIds: [...pedidoIds].sort() };
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const replay = await assertIdempotency(tx, actor, key, request);
    if (replay) return replay;
    const courierRows = await tx<{ id: string }>`
      select id from mercado_cargadores
      where id = ${cargadorId} and estado_cuenta = 'activo' and disponibilidad = 'disponible'
      for update
    `;
    if (!courierRows[0]) fail(404, "not_found", "El cargador seleccionado no está disponible.");
    const lockedOrders = await tx<{
      id: string;
      tenant_id: string;
    }>`
      select p.id, p.tenant_id
      from pedidos p
      where p.id = any(${pedidoIds}::text[])
        and p.origen = 'mercado_al_toque'
        and p.comprador_mercado_id = ${actor.id}
        and p.estado in ('listo', 'cobrado')
      for update
    `;
    if (lockedOrders.length !== pedidoIds.length) {
      fail(400, "orders_not_ready", "Todos los pedidos deben ser tuyos y estar preparados para el retiro.");
    }
    const alreadyAssigned = await tx<{ pedido_id: string }>`
      select pedido_id from mercado_recorrido_pedidos
      where pedido_id = any(${pedidoIds}::text[])
    `;
    if (alreadyAssigned.length) fail(409, "order_assigned", "Un pedido ya está en otro recorrido.");
    const baleRows = await tx<{ pedido_id: string; bultos: unknown }>`
      select pedido_id,
        coalesce(sum(case when unidad = 'bulto' then cantidad else 0 end), 0) as bultos
      from pedido_items where pedido_id = any(${pedidoIds}::text[])
      group by pedido_id
    `;
    const balesByOrder = new Map(baleRows.map((row) => [row.pedido_id, num(row.bultos)]));
    const orderRows = lockedOrders.map((row) => ({
      ...row,
      bultos: balesByOrder.get(row.id) ?? 0,
    }));
    const routeId = newId("mre");
    const totalBales = orderRows.reduce((sum, row) => sum + num(row.bultos), 0);
    await tx`
      insert into mercado_recorridos (id, comprador_id, cargador_id, bultos)
      values (${routeId}, ${actor.id}, ${cargadorId}, ${totalBales})
    `;
    for (const order of orderRows) {
      await tx`
        insert into mercado_recorrido_pedidos (id, recorrido_id, pedido_id, tenant_id, bultos)
        values (${newId("mrp")}, ${routeId}, ${order.id}, ${order.tenant_id}, ${num(order.bultos)})
      `;
    }
    await auditMercado(tx, actor, "mercado_recorrido_creado", "mercado", {
      id: routeId,
      cargadorId,
      pedidos: orderRows.length,
      bultos: totalBales,
    });
    const response = { recorrido: await routeResponse(tx, routeId) };
    await saveIdempotency(tx, actor, key, response);
    return response;
  });
}

export async function setCourierAvailability(actor: MercadoActor, input: Record<string, unknown>) {
  assertPerfil(actor, "cargador", "Solo el cargador puede cambiar disponibilidad.");
  const disponibilidad = input.disponibilidad;
  if (disponibilidad !== "disponible" && disponibilidad !== "no_disponible") {
    fail(400, "invalid_request", "disponibilidad inválida.");
  }
  const sql = await getSql();
  await sql`
    update mercado_cargadores set disponibilidad = ${disponibilidad}
    where id = ${actor.id} and estado_cuenta = 'activo'
  `;
  return { disponibilidad };
}

export async function listRoutes(actor: MercadoActor) {
  const sql = await getSql();
  const condition = actor.perfil === "cargador" ? "r.cargador_id = $1" : "r.comprador_id = $1";
  const rows = await sql.query<{ id: string }>(
    `select r.id from mercado_recorridos r where ${condition} order by r.created_at desc limit 60`,
    [actor.id],
  );
  const recorridos = [];
  for (const row of rows) recorridos.push(await routeResponse(sql, row.id));
  return { recorridos };
}

async function assertCourierRoute(tx: Sql, actor: MercadoActor, routeId: string) {
  assertPerfil(actor, "cargador", "Solo el cargador puede operar recorridos.");
  const rows = await tx<{ id: string; estado: string }>`
    select id, estado from mercado_recorridos
    where id = ${routeId} and cargador_id = ${actor.id}
    for update
  `;
  if (!rows[0]) fail(404, "not_found", "Recorrido no encontrado.");
  return rows[0];
}

export async function changeRoute(
  actor: MercadoActor,
  routeId: string,
  action: "aceptar" | "rechazar",
  keyInput: string | undefined,
) {
  assertPerfil(actor, "cargador", "Solo el cargador puede operar recorridos.");
  const key = assertIdempotencyKey(keyInput);
  const request = { action, routeId };
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const replay = await assertIdempotency(tx, actor, key, request);
    if (replay) return replay;
    const route = await assertCourierRoute(tx, actor, routeId);
    if (route.estado !== "asignado") fail(400, "invalid_transition", "El recorrido ya no está asignado.");
    if (action === "aceptar") {
      await tx`update mercado_recorridos set estado = 'aceptado', accepted_at = now() where id = ${routeId}`;
      await tx`update mercado_recorrido_pedidos set estado = 'aceptado' where recorrido_id = ${routeId}`;
    } else {
      await tx`update mercado_recorridos set estado = 'rechazado' where id = ${routeId}`;
      await tx`delete from mercado_recorrido_pedidos where recorrido_id = ${routeId}`;
    }
    await auditMercado(
      tx,
      actor,
      action === "aceptar" ? "mercado_recorrido_aceptado" : "mercado_recorrido_rechazado",
      "mercado",
      { id: routeId },
    );
    const response = { recorrido: await routeResponse(tx, routeId) };
    await saveIdempotency(tx, actor, key, response);
    return response;
  });
}

export async function updateStop(
  actor: MercadoActor,
  routeId: string,
  pedidoId: string,
  action: "retirar" | "entregar",
  keyInput: string | undefined,
) {
  assertPerfil(actor, "cargador", "Solo el cargador puede operar recorridos.");
  const key = assertIdempotencyKey(keyInput);
  const request = { action, routeId, pedidoId };
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const replay = await assertIdempotency(tx, actor, key, request);
    if (replay) return replay;
    const route = await assertCourierRoute(tx, actor, routeId);
    if (route.estado !== "aceptado") fail(400, "invalid_transition", "El recorrido debe estar aceptado.");
    const stopRows = await tx<{ estado: string; tenant_id: string; pedido_estado: string }>`
      select rp.estado, rp.tenant_id, p.estado as pedido_estado
      from mercado_recorrido_pedidos rp
      join pedidos p on p.id = rp.pedido_id
      where rp.recorrido_id = ${routeId} and rp.pedido_id = ${pedidoId}
      for update
    `;
    const stop = stopRows[0];
    if (!stop) fail(403, "forbidden", "El pedido no pertenece a este recorrido.");
    if (action === "retirar") {
      if (stop.estado !== "aceptado") fail(400, "invalid_transition", "La parada ya fue retirada o no está aceptada.");
      if (stop.pedido_estado !== "listo" && stop.pedido_estado !== "cobrado") {
        fail(400, "order_not_ready", "El puesto todavía no marcó el pedido como listo.");
      }
      await tx`
        update mercado_recorrido_pedidos
        set estado = 'retirado', picked_up_at = now()
        where recorrido_id = ${routeId} and pedido_id = ${pedidoId}
      `;
      await tx`
        update pedidos set picked_up_at = now(), updated_at = now()
        where id = ${pedidoId} and tenant_id = ${stop.tenant_id}
      `;
      await auditMercado(tx, actor, "mercado_parada_retirada", stop.tenant_id, { id: routeId, pedidoId });
    } else {
      if (stop.estado !== "retirado") fail(400, "invalid_transition", "Retirá la parada antes de entregarla.");
      await tx`
        update mercado_recorrido_pedidos
        set estado = 'entregado', delivered_at = now()
        where recorrido_id = ${routeId} and pedido_id = ${pedidoId}
      `;
      await tx`
        update pedidos set estado = 'entregado', delivered_at = now(), updated_at = now()
        where id = ${pedidoId} and tenant_id = ${stop.tenant_id}
      `;
      const remaining = await tx<{ n: number }>`
        select count(*)::int as n from mercado_recorrido_pedidos
        where recorrido_id = ${routeId} and estado <> 'entregado'
      `;
      if (num(remaining[0]?.n) === 0) {
        await tx`update mercado_recorridos set estado = 'entregado', delivered_at = now() where id = ${routeId}`;
        await tx`
          insert into mercado_punto_movimientos (id, cargador_id, recorrido_id, puntos, motivo)
          values (${newId("mpm")}, ${actor.id}, ${routeId}, ${1}, ${"recorrido_entregado"})
        `;
        await tx`update mercado_cargadores set puntos = puntos + 1 where id = ${actor.id}`;
      }
      await auditMercado(tx, actor, "mercado_parada_entregada", stop.tenant_id, { id: routeId, pedidoId });
    }
    const response = { recorrido: await routeResponse(tx, routeId) };
    await saveIdempotency(tx, actor, key, response);
    return response;
  });
}

export async function rateRoute(
  actor: MercadoActor,
  routeId: string,
  input: Record<string, unknown>,
) {
  assertPerfil(actor, "comprador", "Solo el comprador puede calificar.");
  const stars = input.estrellas;
  const comentario = typeof input.comentario === "string" ? input.comentario.trim().slice(0, 1000) : "";
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    fail(400, "invalid_request", "estrellas debe ser un entero entre 1 y 5.");
  }
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const routes = await tx<{ id: string; cargador_id: string; estado: string }>`
      select id, cargador_id, estado from mercado_recorridos
      where id = ${routeId} and comprador_id = ${actor.id}
      for update
    `;
    const route = routes[0];
    if (!route) fail(404, "not_found", "Recorrido no encontrado.");
    if (route.estado !== "entregado") fail(400, "route_not_delivered", "Solo se califica un recorrido entregado.");
    const existing = await tx<{ id: string }>`
      select id from mercado_calificaciones where recorrido_id = ${routeId} limit 1
    `;
    if (existing[0]) fail(409, "already_rated", "Este recorrido ya fue calificado.");
    const ratingId = newId("mka");
    await tx`
      insert into mercado_calificaciones (id, recorrido_id, comprador_id, estrellas, comentario)
      values (${ratingId}, ${routeId}, ${actor.id}, ${stars}, ${comentario})
    `;
    await tx`
      update mercado_cargadores c
      set score = coalesce((
        select avg(k.estrellas) from mercado_calificaciones k
        where k.recorrido_id in (
          select r.id from mercado_recorridos r where r.cargador_id = c.id
        )
      ), 0)
      where c.id = ${route.cargador_id}
    `;
    await auditMercado(tx, actor, "mercado_recorrido_calificado", "mercado", {
      id: routeId,
      estrellas: stars,
    });
    return { calificacion: { id: ratingId, recorridoId: routeId, estrellas: stars, comentario } };
  });
}

export async function findGoogleCredential(email: string, subject: string, perfil: MercadoPerfil, nombre: string, telefono: string) {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const existing = await tx<{ perfil: MercadoPerfil; usuario_id: string }>`
      select perfil, usuario_id from mercado_credenciales
      where email = ${email} or google_subject = ${subject}
      limit 1
    `;
    if (existing[0]) {
      if (existing[0].perfil !== perfil) fail(403, "profile_mismatch", "La cuenta de Google está registrada con otro perfil.");
      await tx`update mercado_credenciales set google_subject = ${subject} where email = ${email}`;
      return actorFor(tx, perfil, existing[0].usuario_id);
    }
    await ensureEmailAvailable(tx, email);
    const id = newId(perfil === "comprador" ? "mco" : "mca");
    if (perfil === "comprador") {
      await tx`
        insert into mercado_compradores (
          id, nombre, email, telefono, pais, tipo_documento, numero_documento
        ) values (${id}, ${nombre}, ${email}, ${telefono || ""}, ${"AR"}, ${"DNI"}, ${""})
      `;
    } else {
      await tx`
        insert into mercado_cargadores (id, nombre, email, telefono)
        values (${id}, ${nombre}, ${email}, ${telefono || ""})
      `;
    }
    await tx`
      insert into mercado_credenciales (email, perfil, usuario_id, google_subject)
      values (${email}, ${perfil}, ${id}, ${subject})
    `;
    return actorFor(tx, perfil, id);
  });
}

export async function createOAuthSession(actor: MercadoActor) {
  const sql = await getSql();
  return persistSession(sql, actor.perfil, actor.id);
}

export async function listPublicRanking() {
  return listCouriers();
}

export async function clearExpiredGoogleStates(sql: Sql) {
  await sql`delete from mercado_google_state where expires_at < now()`;
}

export function newGoogleState(): string {
  return randomBytes(32).toString("base64url");
}

export function emailFromExternal(value: unknown): string {
  return emailValue(value);
}
