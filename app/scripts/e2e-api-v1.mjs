// Suite e2e de caracterización del contrato HTTP /api/v1 (Fase 0/1).
//
// Requiere el dev server corriendo contra la base DEV de Neon:
//   terminal 1:  npm run dev
//   terminal 2:  npm run test:e2e
//
// Cubre autenticación Bearer, matriz de permisos por rol, aislamiento de
// tenant, idempotencia (client_uuid), cobros y anulaciones, cuenta corriente,
// remitos, caja, auditoría y suscripción/contratos + legal del canal (torre).
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
  foreignTenantId: null,
  legalDraftIds: [],
  mercadoUsuarioIds: [],
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

async function signIn(email) {
  // Better Auth exige `Origin` en POST con credenciales (CSRF); la propia
  // base del servidor siempre está en trustedOrigins.
  const res = await request("POST", "/api/auth/sign-in/email", {
    body: { email, password: DEMO_PASSWORD },
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
      }

      // (h) sesiones creadas por la suite.
      if (state.tokenList.length) {
        await pool.query('delete from "session" where token = any($1::text[])', [state.tokenList]);
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
});
