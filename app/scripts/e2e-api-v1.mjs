// Suite e2e de caracterización del contrato HTTP /api/v1 (Fase 0/1).
//
// Requiere el dev server corriendo contra la base DEV de Neon:
//   terminal 1:  npm run dev
//   terminal 2:  npm run test:e2e
//
// Cubre autenticación Bearer, matriz de permisos por rol, aislamiento de
// tenant, idempotencia (client_uuid), cobros y anulaciones, cuenta corriente,
// remitos, proveedores, caja, auditoría, suscripción/contratos + legal del
// canal (torre), facturación ARCA (config/emisión sin credenciales reales),
// mensajería del pedido, portal de clientes (registro, catálogo, pedidos
// propios, comprobante y mensajes) y Mercado al Toque (avisos públicos,
// cancelación de pedido con restitución de reserva y condición comercial
// congelada en pedidos.condicion).
// Los datos que crea se limpian en `after` tomando el reloj de la base
// (runStart) como referencia, para no tocar el seed demo. Las versiones
// publicadas y las aceptaciones legales son inmutables por diseño (trigger
// 0013): la suite publica una única vez los documentos seed de torre y las
// aceptaciones quedan en DEV (filas chicas, dedupe por índices únicos).

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env local: se usan las variables del shell.
}

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";
const TENANT = "frutas-roman";
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "roman2026";

const DEMO_USERS = [
  { email: "dueno@frutasroman.com", nombre: "Román Quispe", rol: "admin" },
  { email: "caja@frutasroman.com", nombre: "Lucía Ferreyra", rol: "cajero" },
  { email: "venta@frutasroman.com", nombre: "Maxi Gómez", rol: "vendedor" },
];

const state = {
  pool: null,
  runStart: null,
  tokenList: [],
  tokens: {},
  staffIds: {},
  banana: null,
  morron: null,
  bananaStock0: null,
  morronStock0: null,
  e2eProductoId: null,
  e2eClienteId: null,
  e2eProveedorId: null,
  foreignTenantId: null,
  msgClienteId: null,
  msgForeignTenantId: null,
  legalDraftIds: [],
  mercadoUsuarioIds: [],
  portalUserIds: [],
  marcaNombre0: null,
  marcaConfig0: null,
  afipConfigPrev: undefined,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function approx(actual, expected, msg) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) < 0.001,
    msg ?? `esperaba ${expected} (±0.001), recibí ${actual}`,
  );
}

const round2 = (n) => Math.round(n * 100) / 100;

async function request(method, path, { token, body, headers } = {}) {
  const url = path.startsWith("http") ? path : new URL(path, BASE).toString();
  const init = { method, headers: { ...(headers ?? {}) } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

const api = (method, path, opts) => request(method, `/api/v1${path}`, opts);

async function signIn(email, password = DEMO_PASSWORD) {
  // Better Auth exige `Origin` en POST con credenciales (CSRF); la propia
  // base del servidor siempre está en trustedOrigins.
  const res = await request("POST", "/api/auth/sign-in/email", {
    body: { email, password },
    headers: { origin: BASE },
  });
  assert.equal(res.status, 200, `sign-in ${email} devolvió ${res.status}: ${JSON.stringify(res.data)}`);
  assert.ok(res.data?.token, `sign-in ${email} no devolvió token`);
  state.tokenList.push(res.data.token);
  return res.data.token;
}

async function stockOf(productoId) {
  const { rows } = await state.pool.query("select stock from productos where id = $1", [productoId]);
  assert.ok(rows[0], `producto ${productoId} no existe en la base`);
  return Number(rows[0].stock);
}

function expectError(res, status, pattern) {
  assert.equal(res.status, status, `esperaba ${status}, recibí ${res.status}: ${JSON.stringify(res.data)}`);
  if (pattern) {
    const message = typeof res.data?.message === "string" ? res.data.message : "";
    assert.match(message, pattern, `mensaje inesperado: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function ensureDemoAuthUsers() {
  for (const user of DEMO_USERS) {
    const existing = await state.pool.query('select id from "user" where email = $1', [user.email]);
    if (existing.rows[0]) continue;
    const userId = randomUUID();
    const now = new Date().toISOString();
    await state.pool.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, $4::timestamptz, $4::timestamptz)`,
      [userId, user.nombre, user.email, now],
    );
    const hash = await hashPassword(DEMO_PASSWORD);
    await state.pool.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $3, $4, $5::timestamptz, $5::timestamptz)`,
      [randomUUID(), user.email, userId, hash, now],
    );
  }
}

describe("e2e /api/v1 — caracterización Fase 0/1", () => {
  before(async () => {
    assert.ok(
      process.env.DATABASE_URL,
      "Falta DATABASE_URL. Cargá app/.env o exportala; la suite toca la base DEV directamente.",
    );
    state.pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await state.pool.query("select 1");

    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        await fetch(new URL("/api/v1/session", BASE));
        break;
      } catch (error) {
        if (Date.now() > deadline) {
          throw new Error(`El dev server no responde en ${BASE}. Corré "npm run dev" primero. (${error.message})`);
        }
        await sleep(500);
      }
    }

    await ensureDemoAuthUsers();
    const { rows } = await state.pool.query("select now() as now");
    state.runStart = new Date(rows[0].now).toISOString();
  });

  after(async () => {
    const pool = state.pool;
    if (!pool) return;
    try {
      if (state.runStart) {
        const t = TENANT;
        const s = state.runStart;
        // (a) revertir el efecto en stock y borrar movimientos de la corrida.
        await pool.query(
          `update productos p
              set stock = p.stock - agg.total
             from (
               select producto_id, sum(cantidad) as total
                 from stock_movimientos
                where tenant_id = $1 and created_at >= $2::timestamptz
                group by producto_id
             ) agg
            where p.id = agg.producto_id and p.tenant_id = $1`,
          [t, s],
        );
        await pool.query("delete from stock_movimientos where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);

        // (b) reabrir el cierre capturado y borrar los cierres de la corrida.
        if (state.cierreId) {
          await pool.query(
            `update cierres_caja
                set cerrado_at = null, esperado = null, real = null,
                    diferencia = null, totales = null, notas = null
              where id = $1 and tenant_id = $2`,
            [state.cierreId, t],
          );
        }
        await pool.query("delete from cierres_caja where tenant_id = $1 and abierto_at >= $2::timestamptz", [t, s]);

        // (c) ventas y remitos de la corrida.
        await pool.query("delete from cuenta_movimientos where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);
        await pool.query("delete from tickets where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);
        await pool.query("delete from cobros where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);
        await pool.query("delete from pedidos where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);
        await pool.query("delete from remitos where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);

        // (d) producto de prueba.
        if (state.e2eProductoId) {
          await pool.query("delete from productos where id = $1 and tenant_id = $2", [state.e2eProductoId, t]);
        }

        // (e) alertas y auditoría de la corrida.
        await pool.query("delete from alertas where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);
        await pool.query("delete from auditoria where tenant_id = $1 and created_at >= $2::timestamptz", [t, s]);

        // (f) cliente de prueba (cuenta_movimientos primero: no tiene cascade).
        if (state.e2eClienteId) {
          await pool.query("delete from cuenta_movimientos where cliente_id = $1", [state.e2eClienteId]);
          await pool.query("delete from clientes where id = $1 and tenant_id = $2", [state.e2eClienteId, t]);
        }

        // (h) proveedor de prueba (los remitos de la corrida ya se borraron en (c)).
        if (state.e2eProveedorId) {
          await pool.query("delete from proveedores where id = $1 and tenant_id = $2", [state.e2eProveedorId, t]);
        }

        // (g) tenant ajeno de la prueba de aislamiento.
        if (state.foreignTenantId) {
          await pool.query("delete from pedidos where tenant_id = $1", [state.foreignTenantId]);
          await pool.query("delete from productos where tenant_id = $1", [state.foreignTenantId]);
          await pool.query("delete from tenants where id = $1", [state.foreignTenantId]);
        }

        // (i) borradores legales creados para el caso "versión obsoleta"
        // (los borradores sí se pueden borrar; los publicados son inmutables).
        if (state.legalDraftIds.length) {
          await pool.query(
            "delete from torre.saas_legal_versions where id = any($1::text[]) and status = 'draft'",
            [state.legalDraftIds],
          );
        }

        // (j) usuarios y sesiones de Mercado creados por la corrida. Las
        // aceptaciones legales quedan: son inmutables por trigger y quedan
        // atadas a usuarios que ya no existen (sin efecto funcional).
        if (state.mercadoUsuarioIds.length) {
          await pool.query("delete from mercado_sesiones where usuario_id = any($1::text[])", [
            state.mercadoUsuarioIds,
          ]);
          await pool.query("delete from mercado_credenciales where usuario_id = any($1::text[])", [
            state.mercadoUsuarioIds,
          ]);
          await pool.query("delete from mercado_compradores where id = any($1::text[])", [
            state.mercadoUsuarioIds,
          ]);
          await pool.query("delete from mercado_cargadores where id = any($1::text[])", [
            state.mercadoUsuarioIds,
          ]);
        }

        // (k) auditoría de operaciones de Mercado de la corrida.
        await pool.query("delete from auditoria where tenant_id = 'mercado' and created_at >= $1::timestamptz", [s]);

        // (m) configuración ARCA: el test 20 pisa la fila con upsert; se
        // restaura el estado previo (o se borra la fila si no existía).
        if (state.afipConfigPrev !== undefined) {
          if (state.afipConfigPrev) {
            const p = state.afipConfigPrev;
            await pool.query(
              `update afip_config set cuit = $2, razon_social = $3, domicilio = $4, condicion = $5,
                      punto_venta = $6, inicio_actividades = $7, iibb = $8, alicuota = $9,
                      ambiente = $10, cert_pem = $11, key_pem = $12, habilitada = $13, updated_at = now()
                where tenant_id = $1`,
              [
                t, p.cuit, p.razon_social, p.domicilio, p.condicion, p.punto_venta,
                p.inicio_actividades, p.iibb, p.alicuota, p.ambiente, p.cert_pem, p.key_pem, p.habilitada,
              ],
            );
          } else {
            await pool.query("delete from afip_config where tenant_id = $1", [t]);
          }
        }
      }

      // (h) sesiones creadas por la suite.
      if (state.tokenList.length) {
        await pool.query('delete from "session" where token = any($1::text[])', [state.tokenList]);
      }

      // (l) restaurar la marca del tenant si el test 17 la modificó.
      if (state.marcaNombre0 !== null) {
        await pool.query("update tenants set nombre = $1, config = $2::jsonb where id = $3", [
          state.marcaNombre0,
          state.marcaConfig0,
          TENANT,
        ]);
      }

      // (n) mensajería del test 21: cliente de prueba y tenant ajeno propio.
      // El pedido ajeno referencia al cliente del tenant principal (para poder
      // llegar al chequeo de tenant), así que se borra antes que el cliente.
      if (state.msgForeignTenantId) {
        await pool.query("delete from pedidos where tenant_id = $1", [state.msgForeignTenantId]);
        await pool.query("delete from clientes where tenant_id = $1", [state.msgForeignTenantId]);
        await pool.query("delete from tenants where id = $1", [state.msgForeignTenantId]);
      }
      if (state.msgClienteId) {
        await pool.query("delete from cuenta_movimientos where cliente_id = $1", [state.msgClienteId]);
        await pool.query("delete from clientes where id = $1 and tenant_id = $2", [state.msgClienteId, TENANT]);
      }

      // (o) usuarios del portal de clientes del test 22: ficha, credential y
      // user. Sus pedidos/movimientos/mensajes/alertas ya se borraron con
      // (c)/(e) y las sesiones con (h).
      if (state.portalUserIds.length) {
        await pool.query("delete from clientes where user_id = any($1::text[])", [state.portalUserIds]);
        await pool.query('delete from account where "userId" = any($1::text[])', [state.portalUserIds]);
        await pool.query('delete from "user" where id = any($1::text[])', [state.portalUserIds]);
      }
    } finally {
      await pool.end();
    }
  });

  it("1. sin token o con token inválido devuelve 401 unauthorized", async () => {
    const anon = await api("GET", "/session");
    expectError(anon, 401, null);
    assert.equal(anon.data.error, "unauthorized");

    const garbage = await api("GET", "/session", { token: "no-es-un-token" });
    expectError(garbage, 401, null);
    assert.equal(garbage.data.error, "unauthorized");
  });

  it("2. login de los 3 roles y forma de /session", async () => {
    state.tokens.admin = await signIn("dueno@frutasroman.com");
    state.tokens.cajero = await signIn("caja@frutasroman.com");
    state.tokens.vendedor = await signIn("venta@frutasroman.com");

    const session = await api("GET", "/session", { token: state.tokens.admin });
    assert.equal(session.status, 200);
    assert.equal(session.data.tenantId, TENANT);
    assert.deepEqual(Object.keys(session.data.staff).sort(), ["id", "nombre", "rol"]);
    assert.equal(session.data.staff.rol, "admin");
    assert.ok(session.data.staff.nombre.length > 0);
    assert.match(session.headers.get("vary") ?? "", /authorization/i);
    state.staffIds.admin = session.data.staff.id;

    for (const rol of ["cajero", "vendedor"]) {
      const res = await api("GET", "/session", { token: state.tokens[rol] });
      assert.equal(res.status, 200);
      assert.equal(res.data.staff.rol, rol);
      state.staffIds[rol] = res.data.staff.id;
    }

    const missing = await api("GET", "/no-existe", { token: state.tokens.admin });
    expectError(missing, 404, null);
    assert.equal(missing.data.error, "not_found");
  });

  it("3. sign-out revoca la sesión Bearer", async () => {
    const token = await signIn("venta@frutasroman.com");
    const before = await api("GET", "/session", { token });
    assert.equal(before.status, 200);

    const out = await request("POST", "/api/auth/sign-out", {
      token,
      body: {},
      headers: { origin: BASE },
    });
    assert.ok([200, 204].includes(out.status), `sign-out devolvió ${out.status}`);

    const after = await api("GET", "/session", { token });
    expectError(after, 401, null);
  });

  it("4. matriz de permisos: vendedor/cajero no acceden a módulos de gestión", async () => {
    const vendedor = state.tokens.vendedor;

    for (const path of ["/caja", "/auditoria", "/usuarios", "/dashboard"]) {
      const res = await api("GET", path, { token: vendedor });
      expectError(res, 403, /permiso/i);
      assert.equal(res.data.error, "forbidden");
    }

    const producto = await api("POST", "/productos", {
      token: vendedor,
      body: {
        nombre: "No debería crearse",
        unidad: "bulto",
        unidadLabel: "bulto",
        precio: 1,
        stockMinimo: 0,
        alias: [],
      },
    });
    expectError(producto, 403, /permiso/i);

    const cobro = await api("POST", "/pedidos/ped-nope/cobrar", {
      token: vendedor,
      body: { clientUuid: `e2e-${randomUUID()}`, formaPago: "efectivo" },
    });
    expectError(cobro, 403, /permiso/i);

    const cuenta = await api("GET", "/clientes/cli-nope/cuenta", { token: state.tokens.cajero });
    expectError(cuenta, 403, /permiso/i);

    const usuarios = await api("GET", "/usuarios", { token: state.tokens.admin });
    assert.equal(usuarios.status, 200);
    assert.ok(Array.isArray(usuarios.data.data));
    assert.ok(usuarios.data.data.some((u) => u.email === "venta@frutasroman.com"));
  });

  it("5. catálogo: ETag, sincronización incremental y alta/baja de producto", async () => {
    const res = await api("GET", "/catalogo", { token: state.tokens.admin });
    assert.equal(res.status, 200);
    const productos = res.data.data;
    const version = res.data.version;
    assert.ok(typeof version === "string" && version.length > 0, "catálogo sin version");

    state.banana = productos.find((p) => p.nombre === "Banana Ecuador");
    state.morron = productos.find((p) => p.nombre === "Morrón rojo");
    assert.ok(state.banana, "no está Banana Ecuador en el catálogo demo");
    assert.ok(state.morron, "no está Morrón rojo en el catálogo demo");
    state.bananaStock0 = state.banana.stock;
    state.morronStock0 = state.morron.stock;

    const etag = res.headers.get("etag");
    assert.equal(etag, `"${version}"`);

    const notModified = await api("GET", "/catalogo", {
      token: state.tokens.admin,
      headers: { "if-none-match": etag },
    });
    assert.equal(notModified.status, 304);

    const since = encodeURIComponent(version);
    const alDia = await api("GET", `/catalogo?since=${since}`, { token: state.tokens.admin });
    assert.equal(alDia.status, 200);
    assert.equal(alDia.data.data.length, 0, "since=version no debería traer filas");

    const alta = await api("POST", "/productos", {
      token: state.tokens.admin,
      body: {
        nombre: "Producto E2E",
        unidad: "bulto",
        unidadLabel: "bulto",
        precio: 1234.5,
        stockMinimo: 0,
        alias: [],
        stockInicial: 3,
      },
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.data));
    state.e2eProductoId = alta.data.data.id;
    assert.ok(state.e2eProductoId);

    approx(await stockOf(state.e2eProductoId), 3, "stockInicial no aplicado");

    const delta = await api("GET", `/catalogo?since=${since}`, { token: state.tokens.admin });
    assert.equal(delta.status, 200);
    const nuevo = delta.data.data.find((p) => p.id === state.e2eProductoId);
    assert.ok(nuevo, "el producto nuevo no aparece en la sincronización incremental");
    approx(nuevo.stock, 3);

    const baja = await api("POST", `/productos/${state.e2eProductoId}/baja`, { token: state.tokens.admin });
    assert.equal(baja.status, 200);
    assert.equal(baja.data.data.ok, true);
  });

  it("6. pedido del vendedor: alta idempotente y validaciones de cobro", async () => {
    const clientUuid = `e2e-${randomUUID()}`;
    const alta = await api("POST", "/pedidos", {
      token: state.tokens.vendedor,
      body: {
        clientUuid,
        clienteNombre: "Mostrador",
        items: [{ productoId: state.banana.id, cantidad: 2 }],
      },
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.data));
    const pedido = alta.data.data;
    state.p1 = pedido;
    assert.equal(pedido.estado, "enviado");
    assert.equal(pedido.clientUuid, clientUuid);
    assert.equal(pedido.vendedorId, state.staffIds.vendedor);
    approx(pedido.total, round2(2 * state.banana.precio));

    approx(await stockOf(state.banana.id), state.bananaStock0, "crear pedido no debe mover stock");

    const retry = await api("POST", "/pedidos", {
      token: state.tokens.vendedor,
      body: {
        clientUuid,
        clienteNombre: "Mostrador",
        items: [{ productoId: state.banana.id, cantidad: 2 }],
      },
    });
    assert.equal(retry.status, 201);
    assert.equal(retry.data.data.id, pedido.id, "reintento con client_uuid no debe duplicar");

    const mios = await api("GET", "/pedidos?mine=1", { token: state.tokens.vendedor });
    assert.equal(mios.status, 200);
    assert.ok(mios.data.data.some((p) => p.id === pedido.id));

    const enviados = await api("GET", "/pedidos?estados=enviado", { token: state.tokens.vendedor });
    assert.equal(enviados.status, 200);
    assert.ok(enviados.data.data.some((p) => p.id === pedido.id));

    const detalle = await api("GET", `/pedidos/${pedido.id}`, { token: state.tokens.admin });
    assert.equal(detalle.status, 200);
    assert.equal(detalle.data.data.items.length, 1);
    assert.equal(detalle.data.data.items[0].productoId, state.banana.id);
    approx(detalle.data.data.items[0].cantidad, 2);

    const inexistente = await api("GET", "/pedidos/ped-no-existe", { token: state.tokens.admin });
    expectError(inexistente, 404, null);

    const ccSinCliente = await api("POST", `/pedidos/${pedido.id}/cobrar`, {
      token: state.tokens.cajero,
      body: { clientUuid: `e2e-${randomUUID()}`, formaPago: "cuenta_corriente" },
    });
    expectError(ccSinCliente, 400, /cuenta corriente/i);
    approx(await stockOf(state.banana.id), state.bananaStock0);
  });

  it("7. cobro en efectivo: ticket, vuelto y doble cobro rechazado", async () => {
    const cobroUuid = `e2e-${randomUUID()}`;
    const recibido = state.p1.total + 500;
    const cobro = await api("POST", `/pedidos/${state.p1.id}/cobrar`, {
      token: state.tokens.cajero,
      body: { clientUuid: cobroUuid, formaPago: "efectivo", montoRecibido: recibido },
    });
    assert.equal(cobro.status, 200, JSON.stringify(cobro.data));
    const c = cobro.data.data;
    state.cobroId = c.cobroId;
    state.ticketNumero = c.numero;
    assert.ok(c.cobroId && c.ticketId);
    assert.ok(Number.isInteger(c.numero) && c.numero >= 1040, `número de ticket inesperado: ${c.numero}`);
    approx(c.vuelto, 500);
    approx(c.total, state.p1.total);

    const detalle = await api("GET", `/pedidos/${state.p1.id}`, { token: state.tokens.admin });
    assert.equal(detalle.data.data.estado, "cobrado");
    approx(await stockOf(state.banana.id), state.bananaStock0 - 2, "el cobro debe descontar stock");

    const retry = await api("POST", `/pedidos/${state.p1.id}/cobrar`, {
      token: state.tokens.cajero,
      body: { clientUuid: cobroUuid, formaPago: "efectivo", montoRecibido: recibido },
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.data.data.cobroId, c.cobroId, "reintento con client_uuid no debe recobrar");
    assert.equal(retry.data.data.numero, c.numero);
    approx(await stockOf(state.banana.id), state.bananaStock0 - 2, "el reintento no debe mover stock");

    const otroUuid = await api("POST", `/pedidos/${state.p1.id}/cobrar`, {
      token: state.tokens.cajero,
      body: { clientUuid: `e2e-${randomUUID()}`, formaPago: "efectivo" },
    });
    expectError(otroUuid, 400, /ya está cobrado/i);

    const ticket = await api("GET", `/cobros/${c.cobroId}/ticket`, { token: state.tokens.admin });
    assert.equal(ticket.status, 200);
    assert.equal(ticket.data.data.numero, c.numero);
    assert.equal(ticket.data.data.contenido.cliente, "Mostrador");
    approx(ticket.data.data.contenido.total, state.p1.total);
    approx(ticket.data.data.contenido.vuelto, 500);
    assert.equal(ticket.data.data.contenido.items[0].cantidad, 2);
  });

  it("8. entregar y anular pedido: stock restituido y anulación idempotente", async () => {
    const entrega = await api("POST", `/pedidos/${state.p1.id}/entregar`, { token: state.tokens.vendedor });
    assert.equal(entrega.status, 200);
    assert.equal(entrega.data.data.ok, true);
    const entregado = await api("GET", `/pedidos/${state.p1.id}`, { token: state.tokens.admin });
    assert.equal(entregado.data.data.estado, "entregado");

    const anulacion = await api("POST", `/pedidos/${state.p1.id}/anular`, {
      token: state.tokens.admin,
      body: { motivo: "Prueba e2e" },
    });
    assert.equal(anulacion.status, 200);
    assert.equal(anulacion.data.data.estado, "anulado");
    approx(await stockOf(state.banana.id), state.bananaStock0, "anular debe restituir el stock");

    const cobro = await state.pool.query("select anulado from cobros where id = $1", [state.cobroId]);
    assert.equal(cobro.rows[0].anulado, true);

    const reanular = await api("POST", `/pedidos/${state.p1.id}/anular`, {
      token: state.tokens.admin,
      body: { motivo: "Otra vez" },
    });
    assert.equal(reanular.status, 200);
    assert.equal(reanular.data.data.estado, "anulado");

    const cobrar = await api("POST", `/pedidos/${state.p1.id}/cobrar`, {
      token: state.tokens.cajero,
      body: { clientUuid: `e2e-${randomUUID()}`, formaPago: "efectivo" },
    });
    expectError(cobrar, 400, /anulado/i);
  });

  it("9. cuenta corriente: cargo, saldo y reverso por anulación", async () => {
    const alta = await api("POST", "/clientes", {
      token: state.tokens.admin,
      body: { nombre: "Cliente E2E CC", telefono: "1100000000", cuentaCorriente: true },
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.data));
    state.e2eClienteId = alta.data.data.id;

    const pedido = await api("POST", "/pedidos", {
      token: state.tokens.vendedor,
      body: {
        clientUuid: `e2e-${randomUUID()}`,
        clienteId: state.e2eClienteId,
        clienteNombre: "Cliente E2E CC",
        items: [{ productoId: state.morron.id, cantidad: 1 }],
      },
    });
    assert.equal(pedido.status, 201);
    state.p2 = pedido.data.data;
    approx(state.p2.total, round2(state.morron.precio));

    const entregarAntes = await api("POST", `/pedidos/${state.p2.id}/entregar`, { token: state.tokens.vendedor });
    expectError(entregarAntes, 400, /ya cobrado/i);

    const cobro = await api("POST", `/pedidos/${state.p2.id}/cobrar`, {
      token: state.tokens.cajero,
      body: { clientUuid: `e2e-${randomUUID()}`, formaPago: "cuenta_corriente" },
    });
    assert.equal(cobro.status, 200, JSON.stringify(cobro.data));
    state.cobroId2 = cobro.data.data.cobroId;
    approx(cobro.data.data.vuelto, 0);

    const negado = await api("GET", `/clientes/${state.e2eClienteId}/cuenta`, { token: state.tokens.cajero });
    expectError(negado, 403, /permiso/i);

    const cuenta = await api("GET", `/clientes/${state.e2eClienteId}/cuenta`, { token: state.tokens.admin });
    assert.equal(cuenta.status, 200);
    approx(cuenta.data.data.saldo, state.p2.total);
    assert.equal(cuenta.data.data.movimientos[0].tipo, "cargo");
    approx(cuenta.data.data.movimientos[0].monto, state.p2.total);

    const anular = await api("POST", `/cobros/${state.cobroId2}/anular`, {
      token: state.tokens.admin,
      body: { motivo: "Anulación e2e" },
    });
    assert.equal(anular.status, 200);
    assert.equal(anular.data.data.ok, true);
    approx(await stockOf(state.morron.id), state.morronStock0, "anular el cobro debe restituir stock");

    const cuentaLuego = await api("GET", `/clientes/${state.e2eClienteId}/cuenta`, { token: state.tokens.admin });
    approx(cuentaLuego.data.data.saldo, 0);
    assert.equal(cuentaLuego.data.data.movimientos[0].tipo, "reverso");
    approx(cuentaLuego.data.data.movimientos[0].monto, -state.p2.total);

    const reanular = await api("POST", `/cobros/${state.cobroId2}/anular`, {
      token: state.tokens.admin,
      body: { motivo: "Otra vez" },
    });
    expectError(reanular, 400, /ya está anulada/i);
  });

  it("10. ajuste y merma de stock: solo admin/cajero", async () => {
    const negado = await api("POST", "/stock/ajuste", {
      token: state.tokens.vendedor,
      body: { productoId: state.banana.id, cantidad: 1, tipo: "ajuste", motivo: "No permitido" },
    });
    expectError(negado, 403, /permiso/i);

    const antes = await stockOf(state.banana.id);
    const ajuste = await api("POST", "/stock/ajuste", {
      token: state.tokens.cajero,
      body: { productoId: state.banana.id, cantidad: 3, tipo: "ajuste", motivo: "Ajuste e2e" },
    });
    assert.equal(ajuste.status, 200);
    assert.equal(ajuste.data.data.ok, true);
    approx(await stockOf(state.banana.id), antes + 3);

    const merma = await api("POST", "/stock/ajuste", {
      token: state.tokens.cajero,
      body: { productoId: state.banana.id, cantidad: 2, tipo: "merma", motivo: "Merma e2e" },
    });
    assert.equal(merma.status, 200);
    approx(await stockOf(state.banana.id), antes + 1, "la merma descuenta en valor absoluto");
  });

  it("11. remito: alta, confirmación de líneas e ingreso de stock sin duplicar", async () => {
    const alta = await api("POST", "/remitos", {
      token: state.tokens.admin,
      body: {
        proveedor: "Proveedor E2E",
        fuente: "manual",
        lineas: [{ descripcion: state.banana.nombre, cantidad: 5 }],
      },
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.data));
    const remitoId = alta.data.data.id;
    assert.ok(remitoId);

    const detalle = await api("GET", `/remitos/${remitoId}`, { token: state.tokens.admin });
    assert.equal(detalle.status, 200);
    const remito = detalle.data.data;
    assert.equal(remito.estado, "procesado");
    assert.equal(remito.items.length, 1);
    assert.equal(remito.items[0].productoId, state.banana.id, "el matcher no reconoció Banana Ecuador");
    assert.equal(remito.items[0].confirmado, false);

    const sinConfirmar = await api("POST", `/remitos/${remitoId}/confirmar`, { token: state.tokens.admin });
    expectError(sinConfirmar, 400, /al menos una línea/i);

    const item = await api("POST", "/remitos/items", {
      token: state.tokens.admin,
      body: { id: remito.items[0].id, productoId: state.banana.id, cantidad: 5, confirmado: true },
    });
    assert.equal(item.status, 200);

    const antes = await stockOf(state.banana.id);
    const confirmar = await api("POST", `/remitos/${remitoId}/confirmar`, { token: state.tokens.admin });
    assert.equal(confirmar.status, 200);
    assert.equal(confirmar.data.data.ok, true);
    assert.equal(confirmar.data.data.lineas, 1);
    approx(await stockOf(state.banana.id), antes + 5);

    const reConfirmar = await api("POST", `/remitos/${remitoId}/confirmar`, { token: state.tokens.admin });
    assert.equal(reConfirmar.status, 200);
    assert.equal(reConfirmar.data.data.ok, true);
    approx(await stockOf(state.banana.id), antes + 5, "confirmar dos veces no debe duplicar stock");
  });

  it("12. aislamiento de tenant: pedidos y productos ajenos no son visibles", async () => {
    const foreignTenant = `e2e-tenant-${Date.now()}`;
    const foreignProducto = `prod-${randomUUID()}`;
    const foreignPedido = `ped-${randomUUID()}`;
    state.foreignTenantId = foreignTenant;

    await state.pool.query("insert into tenants (id, nombre) values ($1, $2)", [foreignTenant, "E2E Tercero"]);
    await state.pool.query(
      `insert into productos (id, tenant_id, nombre, unidad, unidad_label, precio)
       values ($1, $2, 'Producto Ajeno', 'bulto', 'bulto', 999)`,
      [foreignProducto, foreignTenant],
    );
    await state.pool.query(
      `insert into pedidos (id, tenant_id, client_uuid, cliente_nombre, estado)
       values ($1, $2, $3, 'Ajeno', 'enviado')`,
      [foreignPedido, foreignTenant, `e2e-foreign-${Date.now()}`],
    );

    const detalle = await api("GET", `/pedidos/${foreignPedido}`, { token: state.tokens.admin });
    expectError(detalle, 404, null);

    const cobrar = await api("POST", `/pedidos/${foreignPedido}/cobrar`, {
      token: state.tokens.cajero,
      body: { clientUuid: `e2e-${randomUUID()}`, formaPago: "efectivo" },
    });
    expectError(cobrar, 400, /no encontrado/i);

    const catalogo = await api("GET", "/catalogo", { token: state.tokens.admin });
    assert.ok(catalogo.data.data.every((p) => p.id !== foreignProducto), "el catálogo filtró tenant");
  });

  it("13. dashboard: resumen semanal y por hora", async () => {
    const semana = await api("GET", "/dashboard?dias=7", { token: state.tokens.admin });
    assert.equal(semana.status, 200);
    const data = semana.data.data;
    assert.equal(data.dias, 7);
    assert.equal(typeof data.ventas, "number");
    assert.equal(data.series.length, 7);
    assert.ok(Array.isArray(data.top));
    assert.ok(Array.isArray(data.formas));
    assert.ok(Array.isArray(data.movimientos));
    assert.ok(Array.isArray(data.cola));

    const dia = await api("GET", "/dashboard?dias=1", { token: state.tokens.admin });
    assert.equal(dia.status, 200);
    assert.equal(dia.data.data.series.length, 15);
  });

  it("14. auditoría: registra cobro, anulación y remito", async () => {
    const res = await api("GET", "/auditoria", { token: state.tokens.admin });
    assert.equal(res.status, 200);
    const filas = res.data.data;
    assert.ok(Array.isArray(filas));
    const acciones = new Set(filas.map((f) => f.accion));
    assert.ok(acciones.has("cobro"), "falta auditoría de cobro");
    assert.ok(acciones.has("anular_pedido"), "falta auditoría de anulación de pedido");
    assert.ok(acciones.has("confirmar_remito"), "falta auditoría de remito");

    const cobro = filas.find((f) => f.accion === "cobro");
    assert.equal(typeof cobro.detalle, "string", "detalle debe serializarse como string");
  });

  it("15. caja: cierre con diferencia, alerta y reapertura", async () => {
    const estado = await api("GET", "/caja", { token: state.tokens.cajero });
    assert.equal(estado.status, 200);
    const caja = estado.data.data;
    state.cierreId = caja.id;
    assert.ok(caja.id);
    assert.equal(typeof caja.esperado, "number");
    assert.ok(Array.isArray(caja.totales));
    assert.ok(Array.isArray(caja.ultimos));

    const real = round2(caja.esperado + 100);
    const cierre = await api("POST", "/caja/cerrar", {
      token: state.tokens.cajero,
      body: { id: caja.id, real, notas: "Cierre e2e" },
    });
    assert.equal(cierre.status, 200, JSON.stringify(cierre.data));
    approx(cierre.data.data.diferencia, 100);
    approx(cierre.data.data.esperado, caja.esperado);

    const alerta = await state.pool.query(
      `select id from alertas
        where tenant_id = $1 and tipo = 'caja_diferencia' and created_at >= $2::timestamptz
        order by created_at desc limit 1`,
      [TENANT, state.runStart],
    );
    assert.ok(alerta.rows[0], "no se creó la alerta de diferencia de caja");
    state.alertaId = alerta.rows[0].id;

    const alertas = await api("GET", "/alertas", { token: state.tokens.cajero });
    assert.equal(alertas.status, 200);
    assert.ok(alertas.data.data.some((a) => a.id === state.alertaId));

    const leida = await api("POST", `/alertas/${state.alertaId}/leida`, { token: state.tokens.cajero });
    assert.equal(leida.status, 200);
    assert.equal(leida.data.data.ok, true);

    const reabierta = await api("GET", "/caja", { token: state.tokens.cajero });
    assert.equal(reabierta.status, 200);
    assert.notEqual(reabierta.data.data.id, caja.id, "tras cerrar debe haber una caja nueva");
  });

  it("16. suscripción/contratos (Parte A, admin) y legal del canal (Parte B, perfiles)", async () => {
    // Setup idempotente: los documentos seed de torre arrancan en 'draft' sin
    // versiones. Publicar una versión es aditivo e inmutable (trigger 0013),
    // así que la suite lo hace una sola vez y lo deja publicado en DEV.
    const canonico = (texto) => texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const hashDe = (texto) => createHash("sha256").update(canonico(texto), "utf8").digest("hex");
    const publicarSiFalta = async (docId, cuerpo) => {
      const { rows } = await state.pool.query(
        "select id from torre.saas_legal_versions where document_id = $1 and status = 'published' limit 1",
        [docId],
      );
      if (rows[0]) return;
      await state.pool.query(
        `insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status, published_at)
         values ($1, $2, 'v1', $3, $4, 'published', now())`,
        [`ver-${randomUUID()}`, docId, cuerpo, hashDe(cuerpo)],
      );
    };
    await publicarSiFalta("doc_saas", "Contrato marco de prestación del servicio Mostrador (documento e2e DEV).");
    await publicarSiFalta("doc_cargador", "Términos y reglas del rol cargador (documento e2e DEV).");
    await publicarSiFalta("doc_comprador", "Términos de uso del comprador (documento e2e DEV).");
    await publicarSiFalta("doc_privacidad", "Política de privacidad del canal (documento e2e DEV).");

    // Borrador de un documento, para probar 409 version_obsoleta. La numeración
    // de versión es row_number sobre TODAS las versiones (igual que el backend).
    const crearBorrador = async (docId) => {
      const cuerpo = `Borrador e2e obsoleto ${randomUUID()}`;
      const id = `ver-${randomUUID()}`;
      await state.pool.query(
        `insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status)
         values ($1, $2, $3, $4, $5, 'draft')`,
        [id, docId, `e2e-borrador-${randomUUID()}`, cuerpo, hashDe(cuerpo)],
      );
      state.legalDraftIds.push(id);
      const { rows } = await state.pool.query(
        `select version from (
           select row_number() over (order by created_at, id)::int as version
           from torre.saas_legal_versions where document_id = $1
         ) v order by version desc limit 1`,
        [docId],
      );
      return rows[0].version;
    };

    const HEX64 = /^[0-9a-f]{64}$/;

    // ---- Parte A: /api/v1/suscripcion (solo dueño) ----
    const resumen = await api("GET", "/suscripcion", { token: state.tokens.admin });
    assert.equal(resumen.status, 200, JSON.stringify(resumen.data));
    const a1 = resumen.data.data;
    assert.ok(a1.suscripcion.plan.codigo.length > 0);
    assert.ok(["activa", "vencida", "cancelada", "prueba"].includes(a1.suscripcion.estado));
    assert.match(a1.suscripcion.inicio, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof a1.mercadoAlToqueContratado, "boolean");
    assert.equal(typeof a1.sucursalesContratadas, "number");
    assert.ok(a1.sucursalesContratadas >= 1);
    assert.ok(Array.isArray(a1.addons));
    assert.equal(a1.precioVigente.moneda, "ARS");
    assert.equal(typeof a1.precioVigente.monto, "number");
    assert.ok(a1.precioVigente.monto > 0);
    assert.equal(a1.precioVigente.periodo, "mensual");
    assert.equal(typeof a1.pendiente.hayPendiente, "boolean");
    assert.ok(a1.contratoVigente, "doc_saas publicado debería dar contrato vigente");
    assert.equal(a1.contratoVigente.documentoId, "doc_saas");
    assert.equal(a1.contratoVigente.estado, "vigente");
    assert.ok(Number.isInteger(a1.contratoVigente.version) && a1.contratoVigente.version >= 1);
    assert.match(a1.contratoVigente.hash, HEX64);

    for (const rol of ["vendedor", "cajero"]) {
      const prohibido = await api("GET", "/suscripcion", { token: state.tokens[rol] });
      expectError(prohibido, 403, null);
      assert.equal(prohibido.data.error, "rol_no_permitido");

      const aceptarProhibido = await api("POST", "/suscripcion/contrato/aceptar", {
        token: state.tokens[rol],
        body: { documentoId: "doc_saas", version: 1, hash: "x".repeat(64) },
      });
      expectError(aceptarProhibido, 403, null);
      assert.equal(aceptarProhibido.data.error, "rol_no_permitido");
    }

    const contrato = await api("GET", "/suscripcion/contrato", { token: state.tokens.admin });
    assert.equal(contrato.status, 200);
    const a2 = contrato.data.data;
    assert.equal(a2.documentoId, "doc_saas");
    assert.equal(a2.version, a1.contratoVigente.version);
    assert.equal(a2.hash, a1.contratoVigente.hash);
    assert.equal(a2.estado, "vigente");
    assert.equal(a2.contenido.formato, "texto");
    assert.ok(a2.contenido.valor.length > 0);
    assert.ok(Array.isArray(a2.anexos));

    const versionInexistente = await api("GET", "/suscripcion/contrato?version=999999", {
      token: state.tokens.admin,
    });
    expectError(versionInexistente, 404, null);
    assert.equal(versionInexistente.data.error, "version_no_encontrada");

    const versionNoEntera = await api("GET", "/suscripcion/contrato?version=abc", {
      token: state.tokens.admin,
    });
    expectError(versionNoEntera, 400, null);
    assert.equal(versionNoEntera.data.error, "cuerpo_invalido");

    const aceptarP1 = await api("POST", "/suscripcion/contrato/aceptar", {
      token: state.tokens.admin,
      headers: { "idempotency-key": randomUUID() },
      body: {
        documentoId: a2.documentoId,
        version: a2.version,
        hash: a2.hash,
      },
    });
    assert.equal(aceptarP1.status, 200, JSON.stringify(aceptarP1.data));
    const a4 = aceptarP1.data.data;
    assert.ok(a4.aceptacionId);
    assert.equal(a4.documentoId, "doc_saas");
    assert.equal(a4.version, a2.version);
    assert.ok(a4.fecha);
    assert.equal(a4.contratoVigente.aceptadoPorMi, true);

    const aceptarReintento = await api("POST", "/suscripcion/contrato/aceptar", {
      token: state.tokens.admin,
      headers: { "idempotency-key": randomUUID() },
      body: { documentoId: a2.documentoId, version: a2.version, hash: a2.hash },
    });
    assert.equal(aceptarReintento.status, 200);
    assert.equal(
      aceptarReintento.data.data.aceptacionId,
      a4.aceptacionId,
      "aceptar dos veces la misma versión no debe duplicar",
    );

    const hashErroneo = await api("POST", "/suscripcion/contrato/aceptar", {
      token: state.tokens.admin,
      headers: { "idempotency-key": randomUUID() },
      body: { documentoId: a2.documentoId, version: a2.version, hash: "0".repeat(64) },
    });
    expectError(hashErroneo, 409, null);
    assert.equal(hashErroneo.data.error, "hash_mismatch");

    const versionBorrador = await crearBorrador("doc_saas");
    const obsoleta = await api("POST", "/suscripcion/contrato/aceptar", {
      token: state.tokens.admin,
      headers: { "idempotency-key": randomUUID() },
      body: { documentoId: a2.documentoId, version: versionBorrador, hash: "0".repeat(64) },
    });
    expectError(obsoleta, 409, null);
    assert.equal(obsoleta.data.error, "version_obsoleta");

    const versionFueraDeRango = await api("POST", "/suscripcion/contrato/aceptar", {
      token: state.tokens.admin,
      headers: { "idempotency-key": randomUUID() },
      body: { documentoId: a2.documentoId, version: 999999, hash: "0".repeat(64) },
    });
    expectError(versionFueraDeRango, 404, null);
    assert.equal(versionFueraDeRango.data.error, "version_no_encontrada");

    const cuerpoInvalido = await api("POST", "/suscripcion/contrato/aceptar", {
      token: state.tokens.admin,
      headers: { "idempotency-key": randomUUID() },
      body: { documentoId: a2.documentoId, version: 0, hash: a2.hash },
    });
    expectError(cuerpoInvalido, 400, null);
    assert.equal(cuerpoInvalido.data.error, "cuerpo_invalido");

    const resumenLuego = await api("GET", "/suscripcion", { token: state.tokens.admin });
    assert.equal(resumenLuego.status, 200);
    assert.equal(resumenLuego.data.data.contratoVigente.aceptadoPorMi, true);
    assert.ok(resumenLuego.data.data.contratoVigente.fechaAceptacion);

    const historial = await api("GET", "/suscripcion/contrato/historial", { token: state.tokens.admin });
    assert.equal(historial.status, 200);
    const entradas = historial.data.data.entradas;
    assert.ok(Array.isArray(entradas));
    const vigente = entradas.find((e) => e.version === a2.version);
    assert.ok(vigente, "la versión vigente no está en el historial");
    assert.equal(vigente.documentoId, "doc_saas");
    assert.equal(vigente.estado, "vigente");
    assert.ok(vigente.aceptacion, "la aceptación del admin no figura en el historial");
    assert.ok(vigente.aceptacion.fecha);
    assert.ok(typeof vigente.aceptacion.aceptadoPor === "string" && vigente.aceptacion.aceptadoPor.length > 0);

    // ---- Parte B: /api/mercado/v1/legal (perfil del token) ----
    const mercado = (method, path, opts) => request(method, `/api/mercado/v1${path}`, opts);

    const anon = await mercado("GET", "/legal/documentos");
    expectError(anon, 401, null);
    assert.equal(anon.data.error, "unauthorized");

    const marca = Date.now();
    const regCargador = await mercado("POST", "/auth/registro-cargador", {
      body: {
        nombre: "E2E Cargador Legal",
        email: `e2e-cargador-${marca}@e2e.example.com`,
        password: "e2e-clave-123",
        telefono: "1000",
      },
    });
    assert.equal(regCargador.status, 201, JSON.stringify(regCargador.data));
    const tokenCargador = regCargador.data.token;
    assert.ok(tokenCargador);
    assert.equal(regCargador.data.usuario.perfil, "cargador");
    state.mercadoUsuarioIds.push(regCargador.data.usuario.id);

    const regComprador = await mercado("POST", "/auth/registro", {
      body: {
        nombre: "E2E Comprador Legal",
        email: `e2e-comprador-${marca}@e2e.example.com`,
        password: "e2e-clave-123",
        telefono: "2000",
        pais: "AR",
        tipoDocumento: "DNI",
        numeroDocumento: "30111222",
      },
    });
    assert.equal(regComprador.status, 201, JSON.stringify(regComprador.data));
    const tokenComprador = regComprador.data.token;
    assert.ok(tokenComprador);
    assert.equal(regComprador.data.usuario.perfil, "comprador");
    state.mercadoUsuarioIds.push(regComprador.data.usuario.id);

    const docsCargador = await mercado("GET", "/legal/documentos", { token: tokenCargador });
    assert.equal(docsCargador.status, 200, JSON.stringify(docsCargador.data));
    const listaCargador = docsCargador.data.documentos;
    const idsCargador = listaCargador.map((d) => d.documentoId);
    assert.ok(idsCargador.includes("doc_cargador"), "el cargador no ve sus términos");
    assert.ok(idsCargador.includes("doc_privacidad"), "el cargador no ve privacidad");
    assert.ok(!idsCargador.includes("doc_comprador"), "el cargador percibe documentos del comprador");
    assert.ok(!idsCargador.includes("doc_saas"), "el canal no debe exponer el contrato B2B");
    for (const doc of listaCargador) {
      assert.ok(doc.titulo.length > 0);
      assert.ok(Number.isInteger(doc.versionVigente) && doc.versionVigente >= 1);
      assert.match(doc.hash, HEX64);
      assert.ok(["pendiente", "aceptado"].includes(doc.estado));
    }

    const docsComprador = await mercado("GET", "/legal/documentos", { token: tokenComprador });
    assert.equal(docsComprador.status, 200);
    const idsComprador = docsComprador.data.documentos.map((d) => d.documentoId);
    assert.ok(idsComprador.includes("doc_comprador"));
    assert.ok(idsComprador.includes("doc_privacidad"));
    assert.ok(!idsComprador.includes("doc_cargador"), "el comprador percibe documentos del cargador");

    const docCargador = listaCargador.find((d) => d.documentoId === "doc_cargador");
    assert.equal(docCargador.estado, "pendiente");
    assert.equal(docCargador.tipo, "terminos");
    const docPrivacidad = listaCargador.find((d) => d.documentoId === "doc_privacidad");
    assert.equal(docPrivacidad.tipo, "privacidad");

    const contenidoCargador = await mercado("GET", `/legal/documentos/doc_cargador`, { token: tokenCargador });
    assert.equal(contenidoCargador.status, 200);
    const b2 = contenidoCargador.data;
    assert.equal(b2.documentoId, "doc_cargador");
    assert.equal(b2.version, docCargador.versionVigente);
    assert.equal(b2.hash, docCargador.hash);
    assert.equal(b2.contenido.formato, "texto");
    assert.ok(b2.contenido.valor.length > 0);
    assert.equal(b2.miAceptacion, null, "usuario nuevo no debería tener aceptación");

    const cruzado = await mercado("GET", "/legal/documentos/doc_cargador", { token: tokenComprador });
    expectError(cruzado, 403, null);
    assert.equal(cruzado.data.error, "perfil_invalido");

    const b2bEnCanal = await mercado("GET", "/legal/documentos/doc_saas", { token: tokenCargador });
    expectError(b2bEnCanal, 403, null);
    assert.equal(b2bEnCanal.data.error, "perfil_invalido");

    const docInexistente = await mercado("GET", "/legal/documentos/no-existe", { token: tokenCargador });
    expectError(docInexistente, 404, null);
    assert.equal(docInexistente.data.error, "documento_no_encontrado");

    const aceptarB1 = await mercado("POST", "/legal/documentos/doc_cargador/aceptar", {
      token: tokenCargador,
      headers: { "idempotency-key": randomUUID() },
      body: { version: b2.version, hash: b2.hash },
    });
    assert.equal(aceptarB1.status, 200, JSON.stringify(aceptarB1.data));
    assert.equal(aceptarB1.data.documentoId, "doc_cargador");
    assert.equal(aceptarB1.data.version, b2.version);
    assert.equal(aceptarB1.data.estado, "aceptado");
    assert.ok(aceptarB1.data.fecha);

    const aceptarB2 = await mercado("POST", "/legal/documentos/doc_cargador/aceptar", {
      token: tokenCargador,
      headers: { "idempotency-key": randomUUID() },
      body: { version: b2.version, hash: b2.hash },
    });
    assert.equal(aceptarB2.status, 200);
    assert.equal(
      aceptarB2.data.fecha,
      aceptarB1.data.fecha,
      "aceptar dos veces la misma versión no debe duplicar",
    );

    const hashErroneoB = await mercado("POST", "/legal/documentos/doc_cargador/aceptar", {
      token: tokenCargador,
      headers: { "idempotency-key": randomUUID() },
      body: { version: b2.version, hash: "0".repeat(64) },
    });
    expectError(hashErroneoB, 409, null);
    assert.equal(hashErroneoB.data.error, "hash_mismatch");

    const versionBorradorB = await crearBorrador("doc_privacidad");
    const obsoletaB = await mercado("POST", "/legal/documentos/doc_privacidad/aceptar", {
      token: tokenCargador,
      headers: { "idempotency-key": randomUUID() },
      body: { version: versionBorradorB, hash: "0".repeat(64) },
    });
    expectError(obsoletaB, 409, null);
    assert.equal(obsoletaB.data.error, "version_obsoleta");

    const cuerpoInvalidoB = await mercado("POST", "/legal/documentos/doc_cargador/aceptar", {
      token: tokenCargador,
      headers: { "idempotency-key": randomUUID() },
      body: { version: 0, hash: b2.hash },
    });
    expectError(cuerpoInvalidoB, 400, null);
    assert.equal(cuerpoInvalidoB.data.error, "cuerpo_invalido");

    const docsLuego = await mercado("GET", "/legal/documentos", { token: tokenCargador });
    assert.equal(docsLuego.status, 200);
    const docCargadorLuego = docsLuego.data.documentos.find((d) => d.documentoId === "doc_cargador");
    assert.equal(docCargadorLuego.estado, "aceptado");
    assert.equal(docCargadorLuego.versionAceptada, b2.version);
    assert.ok(docCargadorLuego.fechaAceptacion);

    const contenidoLuego = await mercado("GET", "/legal/documentos/doc_cargador", { token: tokenCargador });
    assert.equal(contenidoLuego.status, 200);
    assert.equal(contenidoLuego.data.miAceptacion.version, b2.version);
    assert.ok(contenidoLuego.data.miAceptacion.fecha);

    const docsCompradorIntactos = await mercado("GET", "/legal/documentos", { token: tokenComprador });
    assert.equal(docsCompradorIntactos.status, 200);
    const docCompradorAjeno = docsCompradorIntactos.data.documentos.find((d) => d.documentoId === "doc_comprador");
    assert.equal(docCompradorAjeno.estado, "pendiente", "la aceptación de un usuario no debe afectar a otro");
  });

  it("17. marca del tenant, canal mercado, reportes por producto y ranking de cargadores", async () => {
    const admin = state.tokens.admin;
    const cajero = state.tokens.cajero;
    const vendedor = state.tokens.vendedor;

    // Snapshot para restaurar en after(): nombre y config originales.
    const snap = await state.pool.query("select nombre, config::text as config from tenants where id = $1", [TENANT]);
    state.marcaNombre0 = snap.rows[0].nombre;
    state.marcaConfig0 = snap.rows[0].config;

    // GET /marca: cualquier staff autenticado lee la marca de su tenant.
    const c0 = await api("GET", "/marca", { token: cajero });
    assert.equal(c0.status, 200);
    assert.equal(c0.data.data.id, TENANT);
    assert.ok(c0.data.data.nombre.length > 0);
    assert.ok(c0.data.data.pieTicket.length > 0);

    // POST /marca: solo admin; validaciones de longitud.
    const prohibido = await api("POST", "/marca", {
      token: cajero,
      body: { nombre: "No debería", bajada: "", membrete: "", pieTicket: "", fondo: null },
    });
    expectError(prohibido, 403, /permiso/i);

    const largo = await api("POST", "/marca", {
      token: admin,
      body: { nombre: "x".repeat(81), bajada: "", membrete: "", pieTicket: "", fondo: null },
    });
    expectError(largo, 400, /largo/i);

    const guardada = await api("POST", "/marca", {
      token: admin,
      body: {
        nombre: c0.data.data.nombre,
        bajada: "Mostrador E2E",
        membrete: "Membrete E2E",
        pieTicket: c0.data.data.pieTicket,
        fondo: null,
      },
    });
    assert.equal(guardada.status, 200, JSON.stringify(guardada.data));
    assert.equal(guardada.data.data.bajada, "Mostrador E2E");
    assert.equal(guardada.data.data.membrete, "Membrete E2E");

    const deNuevo = await api("GET", "/marca", { token: admin });
    assert.equal(deNuevo.status, 200);
    assert.equal(deNuevo.data.data.bajada, "Mostrador E2E");

    // Canal mercado: lectura para cualquier staff; escritura solo admin.
    const canal0 = await api("GET", "/canal-mercado", { token: vendedor });
    assert.equal(canal0.status, 200);
    assert.equal(typeof canal0.data.data.activo, "boolean");
    assert.equal(typeof canal0.data.data.presencia, "boolean");

    const canalProhibido = await api("POST", "/canal-mercado", { token: cajero, body: { activo: false } });
    expectError(canalProhibido, 403, /permiso/i);

    const canalCuerpo = await api("POST", "/canal-mercado", { token: admin, body: { activo: "si" } });
    expectError(canalCuerpo, 400, /booleano/i);

    const desactivar = await api("POST", "/canal-mercado", { token: admin, body: { activo: false } });
    assert.equal(desactivar.status, 200);
    assert.equal(desactivar.data.data.activo, false);

    if (canal0.data.data.tier) {
      const activar = await api("POST", "/canal-mercado", { token: admin, body: { activo: true } });
      assert.equal(activar.status, 200, JSON.stringify(activar.data));
      assert.equal(activar.data.data.activo, true);
      const revertir = await api("POST", "/canal-mercado", {
        token: admin,
        body: { activo: canal0.data.data.activo },
      });
      assert.equal(revertir.status, 200);
    } else {
      const activar = await api("POST", "/canal-mercado", { token: admin, body: { activo: true } });
      expectError(activar, 400, /Presencia o Pro/i);
    }

    // Reportes por producto: solo admin.
    const repCajero = await api("GET", "/reportes/productos", { token: cajero });
    expectError(repCajero, 403, /permiso/i);
    const repVendedor = await api("GET", "/reportes/productos", { token: vendedor });
    expectError(repVendedor, 403, /permiso/i);

    // Pedido cobrado dentro de la corrida para verificar el contenido del reporte.
    // Los pedidos de los tests 6-9 quedaron anulados, así que el reporte no los cuenta.
    const pedBanana = await api("POST", "/pedidos", {
      token: vendedor,
      body: {
        clientUuid: `e2e-${randomUUID()}`,
        clienteNombre: "Mostrador",
        items: [{ productoId: state.banana.id, cantidad: 1 }],
      },
    });
    assert.equal(pedBanana.status, 201);
    const cobroBanana = await api("POST", `/pedidos/${pedBanana.data.data.id}/cobrar`, {
      token: cajero,
      body: { clientUuid: `e2e-${randomUUID()}`, formaPago: "efectivo" },
    });
    assert.equal(cobroBanana.status, 200, JSON.stringify(cobroBanana.data));

    const resumen = await api("GET", "/reportes/productos", { token: admin });
    assert.equal(resumen.status, 200);
    assert.ok(Array.isArray(resumen.data.data.semana));
    assert.ok(Array.isArray(resumen.data.data.mes));
    assert.ok(resumen.data.data.semana.length <= 8);
    for (const fila of [...resumen.data.data.semana, ...resumen.data.data.mes]) {
      assert.ok(fila.productoId && fila.nombre);
      assert.equal(typeof fila.cantidad, "number");
      assert.equal(typeof fila.total, "number");
    }
    const filaBanana = resumen.data.data.semana.find((f) => f.productoId === state.banana.id);
    assert.ok(filaBanana, "la banana cobrada en esta corrida debería figurar en el resumen semanal");
    assert.ok(filaBanana.cantidad >= 1);
    assert.ok(filaBanana.total >= state.banana.precio - 0.001);

    const hist = await api("GET", `/reportes/productos/${state.banana.id}/historial`, { token: admin });
    assert.equal(hist.status, 200);
    assert.equal(hist.data.data.dias.length, 7);
    const hoy = hist.data.data.dias[6];
    assert.match(hoy.dia, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(hoy.cantidad >= 1, `la banana cobrada en esta corrida debe figurar hoy (cantidad=${hoy.cantidad})`);
    assert.ok(hoy.total >= state.banana.precio - 0.001);

    const histAjeno = await api("GET", "/reportes/productos/prod-no-existe/historial", { token: admin });
    assert.equal(histAjeno.status, 200);
    assert.equal(histAjeno.data.data.dias.length, 7);
    for (const dia of histAjeno.data.data.dias) approx(dia.cantidad, 0);

    const histCajero = await api("GET", `/reportes/productos/${state.banana.id}/historial`, { token: cajero });
    expectError(histCajero, 403, /permiso/i);

    // Ranking de cargadores: solo admin; nivel derivado de mercado_niveles.
    const rankCajero = await api("GET", "/cargadores/ranking", { token: cajero });
    expectError(rankCajero, 403, /permiso/i);
    const rank = await api("GET", "/cargadores/ranking", { token: admin });
    assert.equal(rank.status, 200);
    assert.ok(Array.isArray(rank.data.data.ranking));
    for (const [i, fila] of rank.data.data.ranking.entries()) {
      assert.equal(fila.puesto, i + 1);
      assert.ok(fila.nombre.length > 0);
      assert.ok(fila.nivel.length > 0);
      assert.equal(typeof fila.puntos, "number");
      assert.equal(typeof fila.score, "number");
      assert.equal(typeof fila.recorridosCompletados, "number");
    }

    // Auditoría de las acciones sensibles del test.
    const aud = await api("GET", "/auditoria", { token: admin });
    assert.equal(aud.status, 200);
    const acciones = aud.data.data.map((a) => a.accion);
    assert.ok(acciones.includes("marca"), "falta auditoría de marca");
    assert.ok(acciones.includes("canal_mercado"), "falta auditoría de canal_mercado");
  });

  it("18. edición de cliente, pago de cuenta corriente y listado de remitos", async () => {
    // Listado de remitos: admin/cajero sí, vendedor no.
    const remitosNegado = await api("GET", "/remitos", { token: state.tokens.vendedor });
    expectError(remitosNegado, 403, /permiso/i);

    const remitoNuevo = await api("POST", "/remitos", {
      token: state.tokens.cajero,
      body: {
        proveedor: "Proveedor E2E 18",
        fuente: "manual",
        lineas: [{ descripcion: state.banana.nombre, cantidad: 1 }],
      },
    });
    assert.equal(remitoNuevo.status, 201, JSON.stringify(remitoNuevo.data));

    const listado = await api("GET", "/remitos", { token: state.tokens.cajero });
    assert.equal(listado.status, 200);
    assert.ok(Array.isArray(listado.data.data));
    assert.ok(listado.data.data.length <= 30, "el listado se acota a los últimos 30");
    assert.ok(
      listado.data.data.some((r) => r.id === remitoNuevo.data.data.id && r.proveedor === "Proveedor E2E 18"),
      "el remito creado debe aparecer en el listado",
    );
    assert.ok(listado.data.data.some((r) => r.estado === "confirmado"), "el remito confirmado del test 11 figura");

    // Edición de cliente: solo admin; valida condición IVA y existencia.
    const editarNegado = await api("POST", `/clientes/${state.e2eClienteId}`, {
      token: state.tokens.cajero,
      body: { nombre: "X", cuentaCorriente: false, condicionIva: "ri", activo: true },
    });
    expectError(editarNegado, 403, /permiso/i);

    const condicionInvalida = await api("POST", `/clientes/${state.e2eClienteId}`, {
      token: state.tokens.admin,
      body: {
        nombre: "Cliente E2E CC",
        cuentaCorriente: false,
        condicionIva: "invalida",
        activo: true,
      },
    });
    expectError(condicionInvalida, 400, /condición frente al IVA/i);

    const inexistente = await api("POST", "/clientes/cli-no-existe", {
      token: state.tokens.admin,
      body: { nombre: "Nadie", cuentaCorriente: false, condicionIva: "consumidor_final", activo: true },
    });
    expectError(inexistente, 400, /no encontrado/i);

    const editar = await api("POST", `/clientes/${state.e2eClienteId}`, {
      token: state.tokens.admin,
      body: {
        nombre: "Cliente E2E CC Editado",
        telefono: "1100000002",
        cuit: "20123456789",
        direccion: "Calle E2E 123",
        cuentaCorriente: true,
        condicionIva: "ri",
        activo: true,
      },
    });
    assert.equal(editar.status, 200, JSON.stringify(editar.data));
    assert.equal(editar.data.data.ok, true);

    const fila = await state.pool.query(
      "select nombre, telefono, cuit, direccion, condicion_iva, activo from clientes where id = $1",
      [state.e2eClienteId],
    );
    assert.equal(fila.rows[0].nombre, "Cliente E2E CC Editado");
    assert.equal(fila.rows[0].telefono, "1100000002");
    assert.equal(fila.rows[0].cuit, "20123456789");
    assert.equal(fila.rows[0].direccion, "Calle E2E 123");
    assert.equal(fila.rows[0].condicion_iva, "ri");
    assert.equal(fila.rows[0].activo, true);

    // Pago de cuenta corriente: solo admin, monto positivo, cliente existente.
    const pagoNegado = await api("POST", `/clientes/${state.e2eClienteId}/pagos`, {
      token: state.tokens.cajero,
      body: { monto: 100 },
    });
    expectError(pagoNegado, 403, /permiso/i);

    const pagoCero = await api("POST", `/clientes/${state.e2eClienteId}/pagos`, {
      token: state.tokens.admin,
      body: { monto: 0 },
    });
    expectError(pagoCero, 400, /mayor a cero/i);

    const pagoInexistente = await api("POST", "/clientes/cli-no-existe/pagos", {
      token: state.tokens.admin,
      body: { monto: 100 },
    });
    expectError(pagoInexistente, 400, /no encontrado/i);

    const saldoAntes = (
      await api("GET", `/clientes/${state.e2eClienteId}/cuenta`, { token: state.tokens.admin })
    ).data.data.saldo;

    const pago = await api("POST", `/clientes/${state.e2eClienteId}/pagos`, {
      token: state.tokens.admin,
      body: { monto: 500, nota: "Pago e2e" },
    });
    assert.equal(pago.status, 200, JSON.stringify(pago.data));
    assert.equal(pago.data.data.ok, true);

    const cuenta = await api("GET", `/clientes/${state.e2eClienteId}/cuenta`, { token: state.tokens.admin });
    approx(cuenta.data.data.saldo, saldoAntes - 500, "el pago descuenta del saldo");
    assert.equal(cuenta.data.data.movimientos[0].tipo, "pago");
    approx(cuenta.data.data.movimientos[0].monto, -500);
    assert.equal(cuenta.data.data.movimientos[0].nota, "Pago e2e");

    const auditoria = await api("GET", "/auditoria", { token: state.tokens.admin });
    assert.equal(auditoria.status, 200);
    const acciones = auditoria.data.data.map((a) => a.accion);
    assert.ok(acciones.includes("editar_cliente"), "falta auditoría de edición de cliente");
    assert.ok(acciones.includes("pago_cuenta"), "falta auditoría de pago de cuenta");
  });

  it("19. proveedores: CRUD, productos vinculados y asignación a remito", async () => {
    // Listado: admin/cajero sí, vendedor no.
    const listadoNegado = await api("GET", "/proveedores", { token: state.tokens.vendedor });
    expectError(listadoNegado, 403, /permiso/i);

    const listado0 = await api("GET", "/proveedores", { token: state.tokens.cajero });
    assert.equal(listado0.status, 200);
    assert.ok(Array.isArray(listado0.data.data));

    // Alta: solo admin, con nombre obligatorio.
    const altaNegada = await api("POST", "/proveedores", {
      token: state.tokens.cajero,
      body: { nombre: "Proveedor E2E 19" },
    });
    expectError(altaNegada, 403, /permiso/i);

    const altaVacia = await api("POST", "/proveedores", {
      token: state.tokens.admin,
      body: { nombre: "" },
    });
    expectError(altaVacia, 400, /obligatorio/i);

    const alta = await api("POST", "/proveedores", {
      token: state.tokens.admin,
      body: {
        nombre: "Proveedor E2E 19",
        cuit: "30999888777",
        telefono: "1155554444",
        email: "proveedor-e2e@example.com",
        direccion: "Av. E2E 456",
        observaciones: "Alta de prueba",
      },
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.data));
    state.e2eProveedorId = alta.data.data.id;
    assert.ok(state.e2eProveedorId);

    const listado = await api("GET", "/proveedores", { token: state.tokens.cajero });
    assert.equal(listado.status, 200);
    const creado = listado.data.data.find((p) => p.id === state.e2eProveedorId);
    assert.ok(creado, "el proveedor creado debe figurar en el listado");
    assert.equal(creado.nombre, "Proveedor E2E 19");
    assert.equal(creado.activo, true);

    // Edición: solo admin, activo booleano obligatorio, verifica existencia.
    const editarNegado = await api("POST", `/proveedores/${state.e2eProveedorId}`, {
      token: state.tokens.cajero,
      body: { nombre: "X", activo: true },
    });
    expectError(editarNegado, 403, /permiso/i);

    const sinActivo = await api("POST", `/proveedores/${state.e2eProveedorId}`, {
      token: state.tokens.admin,
      body: { nombre: "Proveedor E2E 19" },
    });
    expectError(sinActivo, 400, /booleano/i);

    const inexistente = await api("POST", "/proveedores/prv-no-existe", {
      token: state.tokens.admin,
      body: { nombre: "Nadie", activo: true },
    });
    expectError(inexistente, 400, /no encontrado/i);

    const editar = await api("POST", `/proveedores/${state.e2eProveedorId}`, {
      token: state.tokens.admin,
      body: {
        nombre: "Proveedor E2E 19 Editado",
        cuit: "30999888777",
        telefono: "1166665555",
        activo: true,
      },
    });
    assert.equal(editar.status, 200, JSON.stringify(editar.data));
    assert.equal(editar.data.data.ok, true);

    const fila = await state.pool.query(
      "select nombre, telefono, cuit, activo from proveedores where id = $1 and tenant_id = $2",
      [state.e2eProveedorId, TENANT],
    );
    assert.equal(fila.rows[0].nombre, "Proveedor E2E 19 Editado");
    assert.equal(fila.rows[0].telefono, "1166665555");
    assert.equal(fila.rows[0].cuit, "30999888777");
    assert.equal(fila.rows[0].activo, true);

    // Productos vinculados: solo admin.
    const productosNegado = await api("GET", `/proveedores/${state.e2eProveedorId}/productos`, {
      token: state.tokens.cajero,
    });
    expectError(productosNegado, 403, /permiso/i);

    const productos0 = await api("GET", `/proveedores/${state.e2eProveedorId}/productos`, {
      token: state.tokens.admin,
    });
    assert.equal(productos0.status, 200);
    assert.deepEqual(productos0.data.data.productos, []);

    // Asignación a remito: admin/cajero; proveedor activo; remito existente.
    const remitoNuevo = await api("POST", "/remitos", {
      token: state.tokens.cajero,
      body: {
        fuente: "manual",
        lineas: [{ descripcion: state.banana.nombre, cantidad: 2 }],
      },
    });
    assert.equal(remitoNuevo.status, 201, JSON.stringify(remitoNuevo.data));

    const asignar = await api("POST", `/remitos/${remitoNuevo.data.data.id}/proveedor`, {
      token: state.tokens.cajero,
      body: { proveedorId: state.e2eProveedorId },
    });
    assert.equal(asignar.status, 200, JSON.stringify(asignar.data));
    assert.equal(asignar.data.data.ok, true);

    const remito = await api("GET", `/remitos/${remitoNuevo.data.data.id}`, { token: state.tokens.cajero });
    assert.equal(remito.status, 200);
    assert.equal(remito.data.data.proveedor_id, state.e2eProveedorId);
    assert.equal(remito.data.data.proveedor, "Proveedor E2E 19 Editado");

    // Con proveedor inactivo se rechaza y el remito queda como estaba.
    const baja = await api("POST", `/proveedores/${state.e2eProveedorId}`, {
      token: state.tokens.admin,
      body: { nombre: "Proveedor E2E 19 Editado", activo: false },
    });
    assert.equal(baja.status, 200, JSON.stringify(baja.data));

    const asignarInactivo = await api("POST", `/remitos/${remitoNuevo.data.data.id}/proveedor`, {
      token: state.tokens.admin,
      body: { proveedorId: state.e2eProveedorId },
    });
    expectError(asignarInactivo, 400, /activo/i);

    const remitoTrasRechazo = await api("GET", `/remitos/${remitoNuevo.data.data.id}`, {
      token: state.tokens.cajero,
    });
    assert.equal(remitoTrasRechazo.data.data.proveedor_id, state.e2eProveedorId, "rechazo no debe tocar el remito");

    const reactivar = await api("POST", `/proveedores/${state.e2eProveedorId}`, {
      token: state.tokens.admin,
      body: { nombre: "Proveedor E2E 19 Editado", activo: true },
    });
    assert.equal(reactivar.status, 200, JSON.stringify(reactivar.data));

    const remitoInexistente = await api("POST", "/remitos/rem-no-existe/proveedor", {
      token: state.tokens.admin,
      body: { proveedorId: state.e2eProveedorId },
    });
    expectError(remitoInexistente, 400, /no encontrado/i);

    // Productos vinculados tras la asignación (la línea matcheó la banana).
    const productos = await api("GET", `/proveedores/${state.e2eProveedorId}/productos`, {
      token: state.tokens.admin,
    });
    assert.equal(productos.status, 200);
    assert.ok(
      productos.data.data.productos.includes(state.banana.nombre),
      "debe listar la banana del remito asignado",
    );

    const auditoria = await api("GET", "/auditoria", { token: state.tokens.admin });
    assert.equal(auditoria.status, 200);
    const acciones = auditoria.data.data.map((a) => a.accion);
    assert.ok(acciones.includes("alta_proveedor"), "falta auditoría de alta de proveedor");
    assert.ok(acciones.includes("editar_proveedor"), "falta auditoría de edición de proveedor");
  });

  it("20. facturación ARCA: config sin secretos, validaciones y gates fail-closed", async () => {
    // El módulo entero es de caja/admin: el vendedor no entra a nada.
    const vConfig = await api("GET", "/afip/config", { token: state.tokens.vendedor });
    expectError(vConfig, 403, /permiso/i);
    const vFacturacion = await api("GET", "/afip/facturacion", { token: state.tokens.vendedor });
    expectError(vFacturacion, 403, /permiso/i);
    const vSave = await api("POST", "/afip/config", {
      token: state.tokens.vendedor,
      body: {
        cuit: "30707057951",
        razonSocial: "Frutas Roman E2E",
        condicion: "ri",
        puntoVenta: 1,
        alicuota: 21,
        ambiente: "homo",
      },
    });
    expectError(vSave, 403, /permiso/i);
    const vHab = await api("POST", "/afip/habilitada", {
      token: state.tokens.vendedor,
      body: { habilitada: true },
    });
    expectError(vHab, 403, /permiso/i);

    // Snapshot para que el after() restaure la fila (o la borre si no existía).
    const prev = await state.pool.query("select * from afip_config where tenant_id = $1", [TENANT]);
    state.afipConfigPrev = prev.rows[0] ?? null;

    const base = {
      razonSocial: "Frutas Roman E2E",
      domicilio: "Av. De Mayo 123",
      condicion: "ri",
      puntoVenta: 3,
      inicioActividades: "2015-03-01",
      iibb: "9123456",
      alicuota: 21,
      ambiente: "homo",
    };

    // Validaciones de negocio (30707057951 tiene dígito verificador válido).
    const badCuit = await api("POST", "/afip/config", {
      token: state.tokens.admin,
      body: { ...base, cuit: "30707057952" },
    });
    expectError(badCuit, 400, /cuit/i);

    const badCond = await api("POST", "/afip/config", {
      token: state.tokens.admin,
      body: { ...base, cuit: "30707057951", condicion: "consumidor_final" },
    });
    expectError(badCond, 400, /condici/i);

    const badAlicuota = await api("POST", "/afip/config", {
      token: state.tokens.admin,
      body: { ...base, cuit: "30707057951", alicuota: 15 },
    });
    expectError(badAlicuota, 400, /al.cuota/i);

    const badPv = await api("POST", "/afip/config", {
      token: state.tokens.admin,
      body: { ...base, cuit: "30707057951", puntoVenta: 99999 },
    });
    expectError(badPv, 400, /punto de venta/i);

    // Guardado válido (sin PEMs en el body).
    const saved = await api("POST", "/afip/config", {
      token: state.tokens.admin,
      body: { ...base, cuit: "30707057951" },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.data.cuit, "30707057951");
    assert.equal(saved.data.data.puntoVenta, 3);
    assert.equal(saved.data.data.alicuota, 21);

    // Determinismo: sin cert/key y deshabilitado, sin importar el estado previo.
    await state.pool.query(
      "update afip_config set cert_pem = null, key_pem = null, habilitada = false where tenant_id = $1",
      [TENANT],
    );

    // El cajero lee la config pero jamás los secretos.
    const config = await api("GET", "/afip/config", { token: state.tokens.cajero });
    assert.equal(config.status, 200, JSON.stringify(config.data));
    assert.equal(config.data.data.certCargado, false);
    assert.equal(config.data.data.keyCargada, false);
    assert.equal(config.data.data.habilitada, false);
    const serialized = JSON.stringify(config.data);
    assert.ok(!serialized.includes("BEGIN"), "la respuesta no debe incluir PEM");
    assert.ok(!("certPem" in config.data.data) && !("keyPem" in config.data.data), "sin campos PEM");

    // Probar conexión sin certificado: gate local, sin llamar a ARCA.
    const probar = await api("POST", "/afip/probar", { token: state.tokens.admin });
    expectError(probar, 400, /certificado/i);

    // Habilitar ARCA sin certificado: gate fail-closed.
    const habilitar = await api("POST", "/afip/habilitada", {
      token: state.tokens.admin,
      body: { habilitada: true },
    });
    expectError(habilitar, 400, /certificado/i);

    const habilitarMal = await api("POST", "/afip/habilitada", {
      token: state.tokens.admin,
      body: {},
    });
    expectError(habilitarMal, 400, /booleano/i);

    // Con cert/key ficticios presentes, el gate "inhabilitado" se evalúa antes
    // de tocar ARCA (sin credenciales reales en el e2e).
    await state.pool.query(
      `update afip_config
       set cert_pem = $2, key_pem = $3, habilitada = false
       where tenant_id = $1`,
      [
        TENANT,
        "-----BEGIN CERTIFICATE-----\nficticio-e2e\n-----END CERTIFICATE-----",
        "-----BEGIN RSA PRIVATE KEY-----\nficticio-e2e\n-----END RSA PRIVATE KEY-----",
      ],
    );

    const emitir = await api("POST", "/afip/facturas", {
      token: state.tokens.cajero,
      body: { cobroId: "cob-no-existe" },
    });
    expectError(emitir, 400, /inhabilitado/i);

    const nota = await api("POST", "/afip/notas-credito", {
      token: state.tokens.admin,
      body: { facturaId: "fac-no-existe" },
    });
    expectError(nota, 400, /autorizada/i);

    const unaFactura = await api("GET", "/afip/facturas/fac-no-existe", {
      token: state.tokens.admin,
    });
    expectError(unaFactura, 400, /comprobante/i);

    // Listado: el cajero ve la config (cert cargado) y colecciones vacías.
    const facturacion = await api("GET", "/afip/facturacion", { token: state.tokens.cajero });
    assert.equal(facturacion.status, 200, JSON.stringify(facturacion.data));
    assert.equal(facturacion.data.data.config.certCargado, true);
    assert.equal(facturacion.data.data.config.habilitada, false);
    assert.ok(Array.isArray(facturacion.data.data.pendientes));
    assert.ok(Array.isArray(facturacion.data.data.emitidas));

    // Auditoría del alta/edición de configuración.
    const auditoria = await api("GET", "/auditoria", { token: state.tokens.admin });
    assert.equal(auditoria.status, 200);
    const acciones = auditoria.data.data.map((a) => a.accion);
    assert.ok(acciones.includes("afip_config"), "falta auditoría de config ARCA");
  });

  it("21. mensajería del pedido: solo admin, marca de leídos y paginación", async () => {
    const alta = await api("POST", "/clientes", {
      token: state.tokens.admin,
      body: { nombre: "Cliente Mensajes 21", telefono: "1100000021", cuentaCorriente: false },
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.data));
    state.msgClienteId = alta.data.data.id;

    const pedido = await api("POST", "/pedidos", {
      token: state.tokens.vendedor,
      body: {
        clientUuid: `e2e-${randomUUID()}`,
        clienteId: state.msgClienteId,
        clienteNombre: "Cliente Mensajes 21",
        items: [{ productoId: state.banana.id, cantidad: 2 }],
      },
    });
    assert.equal(pedido.status, 201, JSON.stringify(pedido.data));
    const pedidoId = pedido.data.data.id;
    const base = `/pedidos/${pedidoId}/mensajes`;

    // Matriz de permisos: lectura/envío de mensajes y conversaciones son admin.
    expectError(await api("GET", base, { token: state.tokens.cajero }), 403, /permiso/i);
    expectError(await api("POST", base, { token: state.tokens.cajero, body: { cuerpo: "Hola" } }), 403, /permiso/i);
    expectError(await api("GET", "/mensajes/conversaciones", { token: state.tokens.vendedor }), 403, /permiso/i);

    // Pedido de mostrador (sin cliente) no tiene conversación.
    const mostrador = await api("POST", "/pedidos", {
      token: state.tokens.vendedor,
      body: {
        clientUuid: `e2e-${randomUUID()}`,
        clienteNombre: "Mostrador",
        items: [{ productoId: state.banana.id, cantidad: 1 }],
      },
    });
    assert.equal(mostrador.status, 201, JSON.stringify(mostrador.data));
    expectError(
      await api("GET", `/pedidos/${mostrador.data.data.id}/mensajes`, { token: state.tokens.admin }),
      400,
      /conversaci/i,
    );

    // Validaciones de cuerpo antes de cualquier acceso.
    expectError(await api("POST", base, { token: state.tokens.admin, body: { cuerpo: "   " } }), 400, /mensaje/i);
    expectError(
      await api("POST", base, { token: state.tokens.admin, body: { cuerpo: "x".repeat(501) } }),
      400,
      /largo/i,
    );

    // El negocio envía y lee: queda un mensaje propio, sin "hay más".
    const envio = await api("POST", base, {
      token: state.tokens.admin,
      body: { cuerpo: "Hola, ¿a qué hora pasás?" },
    });
    assert.equal(envio.status, 200, JSON.stringify(envio.data));
    assert.equal(envio.data.data.ok, true);

    const lectura1 = await api("GET", base, { token: state.tokens.admin });
    assert.equal(lectura1.status, 200, JSON.stringify(lectura1.data));
    assert.equal(lectura1.data.data.mensajes.length, 1);
    assert.equal(lectura1.data.data.mensajes[0].emisor, "negocio");
    assert.equal(lectura1.data.data.hayMas, false);

    // Llega un mensaje del cliente: la conversación lo muestra sin leer y
    // leerlo (GET) lo marca como leído del lado negocio.
    await state.pool.query(
      `insert into pedido_mensajes (id, tenant_id, pedido_id, cliente_id, emisor, cuerpo, leido)
       values ($1, $2, $3, $4, 'cliente', 'De 9 a 12 porfa', false)`,
      [`msg-${randomUUID()}`, TENANT, pedidoId, state.msgClienteId],
    );

    const conv1 = await api("GET", "/mensajes/conversaciones", { token: state.tokens.admin });
    assert.equal(conv1.status, 200, JSON.stringify(conv1.data));
    const conv = conv1.data.data.find((c) => c.pedidoId === pedidoId);
    assert.ok(conv, "falta la conversación del pedido 21");
    assert.equal(conv.sinLeer, 1);
    assert.equal(conv.ultimoDe, "cliente");

    const lectura2 = await api("GET", base, { token: state.tokens.admin });
    assert.equal(lectura2.data.data.mensajes.length, 2);
    assert.equal(lectura2.data.data.mensajes[1].emisor, "cliente");

    const conv2 = await api("GET", "/mensajes/conversaciones", { token: state.tokens.admin });
    assert.equal(conv2.data.data.find((c) => c.pedidoId === pedidoId).sinLeer, 0);

    // Paginación: 31 mensajes más (33 en total) ⇒ primera página de 30 con
    // "hay más"; la segunda parte desde el más viejo de la primera.
    for (let i = 0; i < 31; i++) {
      await state.pool.query(
        `insert into pedido_mensajes (id, tenant_id, pedido_id, cliente_id, emisor, cuerpo, leido, created_at)
         values ($1, $2, $3, $4, 'cliente', $5, true, now() - (($6 || ' minutes')::interval))`,
        [`msg-${randomUUID()}`, TENANT, pedidoId, state.msgClienteId, `Histórico ${i + 1}`, String(40 - i)],
      );
    }

    const pag1 = await api("GET", base, { token: state.tokens.admin });
    assert.equal(pag1.status, 200, JSON.stringify(pag1.data));
    assert.equal(pag1.data.data.mensajes.length, 30);
    assert.equal(pag1.data.data.hayMas, true);

    const masViejo = pag1.data.data.mensajes[0].createdAt;
    const pag2 = await api("GET", `${base}?antes=${encodeURIComponent(masViejo)}`, {
      token: state.tokens.admin,
    });
    assert.equal(pag2.status, 200, JSON.stringify(pag2.data));
    assert.ok(pag2.data.data.mensajes.length >= 1, "la segunda página no trajo mensajes");
    for (const m of pag2.data.data.mensajes) {
      assert.ok(m.createdAt < masViejo, `mensaje fuera de página: ${m.createdAt} !< ${masViejo}`);
    }

    // Aislamiento: un pedido con cliente de OTRO tenant no es de este puesto.
    const foreignTenant = `e2e-msg-tenant-${Date.now()}`;
    state.msgForeignTenantId = foreignTenant;
    const foreignPedido = `ped-${randomUUID()}`;
    await state.pool.query("insert into tenants (id, nombre) values ($1, $2)", [foreignTenant, "E2E Msg Ajeno"]);
    await state.pool.query(
      `insert into pedidos (id, tenant_id, client_uuid, cliente_nombre, estado, cliente_id)
       values ($1, $2, $3, 'Ajeno Msg', 'enviado', $4)`,
      [foreignPedido, foreignTenant, `e2e-msgf-${Date.now()}`, state.msgClienteId],
    );
    expectError(await api("GET", `/pedidos/${foreignPedido}/mensajes`, { token: state.tokens.admin }), 400, /puesto/i);
  });

  it("22. portal de clientes: registro, recordar/recuperar, catálogo, pedidos y mensajes", async () => {
    const stamp = Date.now();
    const email = `portal.${stamp}@example.com`;
    const cuit = `pc${stamp}`;
    const telefono = `119999${String(stamp).slice(-5)}`;
    const registroBody = {
      nombre: "Cliente Portal 22",
      email,
      password: "clave-portal-22",
      telefono,
      cuit,
      direccion: "Calle Falsa 123",
    };

    // Registro: alta pública con ficha activa (sin cuenta corriente).
    const alta = await api("POST", "/portal/registro", { body: registroBody });
    assert.equal(alta.status, 201, JSON.stringify(alta.data));
    assert.match(alta.data.data.id, /^cli[-_]/);

    // Validaciones: datos incompletos, contraseña corta, correo de staff.
    expectError(
      await api("POST", "/portal/registro", {
        body: { ...registroBody, email: `otro.${stamp}@example.com`, telefono: "  " },
      }),
      400,
      /telefono es obligatorio/i,
    );
    expectError(
      await api("POST", "/portal/registro", { body: { ...registroBody, password: "123" } }),
      400,
      /contraseña/i,
    );
    expectError(
      await api("POST", "/portal/registro", { body: { ...registroBody, email: "dueno@frutasroman.com" } }),
      400,
      /puesto/i,
    );

    // Recordar: el CUIT alcanza para recuperar el correo enmascarado.
    const recordar = await api("POST", "/portal/recordar", { body: { dato: cuit } });
    assert.equal(recordar.status, 200, JSON.stringify(recordar.data));
    assert.match(recordar.data.data.email, /^\S{1}\*{3}@/);
    expectError(await api("POST", "/portal/recordar", { body: { dato: "  " } }), 400, /dato es obligatorio/i);
    expectError(await api("POST", "/portal/recordar", { body: { dato: `nada-${stamp}` } }), 400, /no encontramos/i);

    // Recuperar: no aplica a cuentas del puesto y exige coincidencia CUIT.
    expectError(
      await api("POST", "/portal/recuperar", {
        body: { email: "caja@frutasroman.com", cuit: "x", password: "clave-nueva-22" },
      }),
      400,
      /puesto/i,
    );
    expectError(
      await api("POST", "/portal/recuperar", {
        body: { email, cuit: `co${stamp}`, password: "clave-nueva-22" },
      }),
      400,
      /no coincide/i,
    );
    const recuperar = await api("POST", "/portal/recuperar", {
      body: { email, cuit, password: "clave-nueva-22" },
    });
    assert.equal(recuperar.status, 200, JSON.stringify(recuperar.data));
    assert.equal(recuperar.data.data.ok, true);

    // Con la clave nueva entra y su ficha está activa sin cuenta corriente.
    const tokenCliente = await signIn(email, "clave-nueva-22");
    const ficha0 = await api("GET", "/portal/ficha", { token: tokenCliente });
    assert.equal(ficha0.status, 200, JSON.stringify(ficha0.data));
    assert.equal(ficha0.data.data.email, email);
    assert.equal(ficha0.data.data.cuentaCorriente, false);
    assert.equal(ficha0.data.data.saldo, 0);
    state.portalUserIds.push(ficha0.data.data.userId);

    // Fail-closed cruzado: token de staff en ruta de cliente (y viceversa).
    const tokenAdmin = await signIn("dueno@frutasroman.com");
    expectError(await api("GET", "/portal/ficha", { token: tokenAdmin }), 403, /ficha de cliente/i);
    expectError(await api("GET", "/session", { token: tokenCliente }), 403, /cliente/i);

    // Catálogo del tenant: un producto con precio y stock para 3 unidades
    // (2 del pedido efectivo + 1 de la transferencia). `prod` se reusa en las
    // validaciones de pedido para correr aislado del test 1.
    const catalogo = await api("GET", "/portal/catalogo", { token: tokenCliente });
    assert.equal(catalogo.status, 200, JSON.stringify(catalogo.data));
    const prod = catalogo.data.data.find((p) => p.precio > 0 && p.stock >= 3);
    assert.ok(prod, "el catálogo del portal no tiene productos con precio y stock");

    // Edición de la ficha: validación y guardado.
    expectError(
      await api("POST", "/portal/ficha", {
        token: tokenCliente,
        body: { nombre: "  ", telefono: "1", cuit: "2", direccion: "3" },
      }),
      400,
      /nombre es obligatorio/i,
    );
    const guardada = await api("POST", "/portal/ficha", {
      token: tokenCliente,
      body: { nombre: "Cliente Portal 22 Editado", telefono, cuit, direccion: "Otra 456" },
    });
    assert.equal(guardada.status, 200, JSON.stringify(guardada.data));
    assert.equal(guardada.data.data.nombre, "Cliente Portal 22 Editado");

    // Pedido: validaciones de ítems, forma de pago y gates del negocio.
    expectError(
      await api("POST", "/portal/pedidos", { token: tokenCliente, body: { items: [], formaPago: "efectivo" } }),
      400,
      /ítems/i,
    );
    expectError(
      await api("POST", "/portal/pedidos", {
        token: tokenCliente,
        body: { items: [{ productoId: prod.id, cantidad: 0 }], formaPago: "efectivo" },
      }),
      400,
      /ítem inválido/i,
    );
    expectError(
      await api("POST", "/portal/pedidos", {
        token: tokenCliente,
        body: { items: [{ productoId: "prod-no-existe", cantidad: 1 }], formaPago: "efectivo" },
      }),
      400,
      /ya no está/i,
    );
    expectError(
      await api("POST", "/portal/pedidos", {
        token: tokenCliente,
        body: { items: [{ productoId: prod.id, cantidad: 1 }], formaPago: "canje" },
      }),
      400,
      /formaPago inválido/i,
    );
    expectError(
      await api("POST", "/portal/pedidos", {
        token: tokenCliente,
        body: { items: [{ productoId: prod.id, cantidad: 1 }], formaPago: "cuenta_corriente" },
      }),
      400,
      /cuenta corriente/i,
    );
    expectError(
      await api("POST", "/portal/pedidos", {
        token: tokenCliente,
        body: { items: [{ productoId: prod.id, cantidad: 1 }], formaPago: "transferencia" },
      }),
      400,
      /comprobante/i,
    );
    expectError(
      await api("POST", "/portal/pedidos", {
        token: tokenCliente,
        body: { items: [{ productoId: prod.id, cantidad: 9_999_999 }], formaPago: "efectivo" },
      }),
      400,
      /stock/i,
    );

    // Pedido efectivo: queda 'enviado', con ítems snapshot y total calculado.
    const pedidoEfectivo = await api("POST", "/portal/pedidos", {
      token: tokenCliente,
      body: {
        items: [{ productoId: prod.id, cantidad: 2 }],
        formaPago: "efectivo",
        nota: "sin semillas",
      },
    });
    assert.equal(pedidoEfectivo.status, 201, JSON.stringify(pedidoEfectivo.data));
    const pedido1 = pedidoEfectivo.data.data;
    assert.equal(pedido1.estado, "enviado");
    assert.equal(pedido1.clienteNombre, "Cliente Portal 22 Editado");
    assert.equal(pedido1.clienteId, ficha0.data.data.id);
    assert.equal(pedido1.items.length, 1);
    assert.equal(pedido1.items[0].productoId, prod.id);
    approx(pedido1.total, prod.precio * 2);

    // Transferencia: exige y guarda el comprobante.
    const transferencia = await api("POST", "/portal/pedidos", {
      token: tokenCliente,
      body: {
        items: [{ productoId: prod.id, cantidad: 1 }],
        formaPago: "transferencia",
        comprobanteNombre: "transfer.png",
        comprobanteData: "data:image/png;base64,e2e",
      },
    });
    assert.equal(transferencia.status, 201, JSON.stringify(transferencia.data));
    const pedido2 = transferencia.data.data;
    assert.equal(pedido2.formaPago, "transferencia");

    // Mis pedidos: ambos aparecen; el comprobante solo en el de transferencia.
    const misPedidos = await api("GET", "/portal/pedidos", { token: tokenCliente });
    assert.equal(misPedidos.status, 200, JSON.stringify(misPedidos.data));
    const ids = misPedidos.data.data.map((p) => p.id);
    assert.ok(ids.includes(pedido1.id));
    assert.ok(ids.includes(pedido2.id));

    const comprobante = await api("GET", `/portal/pedidos/${pedido2.id}/comprobante`, { token: tokenCliente });
    assert.equal(comprobante.status, 200, JSON.stringify(comprobante.data));
    assert.equal(comprobante.data.data.nombre, "transfer.png");
    expectError(
      await api("GET", `/portal/pedidos/${pedido1.id}/comprobante`, { token: tokenCliente }),
      400,
      /comprobante/i,
    );

    // Mensajería: el negocio escribe y el cliente lo ve sin leer hasta leerlo.
    const envioNegocio = await api("POST", `/pedidos/${pedido1.id}/mensajes`, {
      token: tokenAdmin,
      body: { cuerpo: "Tu pedido está en preparación." },
    });
    assert.equal(envioNegocio.status, 200, JSON.stringify(envioNegocio.data));

    const pendientes = await api("GET", "/portal/mensajes-pendientes", { token: tokenCliente });
    assert.equal(pendientes.status, 200, JSON.stringify(pendientes.data));
    const pendiente = pendientes.data.data.find((m) => m.pedidoId === pedido1.id);
    assert.ok(pendiente, "falta el mensaje pendiente del negocio");
    assert.equal(pendiente.n, 1);

    const lecturaCliente = await api("GET", `/portal/pedidos/${pedido1.id}/mensajes`, { token: tokenCliente });
    assert.equal(lecturaCliente.status, 200, JSON.stringify(lecturaCliente.data));
    assert.equal(lecturaCliente.data.data.mensajes.length, 1);
    assert.equal(lecturaCliente.data.data.mensajes[0].emisor, "negocio");
    assert.equal(lecturaCliente.data.data.hayMas, false);

    const pendientes2 = await api("GET", "/portal/mensajes-pendientes", { token: tokenCliente });
    assert.ok(
      !pendientes2.data.data.some((m) => m.pedidoId === pedido1.id),
      "el GET del cliente debió marcar el mensaje como leído",
    );

    // El cliente responde: validaciones y guardado visible del lado negocio.
    expectError(
      await api("POST", `/portal/pedidos/${pedido1.id}/mensajes`, { token: tokenCliente, body: { cuerpo: "  " } }),
      400,
      /mensaje/i,
    );
    expectError(
      await api("POST", `/portal/pedidos/${pedido1.id}/mensajes`, {
        token: tokenCliente,
        body: { cuerpo: "x".repeat(501) },
      }),
      400,
      /largo/i,
    );
    const envioCliente = await api("POST", `/portal/pedidos/${pedido1.id}/mensajes`, {
      token: tokenCliente,
      body: { cuerpo: "Perfecto, paso a las 10." },
    });
    assert.equal(envioCliente.status, 200, JSON.stringify(envioCliente.data));
    assert.equal(envioCliente.data.data.ok, true);

    const lecturaNegocio = await api("GET", `/pedidos/${pedido1.id}/mensajes`, { token: tokenAdmin });
    assert.equal(lecturaNegocio.status, 200, JSON.stringify(lecturaNegocio.data));
    assert.equal(lecturaNegocio.data.data.mensajes.length, 2);
    assert.equal(lecturaNegocio.data.data.mensajes[1].emisor, "cliente");

    // Aislamiento: un segundo cliente registrado no ve nada del primero.
    const emailB = `portal.b.${stamp}@example.com`;
    const altaB = await api("POST", "/portal/registro", {
      body: {
        nombre: "Cliente Portal B 22",
        email: emailB,
        password: "clave-portal-b22",
        telefono: `118888${String(stamp).slice(-5)}`,
        cuit: `pb${stamp}`,
        direccion: "Calle B 22",
      },
    });
    assert.equal(altaB.status, 201, JSON.stringify(altaB.data));
    const tokenB = await signIn(emailB, "clave-portal-b22");
    const fichaB = await api("GET", "/portal/ficha", { token: tokenB });
    assert.equal(fichaB.status, 200, JSON.stringify(fichaB.data));
    state.portalUserIds.push(fichaB.data.data.userId);

    const pedidosB = await api("GET", "/portal/pedidos", { token: tokenB });
    assert.equal(pedidosB.status, 200, JSON.stringify(pedidosB.data));
    assert.ok(!pedidosB.data.data.some((p) => p.id === pedido1.id), "el cliente B ve el pedido de A");

    expectError(await api("GET", `/portal/pedidos/${pedido1.id}/mensajes`, { token: tokenB }), 400, /tuyo/i);
    expectError(await api("GET", `/portal/pedidos/${pedido2.id}/comprobante`, { token: tokenB }), 400, /tuyo/i);

    // Sin cuenta corriente, no hay movimientos.
    const movimientos = await api("GET", "/portal/movimientos", { token: tokenCliente });
    assert.equal(movimientos.status, 200, JSON.stringify(movimientos.data));
    assert.deepEqual(movimientos.data.data, []);
  });

  it("23. mercado: avisos públicos, cancelación de pedido y condición comercial (M9g)", async () => {
    const mercado = (method, path, opts) => request(method, `/api/mercado/v1${path}`, opts);
    const stamp = Date.now();
    const marca = `m9g-${stamp}`;

    // GET /avisos: pública, shape uniforme.
    const avisos = await mercado("GET", "/avisos");
    assert.equal(avisos.status, 200, JSON.stringify(avisos.data));
    assert.ok(Array.isArray(avisos.data.avisos));
    for (const aviso of avisos.data.avisos) {
      assert.equal(typeof aviso.id, "string");
      assert.equal(typeof aviso.placement, "string");
      assert.equal(typeof aviso.contentRef, "string");
      assert.equal(typeof aviso.tenantId, "string");
      assert.equal(typeof aviso.tenantNombre, "string");
    }

    // Registro de comprador y carga de identidad (requisito para comprar).
    const email = `e2e-${marca}@e2e.example.com`;
    const dni = String(stamp).slice(-8);
    const registro = await mercado("POST", "/auth/registro", {
      body: {
        nombre: "E2E M9g Comprador",
        email,
        password: "e2e-clave-123",
        telefono: "3000",
        pais: "AR",
        tipoDocumento: "DNI",
        numeroDocumento: dni,
      },
    });
    assert.equal(registro.status, 201, JSON.stringify(registro.data));
    const token = registro.data.token;
    state.mercadoUsuarioIds.push(registro.data.usuario.id);

    const png1x1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const identidad = await mercado("POST", "/identidad", {
      token,
      body: {
        pais: "AR",
        tipoDocumento: "DNI",
        numeroDocumento: dni,
        documentoBase64: png1x1,
        selfieBase64: png1x1,
      },
    });
    assert.equal(identidad.status, 200, JSON.stringify(identidad.data));
    assert.equal(identidad.data.estado, "documentacion_cargada");

    // Comprador ajeno para el caso 403 (con identidad propia cargada).
    const dniAjeno = `9${String(stamp).slice(-7)}`;
    const regAjeno = await mercado("POST", "/auth/registro", {
      body: {
        nombre: "E2E M9g Ajeno",
        email: `e2e-${marca}-ajeno@e2e.example.com`,
        password: "e2e-clave-123",
        telefono: "3001",
        pais: "AR",
        tipoDocumento: "DNI",
        numeroDocumento: dniAjeno,
      },
    });
    assert.equal(regAjeno.status, 201, JSON.stringify(regAjeno.data));
    const tokenAjeno = regAjeno.data.token;
    state.mercadoUsuarioIds.push(regAjeno.data.usuario.id);
    const identidadAjeno = await mercado("POST", "/identidad", {
      token: tokenAjeno,
      body: {
        pais: "AR",
        tipoDocumento: "DNI",
        numeroDocumento: dniAjeno,
        documentoBase64: png1x1,
        selfieBase64: png1x1,
      },
    });
    assert.equal(identidadAjeno.status, 200, JSON.stringify(identidadAjeno.data));

    // Producto del canal con stock conocido (publicación online se restaura).
    const prod = await state.pool.query(
      "select id, stock, publicado_online from productos where tenant_id = $1 and activo = true order by stock desc limit 1",
      [TENANT],
    );
    assert.ok(prod.rows[0], "el tenant no tiene productos activos para la prueba");
    const productoId = prod.rows[0].id;
    const stockInicial = Number(prod.rows[0].stock);
    const publicadoPrevio = prod.rows[0].publicado_online;
    await state.pool.query("update productos set publicado_online = true where id = $1", [productoId]);

    // Canal Mercado al Toque: el test 17 puede dejarlo apagado durante la
    // corrida (sin tier no se puede reactivar por API), así que se enciende
    // acá y se restaura la config previa al terminar.
    const canalSnap = await state.pool.query("select config::text as config from tenants where id = $1", [TENANT]);
    const configCanalPrevio = canalSnap.rows[0].config;
    const configCanal = JSON.parse(configCanalPrevio ?? "{}");
    configCanal.mercadoAlToque = "true";
    await state.pool.query("update tenants set config = $1::jsonb where id = $2", [
      JSON.stringify(configCanal),
      TENANT,
    ]);

    const cargadorId = `e2e-cargador-${marca}`;
    const recorridoId = `e2e-recorrido-${marca}`;
    try {
      // Creación: condición congelada y pagoEstado según medio de pago.
      const creadoA = await mercado("POST", "/pedidos", {
        token,
        headers: { "idempotency-key": `${marca}-pedido-a` },
        body: {
          medioPago: "transferencia",
          nota: "Pedido M9g A",
          items: [{ tenantId: TENANT, productoId, cantidad: 2 }],
        },
      });
      assert.equal(creadoA.status, 201, JSON.stringify(creadoA.data));
      const pedidoA = creadoA.data.pedidos[0];
      assert.equal(pedidoA.estado, "confirmado");
      assert.equal(pedidoA.medioPago, "transferencia");
      assert.equal(pedidoA.pagoEstado, "informado");
      assert.ok("comision" in pedidoA, "la creación debe exponer comision");

      // La condición quedó congelada en la fila y el texto expuesto coincide.
      const filaA = await state.pool.query("select condicion from pedidos where id = $1", [pedidoA.id]);
      const condicionA = filaA.rows[0].condicion;
      assert.ok(condicionA && typeof condicionA === "object", "la condición debe quedar congelada en pedidos.condicion");
      const esperadoA =
        condicionA.source === "override" && typeof condicionA.percent === "number"
          ? `Comisión: ${condicionA.percent}%`
          : condicionA.source === "policy" &&
              typeof condicionA.percentMin === "number" &&
              typeof condicionA.percentMax === "number"
            ? `Comisión: entre ${condicionA.percentMin}% y ${condicionA.percentMax}%`
            : null;
      assert.equal(pedidoA.comision, esperadoA);

      // Lecturas: GET /pedidos y GET /pedidos/:id exponen la misma condición.
      const lista = await mercado("GET", "/pedidos", { token });
      assert.equal(lista.status, 200, JSON.stringify(lista.data));
      const enLista = lista.data.pedidos.find((p) => p.id === pedidoA.id);
      assert.ok(enLista, "el pedido A debe listarse en /pedidos");
      assert.equal(enLista.comision, esperadoA);
      assert.equal(enLista.pagoEstado, "informado");
      const detalle = await mercado("GET", `/pedidos/${pedidoA.id}`, { token });
      assert.equal(detalle.status, 200, JSON.stringify(detalle.data));
      assert.equal(detalle.data.pedido.comision, esperadoA);

      // La reserva descontó stock.
      approx(await stockOf(productoId), stockInicial - 2, "la reserva debe descontar stock");

      // Cancelación feliz: ok, estado cancelado, stock restituido y auditoría.
      const cancelA = await mercado("POST", `/pedidos/${pedidoA.id}/cancelar`, { token });
      assert.equal(cancelA.status, 200, JSON.stringify(cancelA.data));
      assert.equal(cancelA.data.ok, true);
      approx(await stockOf(productoId), stockInicial, "la cancelación debe restituir el stock");
      const detalleCancelado = await mercado("GET", `/pedidos/${pedidoA.id}`, { token });
      assert.equal(detalleCancelado.data.pedido.estado, "cancelado");
      const audCancel = await state.pool.query(
        "select count(*)::int as n from auditoria where tenant_id = $1 and accion = 'mercado_pedido_cancelado' and detalle->>'id' = $2",
        [TENANT, pedidoA.id],
      );
      assert.equal(audCancel.rows[0].n, 1, "la cancelación debe quedar en auditoría");

      // 409: el puesto ya lo está trabajando (el pedido A ya está anulado).
      const dobleCancel = await mercado("POST", `/pedidos/${pedidoA.id}/cancelar`, { token });
      expectError(dobleCancel, 409, /trabajando/i);

      // 403: un comprador ajeno no puede cancelar el pedido de otro.
      const cancelAjeno = await mercado("POST", `/pedidos/${pedidoA.id}/cancelar`, { token: tokenAjeno });
      expectError(cancelAjeno, 403, /tuyo/i);

      // 409 con cargador: pedido asignado a un recorrido no se puede cancelar.
      const creadoB = await mercado("POST", "/pedidos", {
        token,
        headers: { "idempotency-key": `${marca}-pedido-b` },
        body: { medioPago: "efectivo", items: [{ tenantId: TENANT, productoId, cantidad: 1 }] },
      });
      assert.equal(creadoB.status, 201, JSON.stringify(creadoB.data));
      const pedidoB = creadoB.data.pedidos[0];
      assert.equal(pedidoB.pagoEstado, "pendiente", "efectivo queda pendiente de cobro");

      await state.pool.query(
        "insert into mercado_cargadores (id, nombre, email, telefono) values ($1, $2, $3, $4)",
        [cargadorId, "E2E M9g Cargador", `e2e-${marca}-cargador@e2e.example.com`, "4000"],
      );
      await state.pool.query(
        "insert into mercado_recorridos (id, comprador_id, cargador_id) values ($1, $2, $3)",
        [recorridoId, registro.data.usuario.id, cargadorId],
      );
      await state.pool.query(
        "insert into mercado_recorrido_pedidos (id, recorrido_id, pedido_id, tenant_id) values ($1, $2, $3, $4)",
        [`e2e-parada-${marca}`, recorridoId, pedidoB.id, TENANT],
      );

      const cancelAsignado = await mercado("POST", `/pedidos/${pedidoB.id}/cancelar`, { token });
      expectError(cancelAsignado, 409, /cargador/i);
      approx(await stockOf(productoId), stockInicial - 1, "el pedido asignado mantiene la reserva");

      // Sin la asignación, la cancelación vuelve a funcionar.
      await state.pool.query("delete from mercado_recorrido_pedidos where pedido_id = $1", [pedidoB.id]);
      const cancelB = await mercado("POST", `/pedidos/${pedidoB.id}/cancelar`, { token });
      assert.equal(cancelB.status, 200, JSON.stringify(cancelB.data));
      approx(await stockOf(productoId), stockInicial, "la cancelación B debe restituir el stock");
    } finally {
      await state.pool.query("update tenants set config = $1::jsonb where id = $2", [configCanalPrevio, TENANT]);
      await state.pool.query("delete from mercado_recorrido_pedidos where recorrido_id = $1", [recorridoId]);
      await state.pool.query("delete from mercado_recorridos where id = $1", [recorridoId]);
      await state.pool.query("delete from mercado_cargadores where id = $1", [cargadorId]);
      await state.pool
        .query("update productos set publicado_online = $1 where id = $2", [publicadoPrevio, productoId])
        .catch(() => {});
    }
  });
});
