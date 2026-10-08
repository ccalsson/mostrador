import { createHash, randomBytes } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { auth } from "@/lib/auth/server";
import { getSql, withTransaction, type Sql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { reservarLineas, soltarReserva } from "@/lib/server/stock";
import { createCredentialUser, ensureBootstrapped } from "@/lib/server/bootstrap";
import { textoCondicion, tierContratado } from "@/lib/torre/condiciones";
import { avisosDe, comisionDePuesto, lineasPorPuesto, puedeAparecer } from "@/lib/torre/presencia";
import {
  calcularScore,
  claveDePedido,
  estadoParaComprador,
  exigirTransicion,
  minutosEntre,
  nivelPara,
  nombreVisible,
  contarBultos,
  puedeCalificar,
  type LineaCanal,
} from "@/lib/mercado/reglas";

export class MercadoError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type Perfil = "comprador" | "cargador";

type Sesion = { userId: string; perfil: Perfil };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function sql() {
  await ensureBootstrapped();
  return getSql();
}

export async function emitirSesion(userId: string, perfil: Perfil) {
  const db = await sql();
  const token = randomBytes(32).toString("hex");
  await db`
    insert into mercado_sesiones (token_hash, user_id, perfil, expires_at)
    values (${hashToken(token)}, ${userId}, ${perfil}, now() + interval '30 days')
  `;
  return token;
}

export async function leerSesion(request: Request): Promise<Sesion> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new MercadoError("Tenés que entrar.", 401);
  const db = await sql();
  const rows = await db<{ user_id: string; perfil: Perfil }>`
    select user_id, perfil from mercado_sesiones
    where token_hash = ${hashToken(token)} and expires_at > now()
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new MercadoError("La sesión no sirve. Entrá de nuevo.", 401);
  return { userId: row.user_id, perfil: row.perfil };
}

async function compradorDe(userId: string) {
  const db = await sql();
  const rows = await db<{
    id: string;
    nombre: string;
    telefono: string | null;
    pais: string | null;
    tipo_documento: string | null;
    numero_documento: string | null;
    identidad_estado: string;
    documento_ref: string | null;
    selfie_ref: string | null;
    foto_id: string | null;
  }>`
    select id, nombre, telefono, pais, tipo_documento, numero_documento, identidad_estado, documento_ref, selfie_ref, foto_id
    from mercado_compradores where user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

async function cargadorDe(userId: string) {
  const db = await sql();
  const rows = await db<{
    id: string;
    nombre: string;
    telefono: string | null;
    estado: string;
    disponibilidad: string;
    puntos: number;
    nivel: string;
    score: unknown;
    foto_id: string | null;
  }>`
    select id, nombre, telefono, estado, disponibilidad, puntos, nivel, score, foto_id
    from mercado_cargadores where user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

async function fotoDataUrl(fotoId: string | null) {
  if (!fotoId) return null;
  const db = await sql();
  const rows = await db<{ mime: string; contenido: Buffer | Uint8Array | string }>`
    select mime, contenido from mercado_fotos where id = ${fotoId} limit 1
  `;
  const row = rows[0];
  if (!row?.contenido) return null;
  const crudo = row.contenido;
  const buf = Buffer.isBuffer(crudo)
    ? crudo
    : typeof crudo === "string"
      ? Buffer.from(crudo.replace(/^\\x/, ""), "hex")
      : Buffer.from(crudo);
  return `data:${row.mime || "image/jpeg"};base64,${buf.toString("base64")}`;
}

async function publicoComprador(
  email: string,
  row: NonNullable<Awaited<ReturnType<typeof compradorDe>>>,
) {
  return {
    id: row.id,
    nombre: row.nombre,
    email,
    telefono: row.telefono,
    pais: row.pais,
    tipoDocumento: row.tipo_documento,
    numeroDocumento: row.numero_documento,
    identidadEstado: row.identidad_estado,
    documentoRef: row.documento_ref,
    selfieRef: row.selfie_ref,
    foto: await fotoDataUrl(row.foto_id),
  };
}

async function emailDe(userId: string) {
  const db = await sql();
  const rows = await db<{ email: string }>`select email from "user" where id = ${userId} limit 1`;
  return rows[0]?.email ?? "";
}

export async function registrarComprador(input: {
  nombre: string;
  email: string;
  password: string;
  telefono: string;
  pais: string;
  tipoDocumento: string;
  numeroDocumento: string;
}) {
  const email = input.email.trim().toLowerCase();
  const nombre = input.nombre.trim();
  if (!nombre || !email || input.password.length < 8) {
    throw new MercadoError("Completá nombre, email y una clave de al menos 8 caracteres.");
  }
  const numero = input.numeroDocumento.trim();
  const conDocumento = numero.length > 0;
  if (conDocumento && (!["AR", "PY"].includes(input.pais) || !["DNI", "CI_PY"].includes(input.tipoDocumento))) {
    throw new MercadoError("Si cargás el número, tiene que ser DNI argentino o cédula paraguaya.");
  }
  const db = await sql();
  const staff = await db<{ id: string }>`select id from staff where lower(email) = ${email} limit 1`;
  if (staff[0]) throw new MercadoError("Ese correo es del puesto. Usá otro.");
  const userId = await createCredentialUser(email, input.password, nombre);
  const id = newId("mc");
  await db`
    insert into mercado_compradores (
      id, user_id, pais, tipo_documento, numero_documento, nombre, telefono, identidad_estado
    ) values (
      ${id}, ${userId}, ${conDocumento ? input.pais : null}, ${conDocumento ? input.tipoDocumento : null},
      ${conDocumento ? numero : null},
      ${nombre}, ${input.telefono.trim() || null}, ${"pendiente"}
    )
  `;
  const token = await emitirSesion(userId, "comprador");
  const comprador = await compradorDe(userId);
  if (!comprador) throw new MercadoError("No se pudo crear el comprador.", 500);
  return { token, perfil: "comprador" as const, comprador: await publicoComprador(email, comprador) };
}

export async function registrarCargador(input: { nombre: string; email: string; password: string; telefono: string }) {
  const email = input.email.trim().toLowerCase();
  const nombre = input.nombre.trim();
  if (!nombre || !email || input.password.length < 8) {
    throw new MercadoError("Completá nombre, email y una clave de al menos 8 caracteres.");
  }
  const db = await sql();
  const staff = await db<{ id: string }>`select id from staff where lower(email) = ${email} limit 1`;
  if (staff[0]) throw new MercadoError("Ese correo es del puesto. Usá otro.");
  let userId: string;
  const existente = await db<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  if (existente[0]) {
    userId = existente[0].id;
    const cuenta = await db<{ password: string | null }>`
      select password from account where "userId" = ${userId} and "providerId" = 'credential' limit 1
    `;
    const hash = cuenta[0]?.password;
    if (!hash || !(await verifyPassword({ hash, password: input.password }))) {
      throw new MercadoError("Ese correo ya existe y la clave no coincide.", 401);
    }
  } else {
    userId = await createCredentialUser(email, input.password, nombre);
  }
  const ya = await cargadorDe(userId);
  if (!ya) {
    await db`
      insert into mercado_cargadores (id, user_id, nombre, telefono)
      values (${newId("cg")}, ${userId}, ${nombre}, ${input.telefono.trim() || null})
    `;
  }
  const token = await emitirSesion(userId, "cargador");
  return { token, perfil: "cargador" as const, cargador: await resumenCargador(userId) };
}

export async function ingresar(emailRaw: string, password: string, perfil: Perfil) {
  const email = emailRaw.trim().toLowerCase();
  const db = await sql();
  const users = await db<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  const user = users[0];
  if (!user) throw new MercadoError("Correo o clave incorrectos.", 401);
  const cuentas = await db<{ password: string | null }>`
    select password from account where "userId" = ${user.id} and "providerId" = 'credential' limit 1
  `;
  const hash = cuentas[0]?.password;
  if (!hash || !(await verifyPassword({ hash, password }))) {
    throw new MercadoError("Correo o clave incorrectos.", 401);
  }
  if (perfil === "comprador" && !(await compradorDe(user.id))) {
    throw new MercadoError("Esta cuenta no es de un comprador.", 403);
  }
  if (perfil === "cargador") {
    const cargador = await cargadorDe(user.id);
    if (!cargador) throw new MercadoError("Esta cuenta no es de un cargador.", 403);
    if (cargador.estado !== "activo") throw new MercadoError("Este cargador no puede entrar.", 403);
  }
  const token = await emitirSesion(user.id, perfil);
  return { token, perfil, ...(await ficha(user.id, perfil)) };
}

export async function salir(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: true };
  const db = await sql();
  await db`delete from mercado_sesiones where token_hash = ${hashToken(token)}`;
  return { ok: true };
}

async function ficha(userId: string, perfil: Perfil) {
  const email = await emailDe(userId);
  if (perfil === "cargador") return { cargador: await resumenCargador(userId) };
  const comprador = await compradorDe(userId);
  if (!comprador) throw new MercadoError("No hay perfil de comprador.", 403);
  return { comprador: await publicoComprador(email, comprador) };
}

export async function yo(ses: Sesion) {
  return { perfil: ses.perfil, ...(await ficha(ses.userId, ses.perfil)) };
}

async function resumenCargador(userId: string) {
  const row = await cargadorDe(userId);
  if (!row) throw new MercadoError("No hay perfil de cargador.", 403);
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono,
    estado: row.estado,
    disponibilidad: row.disponibilidad,
    puntos: row.puntos,
    nivel: row.nivel,
    score: num(row.score),
    foto: await fotoDataUrl(row.foto_id),
  };
}

export async function iniciarGoogle(request: Request, perfil: Perfil, web = false) {
  if (perfil !== "comprador" && perfil !== "cargador") {
    throw new MercadoError("Elegí comprador o cargador.");
  }
  const db = await sql();
  const state = newId("gst");
  await db`insert into mercado_google_state (id, perfil) values (${state}, ${perfil})`;
  const origin = origenPublico(request);
  const callbackURL = `${origin}/api/mercado/v1/auth/google/vuelta?state=${state}${web ? "&destino=web" : ""}`;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  const respuesta = await auth.api.signInWithOAuth2({
    body: {
      providerId: "grok-google",
      callbackURL,
    },
    headers,
    asResponse: true,
  });
  const data = (await respuesta.json().catch(() => null)) as { url?: string } | null;
  if (!respuesta.ok || !data?.url) {
    throw new MercadoError("Google no pudo iniciarse con el ingreso que ya usa Mostrador.", 502);
  }
  return { url: data.url, cookies: respuesta.headers.getSetCookie?.() ?? [] };
}

function origenPublico(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) return `${proto || "https"}://${host}`;
  return url.origin;
}

export async function volverDeGoogle(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const db = await sql();
  const estados = await db<{ perfil: Perfil }>`
    delete from mercado_google_state
    where id = ${state} and created_at > now() - interval '20 minutes'
    returning perfil
  `;
  const perfil = estados[0]?.perfil;
  if (!perfil) return new Response("El ingreso con Google venció. Volvé a la app.", { status: 400 });
  const session = await auth.api.getSession({ headers: request.headers });
  const user = session?.user;
  if (!user?.id) return new Response("Google no dejó una sesión.", { status: 401 });
  if (perfil === "comprador" && !(await compradorDe(user.id))) {
    await db`
      insert into mercado_compradores (id, user_id, nombre, identidad_estado)
      values (${newId("mc")}, ${user.id}, ${user.name || "Comprador"}, ${"pendiente"})
    `;
  }
  if (perfil === "cargador" && !(await cargadorDe(user.id))) {
    await db`
      insert into mercado_cargadores (id, user_id, nombre)
      values (${newId("cg")}, ${user.id}, ${user.name || "Cargador"})
    `;
  }
  const token = await emitirSesion(user.id, perfil);
  if (url.searchParams.get("destino") === "web") {
    return Response.redirect(`${url.origin}/mercado?token=${encodeURIComponent(token)}`, 302);
  }
  return Response.redirect(`mercadoaltoque://auth?token=${encodeURIComponent(token)}`, 302);
}

export async function cargarIdentidad(
  ses: Sesion,
  input: {
    pais: string;
    tipoDocumento: string;
    numeroDocumento: string;
    documentoBase64: string;
    selfieBase64: string;
  },
) {
  if (ses.perfil !== "comprador") throw new MercadoError("Solo el comprador carga documentación.", 403);
  const comprador = await compradorDe(ses.userId);
  if (!comprador) throw new MercadoError("No hay perfil de comprador.", 403);
  if (input.documentoBase64.length > 1_500_000 || input.selfieBase64.length > 1_500_000) {
    throw new MercadoError("La foto es muy pesada.");
  }
  const db = await sql();
  const documentoId = newId("arc");
  const selfieId = newId("arc");
  await db.query(
    `insert into mercado_archivos (id, comprador_id, tipo, mime, contenido)
     values ($1, $2, 'documento', 'image/jpeg', decode($3, 'base64'))`,
    [documentoId, comprador.id, input.documentoBase64],
  );
  await db.query(
    `insert into mercado_archivos (id, comprador_id, tipo, mime, contenido)
     values ($1, $2, 'selfie', 'image/jpeg', decode($3, 'base64'))`,
    [selfieId, comprador.id, input.selfieBase64],
  );
  await db`
    update mercado_compradores
    set pais = ${input.pais},
        tipo_documento = ${input.tipoDocumento},
        numero_documento = ${input.numeroDocumento.trim()},
        identidad_estado = 'documentacion_cargada',
        documento_ref = ${documentoId},
        selfie_ref = ${selfieId}
    where id = ${comprador.id}
  `;
  return yo(ses);
}

export async function avisos() {
  return { avisos: await avisosDe() };
}

export async function puestos() {
  const db = await sql();
  const mapa = await lineasPorPuesto();
  const rows = await db<{ id: string; nombre: string; config: unknown }>`
    select id, nombre, config from tenants
    where coalesce(config, '{}'::jsonb)->>'mercadoAlToque' = 'true'
    order by lower(nombre)
  `;
  return {
    puestos: rows.flatMap((row) => {
      const tier = tierContratado(mapa.get(row.id) ?? []);
      if (!tier) return [];
      const config = (typeof row.config === "string" ? JSON.parse(row.config) : row.config ?? {}) as {
        bajada?: string;
      };
      return [{ id: row.id, nombre: row.nombre, bajada: config.bajada ?? null, tier }];
    }),
  };
}

export async function productosDe(tenantId: string) {
  const db = await sql();
  const habilitado = await db<{ id: string }>`
    select id from tenants
    where id = ${tenantId} and coalesce(config, '{}'::jsonb)->>'mercadoAlToque' = 'true'
    limit 1
  `;
  if (!habilitado[0]) throw new MercadoError("Ese puesto no está en Mercado al Toque.", 404);
  const presencia = await puedeAparecer(tenantId, { mercadoAlToque: true });
  if (!presencia.visible) throw new MercadoError("Ese puesto no está publicado en Mercado al Toque.", 404);
  const rows = await db<{
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
    order by lower(nombre)
  `;
  return {
    productos: rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      precio: num(row.precio),
      disponible: num(row.stock),
      unidad: row.unidad,
      unidadLabel: row.unidad_label,
    })),
  };
}

export async function crearPedidos(ses: Sesion, clave: string, lineas: LineaCanal[], medioPago: string, nota: string) {
  if (ses.perfil !== "comprador") throw new MercadoError("Solo un comprador puede pedir.", 403);
  if (!clave) throw new MercadoError("Falta la clave de idempotencia.");
  if (medioPago !== "efectivo" && medioPago !== "transferencia") {
    throw new MercadoError("El pago es efectivo o transferencia.");
  }
  const comprador = await compradorDe(ses.userId);
  if (!comprador) throw new MercadoError("No hay perfil de comprador.", 403);
  if (comprador.identidad_estado === "pendiente" || comprador.identidad_estado === "rechazada") {
    throw new MercadoError("Antes tenés que cargar el documento y la selfie.");
  }
  const db = await sql();
  const previa = await db<{ respuesta: unknown }>`
    select respuesta from mercado_idempotencia
    where user_id = ${ses.userId} and clave = ${clave} and ruta = 'pedidos'
    limit 1
  `;
  if (previa[0]) return previa[0].respuesta;

  const grupos = new Map<string, LineaCanal[]>();
  for (const linea of lineas) {
    if (linea.cantidad <= 0) continue;
    const lista = grupos.get(linea.tenantId) ?? [];
    lista.push(linea);
    grupos.set(linea.tenantId, lista);
  }
  if (grupos.size === 0) throw new MercadoError("El pedido no tiene productos.");

  try {
    return await withTransaction(async (tx) => {
      const creados: string[] = [];
      for (const [tenantId, items] of grupos) {
        const puesto = await tx<{ id: string; nombre: string }>`
          select id, nombre from tenants
          where id = ${tenantId} and coalesce(config, '{}'::jsonb)->>'mercadoAlToque' = 'true'
          limit 1
        `;
        if (!puesto[0]) throw new MercadoError("Hay un puesto que no está habilitado.");
        const presencia = await puedeAparecer(tenantId, { mercadoAlToque: true });
        if (!presencia.visible) throw new MercadoError("Hay un puesto que no está publicado en Mercado al Toque.");
        const comision = await comisionDePuesto(tenantId);
        const clientUuid = claveDePedido(clave, tenantId);
        const ya = await tx<{ id: string }>`
          select id from pedidos where tenant_id = ${tenantId} and client_uuid = ${clientUuid} limit 1
        `;
        if (ya[0]) {
          creados.push(ya[0].id);
          continue;
        }
        const productos = await tx<{
          id: string;
          nombre: string;
          unidad: string;
          unidad_label: string;
          precio: unknown;
          stock: unknown;
        }>`
          select id, nombre, unidad, unidad_label, precio, stock
          from productos
          where tenant_id = ${tenantId} and activo = true and publicado_online = true
        `;
        const porId = new Map(productos.map((p) => [p.id, p]));
        for (const item of items) {
          const producto = porId.get(item.productoId);
          if (!producto) throw new MercadoError("Hay un producto que no está publicado.");
          if (num(producto.stock) < item.cantidad) {
            throw new MercadoError(`No alcanza el stock de ${producto.nombre}.`, 409);
          }
        }
        const pedidoId = newId("ped");
        await tx`
          insert into pedidos (
            id, tenant_id, client_uuid, cliente_nombre, estado, nota, origen, comprador_mercado_id,
            pago_estado, confirmed_at, forma_pago, condicion
          ) values (
            ${pedidoId}, ${tenantId}, ${clientUuid}, ${comprador.nombre}, ${"enviado"}, ${nota || null},
            ${"mercado_al_toque"}, ${comprador.id}, ${medioPago === "transferencia" ? "informado" : "pendiente"},
            now(), ${medioPago}, ${JSON.stringify({ ...comision, tier: presencia.tier })}::jsonb
          )
        `;
        for (const item of items) {
          const producto = porId.get(item.productoId)!;
          await tx`
            insert into pedido_items (
              id, pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, unidad, unidad_label
            ) values (
              ${newId("itm")}, ${pedidoId}, ${producto.id}, ${producto.nombre}, ${item.cantidad},
              ${num(producto.precio)}, ${producto.unidad}, ${producto.unidad_label}
            )
          `;
        }
        try {
          await reservarLineas(
            tenantId,
            pedidoId,
            items.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad })),
            tx,
          );
        } catch (error) {
          throw new MercadoError(error instanceof Error ? error.message : "No se pudo reservar.", 409);
        }
        creados.push(pedidoId);
      }
      const respuesta = { pedidos: await leerPedidos(comprador.id, creados, tx) };
      await tx`
        insert into mercado_idempotencia (user_id, clave, ruta, respuesta)
        values (${ses.userId}, ${clave}, ${"pedidos"}, ${JSON.stringify(respuesta)}::jsonb)
        on conflict (user_id, clave, ruta) do nothing
      `;
      return respuesta;
    });
  } catch (error) {
    if (esClaveDuplicada(error)) {
      const otra = await db<{ respuesta: unknown }>`
        select respuesta from mercado_idempotencia
        where user_id = ${ses.userId} and clave = ${clave} and ruta = 'pedidos'
        limit 1
      `;
      if (otra[0]) return otra[0].respuesta;
    }
    if (error instanceof MercadoError) throw error;
    throw new MercadoError(error instanceof Error ? error.message : "No se pudo crear el pedido.");
  }
}

function esClaveDuplicada(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "23505") return true;
  const message = error instanceof Error ? error.message : "";
  return /duplicate key|unique constraint/i.test(message);
}

async function leerPedidos(compradorId: string, ids?: string[], db?: Sql) {
  const base = db ?? (await sql());
  const rows = await base<{
    id: string;
    tenant_id: string;
    tenant_nombre: string;
    estado: string;
    pago_estado: string | null;
    created_at: string;
    confirmed_at: string | null;
    preparation_started_at: string | null;
    prepared_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
    logistica: string | null;
    condicion: unknown;
  }>`
    select p.id, p.tenant_id, t.nombre as tenant_nombre, p.estado, p.pago_estado,
           p.created_at::text, p.confirmed_at::text, p.preparation_started_at::text,
           p.prepared_at::text, p.picked_up_at::text, p.delivered_at::text,
           rp.estado as logistica, p.condicion
    from pedidos p
    join tenants t on t.id = p.tenant_id
    left join mercado_recorrido_pedidos rp on rp.pedido_id = p.id
    where p.comprador_mercado_id = ${compradorId}
      and p.origen = 'mercado_al_toque'
      and (${ids ?? null}::text[] is null or p.id = any(${ids ?? null}::text[]))
    order by p.created_at desc
  `;
  const salida = [];
  for (const row of rows) {
    const items = await base<{ nombre: string; cantidad: unknown; precio: unknown; unidad: string }>`
      select nombre_snapshot as nombre, cantidad, precio_unitario as precio, unidad
      from pedido_items where pedido_id = ${row.id}
    `;
    const lineas = items.map((item) => ({
      nombre: item.nombre,
      cantidad: num(item.cantidad),
      precio: num(item.precio),
      unidad: item.unidad,
    }));
    const total = lineas.reduce((suma, item) => suma + item.cantidad * item.precio, 0);
    salida.push({
      id: row.id,
      tenantId: row.tenant_id,
      tenantNombre: row.tenant_nombre,
      estado: estadoParaComprador(row.estado, row.logistica),
      pagoEstado: row.pago_estado ?? "pendiente",
      total,
      bultos: contarBultos(lineas),
      creadoEn: row.created_at,
      tiempos: {
        preparacion: minutosEntre(row.preparation_started_at, row.prepared_at),
        espera: minutosEntre(row.prepared_at, row.picked_up_at),
        entrega: minutosEntre(row.picked_up_at, row.delivered_at),
        total: minutosEntre(row.created_at, row.delivered_at),
      },
      items: lineas,
      comision: textoCondicion(row.condicion),
    });
  }
  return salida;
}

export async function pedidosDe(ses: Sesion) {
  const comprador = await exigirComprador(ses);
  return { pedidos: await leerPedidos(comprador.id) };
}

export async function pedidoDe(ses: Sesion, id: string) {
  const comprador = await exigirComprador(ses);
  const pedidos = await leerPedidos(comprador.id, [id]);
  const pedido = pedidos[0];
  if (!pedido) throw new MercadoError("Ese pedido no es tuyo.", 403);
  return { pedido };
}

async function exigirComprador(ses: Sesion) {
  if (ses.perfil !== "comprador") throw new MercadoError("Esta acción es del comprador.", 403);
  const comprador = await compradorDe(ses.userId);
  if (!comprador) throw new MercadoError("No hay perfil de comprador.", 403);
  return comprador;
}

export async function cancelarPedido(ses: Sesion, pedidoId: string) {
  const comprador = await exigirComprador(ses);
  const db = await sql();
  const rows = await db<{ id: string; tenant_id: string; estado: string }>`
    select id, tenant_id, estado from pedidos
    where id = ${pedidoId} and comprador_mercado_id = ${comprador.id}
    limit 1
  `;
  const pedido = rows[0];
  if (!pedido) throw new MercadoError("Ese pedido no es tuyo.", 403);
  if (pedido.estado !== "enviado") throw new MercadoError("El puesto ya lo está trabajando.");
  const asignado = await db<{ id: string }>`
    select recorrido_id as id from mercado_recorrido_pedidos where pedido_id = ${pedidoId} limit 1
  `;
  if (asignado[0]) throw new MercadoError("Ese pedido ya tiene cargador.");
  await soltarReserva(pedido.tenant_id, pedido.id);
  await db`update pedidos set estado = 'anulado', updated_at = now() where id = ${pedido.id}`;
  return { ok: true };
}

export async function cargadoresDisponibles() {
  const db = await sql();
  const rows = await db<{
    id: string;
    nombre: string;
    nivel: string;
    score: unknown;
    puntos: number;
    recorridos_completados: number;
    calificacion_suma: number;
    calificacion_cantidad: number;
  }>`
    select id, nombre, nivel, score, puntos, recorridos_completados, calificacion_suma, calificacion_cantidad
    from mercado_cargadores
    where estado = 'activo' and disponibilidad = 'disponible'
    order by score desc, recorridos_completados desc, lower(nombre)
  `;
  return {
    cargadores: rows.map((row) => ({
      id: row.id,
      nombre: nombreVisible(row.nombre),
      nivel: row.nivel,
      puntos: row.puntos,
      score: num(row.score),
      recorridosCompletados: row.recorridos_completados,
      calificacion: row.calificacion_cantidad
        ? Math.round((row.calificacion_suma / row.calificacion_cantidad) * 10) / 10
        : null,
    })),
  };
}

export async function elegirCargador(ses: Sesion, clave: string, cargadorId: string, pedidoIds: string[]) {
  const comprador = await exigirComprador(ses);
  if (!clave) throw new MercadoError("Falta la clave de idempotencia.");
  const db = await sql();
  const previa = await db<{ respuesta: unknown }>`
    select respuesta from mercado_idempotencia
    where user_id = ${ses.userId} and clave = ${clave} and ruta = 'recorridos' limit 1
  `;
  if (previa[0]) return previa[0].respuesta;
  const cargador = await db<{ id: string; estado: string; disponibilidad: string }>`
    select id, estado, disponibilidad from mercado_cargadores where id = ${cargadorId} limit 1
  `;
  if (!cargador[0] || cargador[0].estado !== "activo" || cargador[0].disponibilidad !== "disponible") {
    throw new MercadoError("Ese cargador no está disponible.");
  }
  const unicos = [...new Set(pedidoIds)];
  if (unicos.length === 0) throw new MercadoError("Elegí al menos un pedido.");
  const pedidos = await db<{ id: string }>`
    select id from pedidos
    where comprador_mercado_id = ${comprador.id}
      and origen = 'mercado_al_toque'
      and estado <> 'anulado'
      and id = any(${unicos}::text[])
  `;
  if (pedidos.length !== unicos.length) throw new MercadoError("Hay un pedido que no es tuyo.", 403);
  const ocupados = await db<{ pedido_id: string }>`
    select pedido_id from mercado_recorrido_pedidos where pedido_id = any(${unicos}::text[])
  `;
  if (ocupados[0]) throw new MercadoError("Uno de esos pedidos ya tiene cargador.");
  const recorridoId = newId("rec");
  await db`
    insert into mercado_recorridos (id, comprador_id, cargador_id, estado)
    values (${recorridoId}, ${comprador.id}, ${cargadorId}, ${"asignado"})
  `;
  for (const pedido of pedidos) {
    await db`
      insert into mercado_recorrido_pedidos (recorrido_id, pedido_id, estado)
      values (${recorridoId}, ${pedido.id}, ${"asignado"})
    `;
  }
  const respuesta = { recorrido: await detalleRecorrido(recorridoId, { compradorId: comprador.id }) };
  await db`
    insert into mercado_idempotencia (user_id, clave, ruta, respuesta)
    values (${ses.userId}, ${clave}, ${"recorridos"}, ${JSON.stringify(respuesta)}::jsonb)
    on conflict (user_id, clave, ruta) do nothing
  `;
  return respuesta;
}

async function detalleRecorrido(id: string, filtro: { compradorId?: string; cargadorId?: string }) {
  const db = await sql();
  const rows = await db<{
    id: string;
    estado: string;
    comprador_id: string;
    cargador_id: string;
    comprador_nombre: string;
    comprador_telefono: string | null;
    cargador_nombre: string;
    created_at: string;
  }>`
    select r.id, r.estado, r.comprador_id, r.cargador_id, c.nombre as comprador_nombre,
           c.telefono as comprador_telefono, g.nombre as cargador_nombre, r.created_at::text
    from mercado_recorridos r
    join mercado_compradores c on c.id = r.comprador_id
    join mercado_cargadores g on g.id = r.cargador_id
    where r.id = ${id}
      and (${filtro.compradorId ?? null}::text is null or r.comprador_id = ${filtro.compradorId ?? null})
      and (${filtro.cargadorId ?? null}::text is null or r.cargador_id = ${filtro.cargadorId ?? null})
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new MercadoError("Ese recorrido no es tuyo.", 403);
  const paradas = await db<{
    pedido_id: string;
    estado: string;
    tenant_nombre: string;
    pedido_estado: string;
  }>`
    select rp.pedido_id, rp.estado, t.nombre as tenant_nombre, p.estado as pedido_estado
    from mercado_recorrido_pedidos rp
    join pedidos p on p.id = rp.pedido_id
    join tenants t on t.id = p.tenant_id
    where rp.recorrido_id = ${id}
  `;
  const paraCargador = Boolean(filtro.cargadorId);
  const paradasArmadas = await Promise.all(
    paradas.map(async (parada) => {
      const items = await db<{ nombre: string; cantidad: unknown; unidad: string }>`
        select nombre_snapshot as nombre, cantidad, unidad from pedido_items where pedido_id = ${parada.pedido_id}
      `;
      const lineas = items.map((item) => ({
        nombre: item.nombre,
        cantidad: num(item.cantidad),
        unidad: item.unidad,
      }));
      return {
        pedidoId: parada.pedido_id,
        puesto: parada.tenant_nombre,
        estado: parada.estado,
        preparado: parada.pedido_estado === "listo" || parada.pedido_estado === "cobrado",
        bultos: contarBultos(lineas),
        items: lineas,
      };
    }),
  );
  return {
    id: row.id,
    estado: row.estado,
    creadoEn: row.created_at,
    comprador: paraCargador ? nombreVisible(row.comprador_nombre) : row.comprador_nombre,
    telefono: paraCargador ? row.comprador_telefono : null,
    cargador: nombreVisible(row.cargador_nombre),
    bultos: paradasArmadas.reduce((suma, parada) => suma + parada.bultos, 0),
    paradas: paradasArmadas,
  };
}

export async function recorridosDe(ses: Sesion) {
  const db = await sql();
  if (ses.perfil === "comprador") {
    const comprador = await exigirComprador(ses);
    const ids = await db<{ id: string }>`
      select id from mercado_recorridos where comprador_id = ${comprador.id} order by created_at desc
    `;
    const recorridos = [];
    for (const row of ids) recorridos.push(await detalleRecorrido(row.id, { compradorId: comprador.id }));
    return { recorridos };
  }
  const cargador = await cargadorDe(ses.userId);
  if (!cargador) throw new MercadoError("No hay perfil de cargador.", 403);
  const ids = await db<{ id: string }>`
    select id from mercado_recorridos where cargador_id = ${cargador.id} order by created_at desc
  `;
  const recorridos = [];
  for (const row of ids) recorridos.push(await detalleRecorrido(row.id, { cargadorId: cargador.id }));
  return { recorridos };
}

async function exigirCargador(ses: Sesion) {
  if (ses.perfil !== "cargador") throw new MercadoError("Esta acción es del cargador.", 403);
  const cargador = await cargadorDe(ses.userId);
  if (!cargador || cargador.estado !== "activo") throw new MercadoError("Este cargador no puede operar.", 403);
  return cargador;
}

export async function aceptarRecorrido(ses: Sesion, clave: string, recorridoId: string) {
  const cargador = await exigirCargador(ses);
  return conIdempotencia(ses.userId, clave, `aceptar:${recorridoId}`, async () => {
    const db = await sql();
    const actual = await db<{ estado: string }>`
      select estado from mercado_recorridos where id = ${recorridoId} and cargador_id = ${cargador.id} limit 1
    `;
    if (!actual[0]) throw new MercadoError("Ese recorrido no es tuyo.", 403);
    if (actual[0].estado === "aceptado") return { ok: true };
    exigirTransicion(actual[0].estado, "aceptado");
    await db`
      update mercado_recorridos
      set estado = 'aceptado', accepted_at = now()
      where id = ${recorridoId}
    `;
    await db`
      update mercado_recorrido_pedidos
      set estado = 'aceptado', accepted_at = now()
      where recorrido_id = ${recorridoId} and estado = 'asignado'
    `;
    await db`
      update mercado_cargadores
      set recorridos_aceptados = recorridos_aceptados + 1
      where id = ${cargador.id}
    `;
    return { ok: true };
  });
}

export async function marcarParada(ses: Sesion, clave: string, recorridoId: string, pedidoId: string, siguiente: "retirado" | "entregado") {
  const cargador = await exigirCargador(ses);
  return conIdempotencia(ses.userId, clave, `${siguiente}:${recorridoId}:${pedidoId}`, async () => {
    const db = await sql();
    const rows = await db<{ estado: string; pedido_estado: string; prepared_at: string | null }>`
      select rp.estado, p.estado as pedido_estado, p.prepared_at::text
      from mercado_recorrido_pedidos rp
      join mercado_recorridos r on r.id = rp.recorrido_id
      join pedidos p on p.id = rp.pedido_id
      where rp.recorrido_id = ${recorridoId} and rp.pedido_id = ${pedidoId} and r.cargador_id = ${cargador.id}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new MercadoError("Esa parada no es tuya.", 403);
    if (row.estado === siguiente) return { ok: true };
    if (siguiente === "retirado" && row.pedido_estado !== "listo" && row.pedido_estado !== "cobrado") {
      throw new MercadoError("El puesto todavía no marcó el pedido como listo.");
    }
    exigirTransicion(row.estado, siguiente);
    if (siguiente === "retirado") {
      await db`
        update mercado_recorrido_pedidos set estado = 'retirado', picked_up_at = now()
        where recorrido_id = ${recorridoId} and pedido_id = ${pedidoId}
      `;
      await db`update pedidos set picked_up_at = now() where id = ${pedidoId} and picked_up_at is null`;
      await db`update mercado_cargadores set pedidos_retirados = pedidos_retirados + 1 where id = ${cargador.id}`;
    } else {
      await db`
        update mercado_recorrido_pedidos set estado = 'entregado', delivered_at = now()
        where recorrido_id = ${recorridoId} and pedido_id = ${pedidoId}
      `;
      await db`update pedidos set delivered_at = now() where id = ${pedidoId} and delivered_at is null`;
      await db`update mercado_cargadores set pedidos_entregados = pedidos_entregados + 1 where id = ${cargador.id}`;
    }
    await cerrarRecorridoSiCorresponde(recorridoId, cargador.id);
    return { ok: true };
  });
}

async function cerrarRecorridoSiCorresponde(recorridoId: string, cargadorId: string) {
  const db = await sql();
  const pendientes = await db<{ n: number }>`
    select count(*)::int as n from mercado_recorrido_pedidos
    where recorrido_id = ${recorridoId} and estado <> 'entregado'
  `;
  if (num(pendientes[0]?.n) > 0) {
    const faltanRetiro = await db<{ n: number }>`
      select count(*)::int as n from mercado_recorrido_pedidos
      where recorrido_id = ${recorridoId} and estado in ('asignado', 'aceptado')
    `;
    if (num(faltanRetiro[0]?.n) === 0) {
      await db`update mercado_recorridos set estado = 'retirado' where id = ${recorridoId} and estado = 'aceptado'`;
    }
    return;
  }
  const ya = await db<{ estado: string }>`select estado from mercado_recorridos where id = ${recorridoId} limit 1`;
  if (ya[0]?.estado === "entregado") return;
  await db`
    update mercado_recorridos set estado = 'entregado', delivered_at = now() where id = ${recorridoId}
  `;
  await db`
    update mercado_cargadores set recorridos_completados = recorridos_completados + 1 where id = ${cargadorId}
  `;
  await sumarPuntos(cargadorId, "entrega_completada", recorridoId);
  await refrescarScore(cargadorId);
}

export async function rechazarRecorrido(ses: Sesion, clave: string, recorridoId: string) {
  const cargador = await exigirCargador(ses);
  return conIdempotencia(ses.userId, clave, `rechazar:${recorridoId}`, async () => {
    const db = await sql();
    const actual = await db<{ estado: string }>`
      select estado from mercado_recorridos where id = ${recorridoId} and cargador_id = ${cargador.id} limit 1
    `;
    if (!actual[0]) throw new MercadoError("Ese recorrido no es tuyo.", 403);
    if (actual[0].estado === "cancelado") return { ok: true };
    exigirTransicion(actual[0].estado, "cancelado");
    await db`update mercado_recorridos set estado = 'cancelado' where id = ${recorridoId}`;
    await db`
      update mercado_recorrido_pedidos set estado = 'cancelado'
      where recorrido_id = ${recorridoId}
    `;
    await db`delete from mercado_recorrido_pedidos where recorrido_id = ${recorridoId}`;
    await db`update mercado_cargadores set cancelaciones = cancelaciones + 1 where id = ${cargador.id}`;
    await sumarPuntos(cargador.id, "cancelacion", recorridoId);
    await refrescarScore(cargador.id);
    return { ok: true };
  });
}

export async function calificar(ses: Sesion, recorridoId: string, estrellas: number, comentario: string) {
  const comprador = await exigirComprador(ses);
  if (estrellas < 1 || estrellas > 5) throw new MercadoError("La calificación es de 1 a 5.");
  const db = await sql();
  const recorrido = await db<{ estado: string; cargador_id: string }>`
    select estado, cargador_id from mercado_recorridos
    where id = ${recorridoId} and comprador_id = ${comprador.id} limit 1
  `;
  if (!recorrido[0]) throw new MercadoError("Ese recorrido no es tuyo.", 403);
  const previa = await db<{ id: string }>`select id from mercado_calificaciones where recorrido_id = ${recorridoId} limit 1`;
  if (!puedeCalificar(recorrido[0].estado, Boolean(previa[0]))) {
    throw new MercadoError(previa[0] ? "Esa entrega ya fue calificada." : "Todavía no se puede calificar.");
  }
  await db`
    insert into mercado_calificaciones (id, recorrido_id, comprador_id, cargador_id, estrellas, comentario)
    values (
      ${newId("cal")}, ${recorridoId}, ${comprador.id}, ${recorrido[0].cargador_id},
      ${estrellas}, ${comentario.trim() || null}
    )
  `;
  await db`
    update mercado_cargadores
    set calificacion_suma = calificacion_suma + ${estrellas},
        calificacion_cantidad = calificacion_cantidad + 1
    where id = ${recorrido[0].cargador_id}
  `;
  if (estrellas >= 4) await sumarPuntos(recorrido[0].cargador_id, "buena_calificacion", recorridoId);
  await refrescarScore(recorrido[0].cargador_id);
  return { ok: true };
}

export async function disponibilidad(ses: Sesion, valor: string) {
  const cargador = await exigirCargador(ses);
  if (valor !== "disponible" && valor !== "no_disponible") throw new MercadoError("La disponibilidad no es válida.");
  const db = await sql();
  await db`update mercado_cargadores set disponibilidad = ${valor} where id = ${cargador.id}`;
  return resumenCargador(ses.userId);
}

export async function ranking() {
  const db = await sql();
  const rows = await db<{ nombre: string; nivel: string; puntos: number; score: unknown; recorridos_completados: number }>`
    select nombre, nivel, puntos, score, recorridos_completados
    from mercado_cargadores
    where estado = 'activo'
    order by score desc, recorridos_completados desc
    limit 20
  `;
  return {
    ranking: rows.map((row, index) => ({
      puesto: index + 1,
      nombre: nombreVisible(row.nombre),
      nivel: row.nivel,
      puntos: row.puntos,
      score: num(row.score),
      recorridosCompletados: row.recorridos_completados,
    })),
  };
}

async function conIdempotencia<T>(userId: string, clave: string, ruta: string, trabajo: () => Promise<T>) {
  if (!clave) throw new MercadoError("Falta la clave de idempotencia.");
  const db = await sql();
  const previa = await db<{ respuesta: T }>`
    select respuesta from mercado_idempotencia
    where user_id = ${userId} and clave = ${clave} and ruta = ${ruta} limit 1
  `;
  if (previa[0]) return previa[0].respuesta;
  const respuesta = await trabajo();
  await db`
    insert into mercado_idempotencia (user_id, clave, ruta, respuesta)
    values (${userId}, ${clave}, ${ruta}, ${JSON.stringify(respuesta)}::jsonb)
    on conflict (user_id, clave, ruta) do nothing
  `;
  return respuesta;
}

async function sumarPuntos(cargadorId: string, codigo: string, referencia: string) {
  const db = await sql();
  const reglas = await db<{ puntos: number }>`select puntos from mercado_punto_reglas where codigo = ${codigo} limit 1`;
  const puntos = reglas[0]?.puntos;
  if (puntos == null) return;
  const inserted = await db<{ id: string }>`
    insert into mercado_punto_movimientos (id, cargador_id, codigo, puntos, referencia)
    values (${newId("pto")}, ${cargadorId}, ${codigo}, ${puntos}, ${referencia})
    on conflict (cargador_id, codigo, referencia) do nothing
    returning id
  `;
  if (!inserted[0]) return;
  await db`update mercado_cargadores set puntos = puntos + ${puntos} where id = ${cargadorId}`;
  const actual = await db<{ puntos: number; nivel: string }>`
    select puntos, nivel from mercado_cargadores where id = ${cargadorId} limit 1
  `;
  const niveles = await db<{ codigo: string; puntos_minimos: number }>`
    select codigo, puntos_minimos from mercado_niveles
  `;
  const nivel = nivelPara(
    actual[0]?.puntos ?? 0,
    niveles.map((n) => ({ codigo: n.codigo, puntosMinimos: n.puntos_minimos })),
  );
  if (actual[0] && actual[0].nivel !== nivel) {
    await db`update mercado_cargadores set nivel = ${nivel} where id = ${cargadorId}`;
    await db`
      insert into mercado_nivel_historial (id, cargador_id, nivel)
      values (${newId("nv")}, ${cargadorId}, ${nivel})
    `;
  }
}

async function refrescarScore(cargadorId: string) {
  const db = await sql();
  const rows = await db<{
    calificacion_suma: number;
    calificacion_cantidad: number;
    recorridos_completados: number;
    entregas_a_tiempo: number;
    cancelaciones: number;
  }>`
    select calificacion_suma, calificacion_cantidad, recorridos_completados, entregas_a_tiempo, cancelaciones
    from mercado_cargadores where id = ${cargadorId} limit 1
  `;
  const row = rows[0];
  if (!row) return;
  const score = calcularScore({
    calificacionSuma: row.calificacion_suma,
    calificacionCantidad: row.calificacion_cantidad,
    recorridosCompletados: row.recorridos_completados,
    entregasATiempo: row.entregas_a_tiempo,
    cancelaciones: row.cancelaciones,
  });
  await db`update mercado_cargadores set score = ${score} where id = ${cargadorId}`;
}
