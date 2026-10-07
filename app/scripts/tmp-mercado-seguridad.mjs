#!/usr/bin/env node
/**
 * Tests negativos de seguridad del canal Mercado al Toque contra DEV
 * (fase 1, sección 10 del mandato). Nunca imprime secretos.
 * Cobertura: T1 tenant, T2 recorrido/parada (unidad de asignación del canal),
 * T3 producto, T4 pedidos ajenos, T5 escritura cross-tenant, T6 escalada de rol,
 * T7 manipulación de IDs, T8 cache. Además verifica que la auditoría registre
 * las operaciones sensibles (sección 8).
 * Idempotente: reutiliza credenciales (409 -> auth/ingreso), clave de
 * idempotencia nueva por corrida. Requiere backend con auditoría de Mercado.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  // sin .env local: usar el entorno del proceso
}

const BASE = process.env.E2E_BASE ?? "http://localhost:8080";
const CLAVE = "seguridad2026";
const COMPRADOR_A = "seg-comprador-a@frutasroman.com";
const COMPRADOR_B = "seg-comprador-b@frutasroman.com";
const CARGADOR_A = "seg-cargador-a@frutasroman.com";
const CARGADOR_B = "seg-cargador-b@frutasroman.com";
const STAFF = { email: "caja@frutasroman.com", password: "roman2026" };

let failures = 0;
function step(name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(`Fallo en paso: ${name} ${detail}`);
}

async function mercadoApi(path, { method = "GET", token, body, key } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["idempotency-key"] = key;
  const res = await fetch(`${BASE}/api/mercado/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

async function sqlRows(text, params = []) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const result = await pool.query(text, params);
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está definido.");

  // ---------- SEED ----------
  const tenants = await sqlRows(
    `select id, nombre from tenants where config->>'mercadoAlToque' = 'true' order by id`,
  );
  if (tenants.length !== 1) throw new Error(`Se esperaba 1 tenant con canal, hay ${tenants.length}.`);
  const tenant = tenants[0];
  const TENANT_FALSO = "tenant-inexistente-seg";
  console.log(`[seed] tenant ${tenant.id} (${tenant.nombre})`);

  const publicados = await sqlRows(
    `select id, nombre from productos
     where tenant_id = $1 and activo = true and publicado_online = true and stock >= 2
     order by orden nulls last, lower(nombre) limit 1`,
    [tenant.id],
  );
  if (!publicados[0]) throw new Error("No hay un producto publicado con stock.");
  const producto = publicados[0];

  const ocultos = await sqlRows(
    `select id, publicado_online from productos
     where tenant_id = $1 and activo = true order by lower(nombre) limit 3`,
    [tenant.id],
  );
  const noPublicado = ocultos.find((p) => !p.publicado_online && p.id !== producto.id);
  if (!noPublicado) throw new Error("No hay un producto activo sin publicar para el test T3.");

  async function entrarOCrear(path, payload, perfil) {
    let r = await mercadoApi(path, { method: "POST", body: payload });
    if (r.status === 409) {
      r = await mercadoApi("/auth/ingreso", {
        method: "POST",
        body: { email: payload.email, password: payload.password, perfil },
      });
    }
    if (r.status !== 201 && r.status !== 200) {
      throw new Error(`registro/ingreso ${perfil}: ${r.status} ${JSON.stringify(r.json)}`);
    }
    return r.json;
  }

  const buyerA = await entrarOCrear(
    "/auth/registro",
    {
      nombre: "Comprador Seg A",
      email: COMPRADOR_A,
      password: CLAVE,
      telefono: "3510000010",
      pais: "AR",
      tipoDocumento: "DNI",
      numeroDocumento: "30201001",
    },
    "comprador",
  );
  const tokenA = buyerA.token;
  const doc = Buffer.from(`seg-doc-${Date.now()}`).toString("base64");
  const identidadA = await mercadoApi("/identidad", {
    method: "POST",
    token: tokenA,
    body: {
      pais: "AR",
      tipoDocumento: "DNI",
      numeroDocumento: "30201001",
      documentoBase64: doc,
      selfieBase64: doc,
    },
  });
  step("seed identidad comprador A", identidadA.status === 200, JSON.stringify(identidadA.json));

  const buyerB = await entrarOCrear(
    "/auth/registro",
    {
      nombre: "Comprador Seg B",
      email: COMPRADOR_B,
      password: CLAVE,
      telefono: "3510000011",
      pais: "AR",
      tipoDocumento: "DNI",
      numeroDocumento: "30201002",
    },
    "comprador",
  );
  const tokenB = buyerB.token;

  const courierA = await entrarOCrear(
    "/auth/registro-cargador",
    { nombre: "Cargador Seg A", email: CARGADOR_A, password: CLAVE, telefono: "3510000012" },
    "cargador",
  );
  const courierTokenA = courierA.token;
  await mercadoApi("/cargador/disponibilidad", {
    method: "POST",
    token: courierTokenA,
    body: { disponibilidad: "disponible" },
  });

  const courierB = await entrarOCrear(
    "/auth/registro-cargador",
    { nombre: "Cargador Seg B", email: CARGADOR_B, password: CLAVE, telefono: "3510000013" },
    "cargador",
  );
  const courierTokenB = courierB.token;
  await mercadoApi("/cargador/disponibilidad", {
    method: "POST",
    token: courierTokenB,
    body: { disponibilidad: "no_disponible" },
  });

  // ---------- T6a. AUTENTICACIÓN ----------
  const sinToken = await mercadoApi("/pedidos");
  step("T6 sin token -> 401", sinToken.status === 401, JSON.stringify(sinToken.json));
  const tokenPodrido = await mercadoApi("/pedidos", { token: "no-es-un-token" });
  step("T6 token inválido -> 401", tokenPodrido.status === 401, JSON.stringify(tokenPodrido.json));

  // ---------- CHECKOUT BASE (comprador A) ----------
  const keyBase = `seg-${Date.now()}`;
  const checkout = await mercadoApi("/pedidos", {
    method: "POST",
    token: tokenA,
    key: `${keyBase}-cko`,
    body: {
      medioPago: "efectivo",
      nota: "seguridad",
      items: [{ tenantId: tenant.id, productoId: producto.id, cantidad: 1 }],
    },
  });
  step("base checkout comprador A -> 201", checkout.status === 201, JSON.stringify(checkout.json).slice(0, 300));
  const pedidoA = checkout.json?.pedidos?.[0]?.id;
  step("base pedidoA creado", Boolean(pedidoA), String(pedidoA));

  // ---------- T6b. ESCALADA DE ROL ----------
  const rolCheckout = await mercadoApi("/pedidos", {
    method: "POST",
    token: courierTokenA,
    key: `${keyBase}-rol1`,
    body: { medioPago: "efectivo", items: [{ tenantId: tenant.id, productoId: producto.id, cantidad: 1 }] },
  });
  step("T6 cargador intenta checkout -> 403", rolCheckout.status === 403, JSON.stringify(rolCheckout.json));

  const rolDisp = await mercadoApi("/cargador/disponibilidad", {
    method: "POST",
    token: tokenA,
    body: { disponibilidad: "disponible" },
  });
  step("T6 comprador cambia disponibilidad -> 403", rolDisp.status === 403, JSON.stringify(rolDisp.json));

  const rolIdentidad = await mercadoApi("/identidad", {
    method: "POST",
    token: courierTokenA,
    body: { pais: "AR", tipoDocumento: "DNI", numeroDocumento: "1", documentoBase64: doc, selfieBase64: doc },
  });
  step("T6 cargador sube identidad -> 403", rolIdentidad.status === 403, JSON.stringify(rolIdentidad.json));

  // ---------- T1. TENANT ISOLATION ----------
  const tenantFalso = await mercadoApi("/pedidos", {
    method: "POST",
    token: tokenA,
    key: `${keyBase}-t1a`,
    body: {
      medioPago: "efectivo",
      items: [{ tenantId: TENANT_FALSO, productoId: producto.id, cantidad: 1 }],
    },
  });
  step("T1 tenant inexistente -> 404", tenantFalso.status === 404, JSON.stringify(tenantFalso.json));

  const sinFilas = (
    await sqlRows(
      `select count(*)::int as n from pedidos
       where comprador_mercado_id = $1 and tenant_id = $2`,
      [buyerA.usuario.id, TENANT_FALSO],
    )
  )[0];
  step("T1 sin pedido escrito contra tenant falso", sinFilas.n === 0, String(sinFilas.n));

  // ---------- T3. PRODUCTO ----------
  const noPublico = await mercadoApi("/pedidos", {
    method: "POST",
    token: tokenA,
    key: `${keyBase}-t3a`,
    body: {
      medioPago: "efectivo",
      items: [{ tenantId: tenant.id, productoId: noPublicado.id, cantidad: 1 }],
    },
  });
  step("T3 producto no publicado -> 404", noPublico.status === 404, JSON.stringify(noPublico.json));

  const productoFalso = await mercadoApi("/pedidos", {
    method: "POST",
    token: tokenA,
    key: `${keyBase}-t3b`,
    body: {
      medioPago: "efectivo",
      items: [{ tenantId: tenant.id, productoId: "producto-inexistente-seg", cantidad: 1 }],
    },
  });
  step("T3 producto inexistente -> 404", productoFalso.status === 404, JSON.stringify(productoFalso.json));

  const catalogoAjeno = await mercadoApi(`/puestos/${TENANT_FALSO}/productos`, { token: tokenA });
  step("T3 catálogo de puesto ajeno -> 404", catalogoAjeno.status === 404, JSON.stringify(catalogoAjeno.json));

  const cantidadMala = await mercadoApi("/pedidos", {
    method: "POST",
    token: tokenA,
    key: `${keyBase}-t3c`,
    body: {
      medioPago: "efectivo",
      items: [{ tenantId: tenant.id, productoId: producto.id, cantidad: 0 }],
    },
  });
  step("T3 cantidad 0 -> 400", cantidadMala.status === 400, JSON.stringify(cantidadMala.json));

  // ---------- T4. PEDIDOS AJENOS ----------
  const pedidoAjeno = await mercadoApi(`/pedidos/${pedidoA}`, { token: tokenB });
  step("T4 comprador B lee pedido de A -> 404", pedidoAjeno.status === 404, JSON.stringify(pedidoAjeno.json));

  const listadoB = await mercadoApi("/pedidos", { token: tokenB });
  const filtracion = (listadoB.json?.pedidos ?? []).some((p) => p.id === pedidoA);
  step("T4 listado de B no contiene pedidos de A", listadoB.status === 200 && !filtracion, JSON.stringify(listadoB.json).slice(0, 200));

  // ---------- PREPARACIÓN (staff) ----------
  const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(STAFF),
  });
  const staffJson = await signIn.json();
  const staffToken = staffJson?.token ?? staffJson?.data?.token;
  step("seed staff sign-in", signIn.ok && Boolean(staffToken), String(signIn.status));
  for (const estado of ["en_preparacion", "listo"]) {
    const r = await fetch(`${BASE}/api/v1/pedidos/${pedidoA}/estado`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ estado }),
    });
    step(`seed staff ${estado}`, r.ok, String(r.status));
  }

  // ---------- T5. ESCRITURA CROSS-TENANT (recorrido con pedido ajeno) ----------
  const recAjeno = await mercadoApi("/recorridos", {
    method: "POST",
    token: tokenB,
    key: `${keyBase}-t5a`,
    body: { cargadorId: courierA.usuario.id, pedidoIds: [pedidoA] },
  });
  step("T5 B crea recorrido con pedido de A -> 400", recAjeno.status === 400 && recAjeno.json?.error === "orders_not_ready", JSON.stringify(recAjeno.json));

  const paradasPedidoA = (
    await sqlRows(`select count(*)::int as n from mercado_recorrido_pedidos where pedido_id = $1`, [pedidoA])
  )[0];
  step("T5 pedido de A sin paradas escritas por B", paradasPedidoA.n === 0, String(paradasPedidoA.n));

  // ---------- RECORRIDO REAL (A) ----------
  const recorrido = await mercadoApi("/recorridos", {
    method: "POST",
    token: tokenA,
    key: `${keyBase}-rec`,
    body: { cargadorId: courierA.usuario.id, pedidoIds: [pedidoA] },
  });
  step("base recorrido A creado -> 201", recorrido.status === 201, JSON.stringify(recorrido.json).slice(0, 300));
  const recA = recorrido.json?.recorrido?.id;
  step("base recA creado", Boolean(recA), String(recA));

  // ---------- T2. AISLAMIENTO POR RECORRIDO (unidad de asignación) ----------
  const aceptarAjeno = await mercadoApi(`/recorridos/${recA}/aceptar`, {
    method: "POST",
    token: courierTokenB,
    key: `${keyBase}-t2a`,
  });
  step("T2 cargador B acepta recorrido de A -> 404", aceptarAjeno.status === 404, JSON.stringify(aceptarAjeno.json));

  const retirarAjeno = await mercadoApi(`/recorridos/${recA}/retirar`, {
    method: "POST",
    token: courierTokenB,
    key: `${keyBase}-t2b`,
    body: { pedidoId: pedidoA },
  });
  step("T2 cargador B retira parada de A -> 404", retirarAjeno.status === 404, JSON.stringify(retirarAjeno.json));

  const calificarAjeno = await mercadoApi(`/recorridos/${recA}/calificar`, {
    method: "POST",
    token: tokenB,
    body: { estrellas: 1, comentario: "seg" },
  });
  step("T5/T2 B califica recorrido de A -> 404", calificarAjeno.status === 404, JSON.stringify(calificarAjeno.json));

  const calificacionesAjenas = (
    await sqlRows(`select count(*)::int as n from mercado_calificaciones where recorrido_id = $1`, [recA])
  )[0];
  step("T5 sin calificación escrita por B", calificacionesAjenas.n === 0, String(calificacionesAjenas.n));

  // ---------- T6c. ESCALADA EN OPERACIÓN DE RECORRIDO ----------
  const compradorAcepta = await mercadoApi(`/recorridos/${recA}/aceptar`, {
    method: "POST",
    token: tokenA,
    key: `${keyBase}-t6c`,
  });
  step("T6 comprador acepta recorrido -> 403", compradorAcepta.status === 403, JSON.stringify(compradorAcepta.json));

  // ---------- T7. MANIPULACIÓN DE IDS ----------
  const suplantacion = await mercadoApi("/cargador/disponibilidad", {
    method: "POST",
    token: courierTokenA,
    body: { disponibilidad: "no_disponible", id: courierB.usuario.id, usuarioId: courierB.usuario.id },
  });
  step("T7 payload con id ajeno aceptado (actor manda)", suplantacion.status === 200, JSON.stringify(suplantacion.json));

  const dispB = (
    await sqlRows(`select disponibilidad from mercado_cargadores where id = $1`, [courierB.usuario.id])
  )[0];
  step("T7 disponibilidad de B intacta", dispB?.disponibilidad === "no_disponible", String(dispB?.disponibilidad));

  const pedidoInexistente = await mercadoApi("/pedidos/pe-seg-inexistente", { token: tokenA });
  step("T7 pedido inexistente -> 404", pedidoInexistente.status === 404, JSON.stringify(pedidoInexistente.json));

  const recorridosB = await mercadoApi("/recorridos", { token: courierTokenB });
  const recAEnB = (recorridosB.json?.recorridos ?? []).some((r) => r.id === recA);
  step("T7 listado de recorridos de B sin recorridos de A", recorridosB.status === 200 && !recAEnB, JSON.stringify(recorridosB.json).slice(0, 200));

  // ---------- CICLO COMPLETO (para auditoría) ----------
  for (const [path, body] of [
    [`/recorridos/${recA}/aceptar`, null],
    [`/recorridos/${recA}/retirar`, { pedidoId: pedidoA }],
    [`/recorridos/${recA}/entregar`, { pedidoId: pedidoA }],
  ]) {
    const r = await mercadoApi(path, {
      method: "POST",
      token: courierTokenA,
      key: `${keyBase}-ciclo-${path.split("/").pop()}`,
      ...(body ? { body } : {}),
    });
    step(`base ciclo ${path.split("/").pop()} -> 200`, r.status === 200, JSON.stringify(r.json).slice(0, 200));
  }
  const calificacion = await mercadoApi(`/recorridos/${recA}/calificar`, {
    method: "POST",
    token: tokenA,
    body: { estrellas: 5, comentario: "seg" },
  });
  step("base calificación A -> 200", calificacion.status === 200, JSON.stringify(calificacion.json).slice(0, 200));

  // ---------- T8. CACHE ----------
  const pedidosCache = await mercadoApi("/pedidos", { token: tokenA });
  const ccPedidos = pedidosCache.headers.get("cache-control") ?? "";
  const varyPedidos = pedidosCache.headers.get("vary") ?? "";
  step("T8 GET /pedidos no-store", ccPedidos.includes("no-store"), ccPedidos);
  step("T8 GET /pedidos vary authorization", varyPedidos.toLowerCase().includes("authorization"), varyPedidos);

  const ranking = await fetch(`${BASE}/api/mercado/v1/ranking`);
  step("T8 ranking público max-age=60", (ranking.headers.get("cache-control") ?? "").includes("max-age=60"), String(ranking.headers.get("cache-control")));

  const ingreso = await mercadoApi("/auth/ingreso", {
    method: "POST",
    body: { email: CARGADOR_A, password: CLAVE, perfil: "cargador" },
  });
  step("T8 ingreso no-store", (ingreso.headers.get("cache-control") ?? "").includes("no-store"), String(ingreso.headers.get("cache-control")));

  const puestos = await mercadoApi("/puestos", { token: tokenA });
  step("T8 puestos autenticado no-store", (puestos.headers.get("cache-control") ?? "").includes("no-store"), String(puestos.headers.get("cache-control")));

  // ---------- AUDITORÍA (sección 8) ----------
  const auditPedido = (
    await sqlRows(
      `select count(*)::int as n from auditoria
       where accion = 'mercado_pedido_creado' and usuario_id = $1
         and detalle->>'id' = $2 and tenant_id = $3`,
      [buyerA.usuario.id, pedidoA, tenant.id],
    )
  )[0];
  step("auditoría pedido_creado registrada", auditPedido.n === 1, String(auditPedido.n));

  const auditRecorrido = (
    await sqlRows(
      `select count(*)::int as n from auditoria
       where accion in ('mercado_recorrido_creado', 'mercado_recorrido_aceptado',
                        'mercado_parada_retirada', 'mercado_parada_entregada',
                        'mercado_recorrido_calificado')
         and detalle->>'id' = $1`,
      [recA],
    )
  )[0];
  step("auditoría ciclo recorrido completa (5 eventos)", auditRecorrido.n === 5, String(auditRecorrido.n));

  console.log(`\n[resumen] seguridad — pedido ${pedidoA}, recorrido ${recA}, fallos: ${failures}`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("[seguridad] abortado:", error?.message ?? error);
  process.exit(1);
});
