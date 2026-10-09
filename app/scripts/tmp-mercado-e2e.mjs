#!/usr/bin/env node
/**
 * E2E del canal Mercado al Toque contra DEV (solo lectura de secretos, nunca los imprime).
 * Flujo: puestos -> productos -> checkout efectivo -> reserva stock -> Mostrador
 * (preparación -> listo) -> recorrido del cargador -> retiro.
 * Idempotente: re-ejecutar reutiliza credenciales (409 email_in_use -> auth/ingreso)
 * y genera una Idempotency-Key nueva por corrida.
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
const BUYER = "mercado-e2e-comprador@frutasroman.com";
const COURIER = "mercado-e2e-cargador@frutasroman.com";
const PASSWORD = "mercado2026";
const STAFF = { email: "caja@frutasroman.com", password: "roman2026" };

let failures = 0;
function step(name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(`Fallo en paso: ${name} ${detail}`);
}

function assert(cond, label, detail = "") {
  step(label, Boolean(cond), detail);
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
  return { status: res.status, json };
}

async function v1Api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
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
    `select id, nombre, config->>'mercadoAlToque' as flag from tenants order by id`,
  );
  if (tenants.length !== 1) throw new Error(`Se esperaba 1 tenant DEV, hay ${tenants.length}.`);
  const tenant = tenants[0];
  if (tenant.flag !== "true") {
    await sqlRows(
      `update tenants set config = config || '{"mercadoAlToque":"true"}'::jsonb where id = $1`,
      [tenant.id],
    );
    console.log(`[seed] canal habilitado en tenant ${tenant.id} (${tenant.nombre})`);
  } else {
    console.log(`[seed] canal ya habilitado en tenant ${tenant.id} (${tenant.nombre})`);
  }

  const candidatos = await sqlRows(
    `select id, nombre, stock, precio, unidad from productos
     where tenant_id = $1 and activo = true and stock >= 5
     order by orden nulls last, lower(nombre) limit 3`,
    [tenant.id],
  );
  if (candidatos.length < 3) throw new Error("No hay 3 productos activos con stock suficiente.");
  for (const p of candidatos) {
    await sqlRows(`update productos set publicado_online = true where id = $1`, [p.id]);
  }
  console.log(
    `[seed] publicados: ${candidatos.map((p) => `${p.nombre} (stock ${Number(p.stock)}, $${Number(p.precio)})`).join(" | ")}`,
  );

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

  const buyerAuth = await entrarOCrear(
    "/auth/registro",
    {
      nombre: "Comprador E2E",
      email: BUYER,
      password: PASSWORD,
      telefono: "3510000000",
      pais: "AR",
      tipoDocumento: "DNI",
      numeroDocumento: "30111222",
    },
    "comprador",
  );
  const buyerToken = buyerAuth.token;
  assert(Boolean(buyerToken), "seed comprador registrado/ingresado", BUYER);

  const dummyDoc = Buffer.from(`e2e-documento-${Date.now()}`).toString("base64");
  const identidad = await mercadoApi("/identidad", {
    method: "POST",
    token: buyerToken,
    body: {
      pais: "AR",
      tipoDocumento: "DNI",
      numeroDocumento: "30111222",
      documentoBase64: dummyDoc,
      selfieBase64: dummyDoc,
    },
  });
  assert(identidad.status === 200, "identidad cargada", JSON.stringify(identidad.json));
  const yo = await mercadoApi("/yo", { token: buyerToken });
  assert(
    yo.json?.estadoIdentidad === "documentacion_cargada",
    "estado identidad documentacion_cargada",
    JSON.stringify(yo.json),
  );

  const courierAuth = await entrarOCrear(
    "/auth/registro-cargador",
    { nombre: "Cargador E2E", email: COURIER, password: PASSWORD, telefono: "3510000001" },
    "cargador",
  );
  const courierToken = courierAuth.token;
  assert(Boolean(courierToken), "seed cargador registrado/ingresado", COURIER);
  const disp = await mercadoApi("/cargador/disponibilidad", {
    method: "POST",
    token: courierToken,
    body: { disponibilidad: "disponible" },
  });
  assert(disp.status === 200 && disp.json?.disponibilidad === "disponible", "cargador disponible");

  // ---------- A. PUESTOS ----------
  const puestos = await mercadoApi("/puestos", { token: buyerToken });
  const puesto = (puestos.json?.puestos ?? []).find((p) => p.id === tenant.id);
  assert(puestos.status === 200 && Boolean(puesto), "A. puestos lista el tenant", JSON.stringify(puestos.json));
  assert(
    ["presencia", "pro"].includes(puesto.tier),
    "A. puesto expone tier de Torre",
    String(puesto.tier),
  );
  const bajadaDb = (
    await sqlRows(`select config->>'bajada' as bajada from tenants where id = $1`, [tenant.id])
  )[0];
  assert(
    (puesto.bajada ?? null) === (bajadaDb?.bajada ?? null),
    "A. bajada coincide con config.bajada",
    `${puesto.bajada} vs ${bajadaDb?.bajada}`,
  );

  // ---------- B. PRODUCTOS PUBLICADOS ----------
  const catalogo = await mercadoApi(`/puestos/${tenant.id}/productos`, { token: buyerToken });
  const publicados = catalogo.json?.productos ?? [];
  const elegidos = candidatos.map((p) => {
    const row = publicados.find((x) => x.id === p.id);
    assert(
      Boolean(row) && Number(row.precio) === Number(p.precio),
      `B. publicado en catálogo: ${p.nombre}`,
      JSON.stringify(row ?? publicados.map((x) => x.id)),
    );
    return { ...p, precioOnline: Number(row.precio), stockAntes: Number(p.stock) };
  });

  // ---------- C. CHECKOUT EFECTIVO ----------
  const cantidades = [2, 1, 1];
  const items = elegidos.map((p, i) => ({
    tenantId: tenant.id,
    productoId: p.id,
    cantidad: cantidades[i],
  }));
  const idemKey = `e2e-mercado-${Date.now()}`;
  const checkout = await mercadoApi("/pedidos", {
    method: "POST",
    token: buyerToken,
    key: idemKey,
    body: { medioPago: "efectivo", nota: "e2e canal", items },
  });
  assert(checkout.status === 201, "C. checkout 201", JSON.stringify(checkout.json).slice(0, 400));
  const pedidosResp = checkout.json?.pedidos ?? [];
  assert(pedidosResp.length === 1, "C. un pedido por puesto", String(pedidosResp.length));
  const pedido = pedidosResp[0];
  assert(pedido.estado === "confirmado", "C. estado confirmado", pedido.estado);
  assert(pedido.medioPago === "efectivo", "C. efectivo", pedido.medioPago);
  assert(pedido.pagoEstado === "pendiente", "C. pagoEstado pendiente", pedido.pagoEstado);
  for (let i = 0; i < elegidos.length; i += 1) {
    const item = (pedido.items ?? []).find((x) => x.productoId === elegidos[i].id);
    assert(
      item && item.precioUnitario === elegidos[i].precioOnline && item.cantidad === cantidades[i],
      `C. precio congelado ${elegidos[i].nombre}`,
      JSON.stringify(item),
    );
  }
  const esperadoTotal = elegidos.reduce(
    (sum, p, i) => sum + p.precioOnline * cantidades[i],
    0,
  );
  assert(
    Math.abs(pedido.total - esperadoTotal) < 0.01,
    "C. total correcto",
    `${pedido.total} vs ${esperadoTotal}`,
  );
  const bultosEsperados = elegidos.reduce(
    (sum, p, i) => sum + (p.unidad === "bulto" ? cantidades[i] : 0),
    0,
  );
  assert(pedido.bultos === bultosEsperados, "C. bultos servidor", `${pedido.bultos} vs ${bultosEsperados}`);

  // ---------- D. RESERVA DE STOCK ----------
  for (let i = 0; i < elegidos.length; i += 1) {
    const p = elegidos[i];
    const stockRow = (
      await sqlRows(`select stock from productos where id = $1 and tenant_id = $2`, [p.id, tenant.id])
    )[0];
    assert(
      Number(stockRow.stock) === p.stockAntes - cantidades[i],
      `D. stock descontado ${p.nombre}`,
      `${Number(stockRow.stock)} vs ${p.stockAntes - cantidades[i]}`,
    );
    const mov = (
      await sqlRows(
        `select coalesce(sum(cantidad),0)::float8 as n, count(*)::int as filas
         from stock_movimientos
         where tenant_id = $1 and referencia = $2 and tipo = 'reserva' and producto_id = $3`,
        [tenant.id, pedido.id, p.id],
      )
    )[0];
    assert(
      mov.filas >= 1 && Number(mov.n) === -cantidades[i],
      `D. movimiento reserva ${p.nombre}`,
      JSON.stringify(mov),
    );
  }

  // ---------- E. IDEMPOTENCIA ----------
  const replay = await mercadoApi("/pedidos", {
    method: "POST",
    token: buyerToken,
    key: idemKey,
    body: { medioPago: "efectivo", nota: "e2e canal", items },
  });
  assert(
    replay.status === 201 && replay.json?.pedidos?.[0]?.id === pedido.id,
    "E. reenvío misma clave -> mismo pedido",
    JSON.stringify(replay.json).slice(0, 200),
  );
  const dup = (
    await sqlRows(
      `select count(*)::int as n from pedidos where id = $1 and origen = 'mercado_al_toque'`,
      [pedido.id],
    )
  )[0];
  assert(dup.n === 1, "E. sin duplicados", String(dup.n));

  // ---------- F. MOSTRADOR ----------
  const elegibilidad = await mercadoApi("/recorridos", {
    method: "POST",
    token: buyerToken,
    key: `e2e-elig-${Date.now()}`,
    body: { cargadorId: courierAuth.usuario.id, pedidoIds: [pedido.id] },
  });
  assert(
    elegibilidad.status === 400 && elegibilidad.json?.error === "orders_not_ready",
    "F. elegibilidad negativa con pedido enviado",
    JSON.stringify(elegibilidad.json),
  );

  const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(STAFF),
  });
  const staffJson = await signIn.json();
  const staffToken = staffJson?.token ?? staffJson?.data?.token;
  assert(signIn.ok && Boolean(staffToken), "F. staff sign-in", String(signIn.status));

  const bandeja = await v1Api("/pedidos", { token: staffToken });
  const enBandeja = (bandeja.json?.data ?? []).find((p) => p.id === pedido.id);
  assert(
    Boolean(enBandeja) && enBandeja.estado === "enviado",
    "F. pedido en bandeja Mostrador (tenant correcto)",
    JSON.stringify(enBandeja ?? bandeja.json).slice(0, 300),
  );

  const salto = await v1Api(`/pedidos/${pedido.id}/estado`, {
    method: "POST",
    token: staffToken,
    body: { estado: "listo" },
  });
  assert(salto.status === 400, "F. salto inválido enviado->listo rechazado", JSON.stringify(salto.json));

  const prep = await v1Api(`/pedidos/${pedido.id}/estado`, {
    method: "POST",
    token: staffToken,
    body: { estado: "en_preparacion" },
  });
  assert(prep.status === 200 && prep.json?.data?.estado === "en_preparacion", "F. en_preparacion", JSON.stringify(prep.json).slice(0, 200));
  const ts1 = (
    await sqlRows(`select preparation_started_at::text as t from pedidos where id = $1`, [pedido.id])
  )[0];
  assert(Boolean(ts1?.t), "F. preparation_started_at escrito", String(ts1?.t));
  const vistaPrep = await mercadoApi(`/pedidos/${pedido.id}`, { token: buyerToken });
  assert(
    vistaPrep.json?.pedido?.estado === "en_preparacion",
    "F. comprador ve en_preparacion",
    JSON.stringify(vistaPrep.json).slice(0, 200),
  );

  const listo = await v1Api(`/pedidos/${pedido.id}/estado`, {
    method: "POST",
    token: staffToken,
    body: { estado: "listo" },
  });
  assert(listo.status === 200 && listo.json?.data?.estado === "listo", "F. listo", JSON.stringify(listo.json).slice(0, 200));
  const ts2 = (await sqlRows(`select prepared_at::text as t from pedidos where id = $1`, [pedido.id]))[0];
  assert(Boolean(ts2?.t), "F. prepared_at escrito", String(ts2?.t));
  const vistaListo = await mercadoApi(`/pedidos/${pedido.id}`, { token: buyerToken });
  assert(
    vistaListo.json?.pedido?.estado === "preparado",
    "F. comprador ve preparado",
    JSON.stringify(vistaListo.json).slice(0, 200),
  );

  // ---------- G. CARGADOR (recorrido + retiro) ----------
  const listaCargadores = await mercadoApi("/cargadores", { token: buyerToken });
  const enLista = (listaCargadores.json?.cargadores ?? []).find(
    (c) => c.id === courierAuth.usuario.id,
  );
  assert(Boolean(enLista), "G. cargador visible y disponible", JSON.stringify(listaCargadores.json).slice(0, 300));
  assert(
    enLista.nombre === "Cargador" && enLista.nombre !== "Cargador E2E",
    "G. nombre anonimizado (primer nombre)",
    String(enLista.nombre),
  );

  const recorrido = await mercadoApi("/recorridos", {
    method: "POST",
    token: buyerToken,
    key: `e2e-rec-${Date.now()}`,
    body: { cargadorId: courierAuth.usuario.id, pedidoIds: [pedido.id] },
  });
  assert(recorrido.status === 201, "G. recorrido creado", JSON.stringify(recorrido.json).slice(0, 300));
  const rec = recorrido.json?.recorrido;
  assert(rec?.estado === "asignado" && rec?.paradas?.length === 1, "G. recorrido asignado con 1 parada", JSON.stringify(rec).slice(0, 300));

  const aceptar = await mercadoApi(`/recorridos/${rec.id}/aceptar`, {
    method: "POST",
    token: courierToken,
    key: `e2e-acep-${Date.now()}`,
  });
  assert(aceptar.status === 200 && aceptar.json?.recorrido?.estado === "aceptado", "G. recorrido aceptado", JSON.stringify(aceptar.json).slice(0, 200));

  const retirar = await mercadoApi(`/recorridos/${rec.id}/retirar`, {
    method: "POST",
    token: courierToken,
    key: `e2e-ret-${Date.now()}`,
    body: { pedidoId: pedido.id },
  });
  const parada = retirar.json?.recorrido?.paradas?.[0];
  assert(
    retirar.status === 200 && parada?.estado === "retirado",
    "G. parada retirada",
    JSON.stringify(retirar.json).slice(0, 300),
  );
  const picked = (
    await sqlRows(`select picked_up_at::text as t from pedidos where id = $1`, [pedido.id])
  )[0];
  assert(Boolean(picked?.t), "G. pedidos.picked_up_at escrito", String(picked?.t));

  const puntosAntes = (
    await sqlRows(`select puntos::int as p from mercado_cargadores where id = $1`, [
      courierAuth.usuario.id,
    ])
  )[0]?.p;
  const entregar = await mercadoApi(`/recorridos/${rec.id}/entregar`, {
    method: "POST",
    token: courierToken,
    key: `e2e-ent-${Date.now()}`,
    body: { pedidoId: pedido.id },
  });
  const entregaJson = JSON.stringify(entregar.json).slice(0, 300);
  assert(
    entregar.status === 200 &&
      entregar.json?.recorrido?.estado === "entregado" &&
      entregar.json?.recorrido?.paradas?.[0]?.estado === "entregado",
    "G. parada y recorrido entregados",
    entregaJson,
  );
  const punto = (
    await sqlRows(
      `select puntos::int as p, count(*)::int as n
       from mercado_punto_movimientos
       where recorrido_id = $1 and motivo = 'recorrido_entregado'
       group by puntos`,
      [rec.id],
    )
  )[0];
  assert(punto?.p === 10, "G. regla recorrido_entregado otorga +10", String(punto?.p));
  assert(punto?.n === 1, "G. movimiento único por recorrido y motivo", String(punto?.n));
  const puntosDespues = (
    await sqlRows(`select puntos::int as p from mercado_cargadores where id = $1`, [
      courierAuth.usuario.id,
    ])
  )[0]?.p;
  assert(
    puntosDespues === puntosAntes + 10,
    "G. puntos del cargador +10",
    `${puntosAntes} -> ${puntosDespues}`,
  );
  const listaNivel = await mercadoApi("/cargadores", { token: buyerToken });
  const nivelVisto = (listaNivel.json?.cargadores ?? []).find(
    (c) => c.id === courierAuth.usuario.id,
  )?.nivel;
  const nivelEsperado = (
    await sqlRows(
      `select nombre from mercado_niveles where puntos_minimos <= $1
       order by puntos_minimos desc limit 1`,
      [puntosDespues],
    )
  )[0]?.nombre;
  assert(
    nivelVisto === (nivelEsperado ?? "Inicial"),
    "G. nivel derivado según puntos sembrados",
    `${nivelVisto} vs ${nivelEsperado}`,
  );

  // ---------- H. CALIFICACIÓN Y ESTADO COMPRADOR FINAL ----------
  const calificar = await mercadoApi(`/recorridos/${rec.id}/calificar`, {
    method: "POST",
    token: buyerToken,
    body: { estrellas: 5, comentario: "e2e" },
  });
  assert(
    calificar.status === 200 && calificar.json?.calificacion?.estrellas === 5,
    "H. recorrido calificado",
    JSON.stringify(calificar.json).slice(0, 200),
  );
  const califPunto = (
    await sqlRows(
      `select puntos::int as p from mercado_punto_movimientos
       where recorrido_id = $1 and motivo = 'buena_calificacion'`,
      [rec.id],
    )
  )[0];
  assert(califPunto?.p === 5, "H. buena calificación (5★) otorga +5", String(califPunto?.p));
  const puntosPostCalif = (
    await sqlRows(`select puntos::int as p from mercado_cargadores where id = $1`, [
      courierAuth.usuario.id,
    ])
  )[0]?.p;
  assert(
    puntosPostCalif === puntosDespues + 5,
    "H. puntos acumulan +5 tras calificar",
    `${puntosDespues} -> ${puntosPostCalif}`,
  );

  const final = await mercadoApi(`/pedidos/${pedido.id}`, { token: buyerToken });
  const fp = final.json?.pedido;
  assert(fp?.estado === "entregado" && Boolean(fp?.deliveredAt), "H. comprador ve entregado", JSON.stringify(fp).slice(0, 300));
  const listado = await mercadoApi("/pedidos", { token: buyerToken });
  const enListado = (listado.json?.pedidos ?? []).find((p) => p.id === pedido.id);
  assert(enListado?.estado === "entregado", "H. listado comprador incluye el pedido");

  // ---------- J. RECHAZO DEL CARGADOR (penalización y re-asignación) ----------
  const catalogoJ = await mercadoApi(`/puestos/${tenant.id}/productos`, { token: buyerToken });
  const conStock = (catalogoJ.json?.productos ?? []).filter((p) => Number(p.disponible) >= 1);
  if (conStock.length === 0) {
    console.log("[SKIP] J. sin stock publicado para probar el rechazo");
  } else {
    const itemJ = conStock[0];
    const checkoutJ = await mercadoApi("/pedidos", {
      method: "POST",
      token: buyerToken,
      key: `e2e-j-${Date.now()}`,
      body: {
        medioPago: "efectivo",
        nota: "e2e rechazo",
        items: [{ tenantId: tenant.id, productoId: itemJ.id, cantidad: 1 }],
      },
    });
    assert(
      checkoutJ.status === 201,
      "J. checkout del segundo pedido",
      JSON.stringify(checkoutJ.json).slice(0, 300),
    );
    const pedidoJ = checkoutJ.json?.pedidos?.[0];
    const prepJ = await v1Api(`/pedidos/${pedidoJ.id}/estado`, {
      method: "POST",
      token: staffToken,
      body: { estado: "en_preparacion" },
    });
    assert(prepJ.status === 200, "J. staff en_preparacion", JSON.stringify(prepJ.json).slice(0, 200));
    const listoJ = await v1Api(`/pedidos/${pedidoJ.id}/estado`, {
      method: "POST",
      token: staffToken,
      body: { estado: "listo" },
    });
    assert(listoJ.status === 200, "J. staff listo", JSON.stringify(listoJ.json).slice(0, 200));
    const puntosPreRechazo = (
      await sqlRows(`select puntos::int as p from mercado_cargadores where id = $1`, [
        courierAuth.usuario.id,
      ])
    )[0]?.p;
    const recJ = await mercadoApi("/recorridos", {
      method: "POST",
      token: buyerToken,
      key: `e2e-recj-${Date.now()}`,
      body: { cargadorId: courierAuth.usuario.id, pedidoIds: [pedidoJ.id] },
    });
    assert(
      recJ.status === 201,
      "J. recorrido creado para rechazo",
      JSON.stringify(recJ.json).slice(0, 300),
    );
    const recjId = recJ.json?.recorrido?.id;
    const rechazo = await mercadoApi(`/recorridos/${recjId}/rechazar`, {
      method: "POST",
      token: courierToken,
      key: `e2e-rech-${Date.now()}`,
    });
    assert(
      rechazo.status === 200 && rechazo.json?.recorrido?.estado === "rechazado",
      "J. recorrido rechazado",
      JSON.stringify(rechazo.json).slice(0, 300),
    );
    const paradasJ = (
      await sqlRows(
        `select count(*)::int as n from mercado_recorrido_pedidos where recorrido_id = $1`,
        [recjId],
      )
    )[0]?.n;
    assert(paradasJ === 0, "J. paradas liberadas al rechazar", String(paradasJ));
    const movCancel = (
      await sqlRows(
        `select puntos::int as p from mercado_punto_movimientos
         where recorrido_id = $1 and motivo = 'cancelacion'`,
        [recjId],
      )
    )[0];
    assert(movCancel?.p === -20, "J. regla cancelacion penaliza -20", String(movCancel?.p));
    const puntosPostRechazo = (
      await sqlRows(`select puntos::int as p from mercado_cargadores where id = $1`, [
        courierAuth.usuario.id,
      ])
    )[0]?.p;
    assert(
      puntosPostRechazo === puntosPreRechazo - 20,
      "J. puntos del cargador -20",
      `${puntosPreRechazo} -> ${puntosPostRechazo}`,
    );
    const reasignar = await mercadoApi("/recorridos", {
      method: "POST",
      token: buyerToken,
      key: `e2e-recj2-${Date.now()}`,
      body: { cargadorId: courierAuth.usuario.id, pedidoIds: [pedidoJ.id] },
    });
    assert(
      reasignar.status === 201,
      "J. pedido liberado: el comprador puede reasignar",
      JSON.stringify(reasignar.json).slice(0, 300),
    );
    const recj2Id = reasignar.json?.recorrido?.id;
    const rechazo2 = await mercadoApi(`/recorridos/${recj2Id}/rechazar`, {
      method: "POST",
      token: courierToken,
      key: `e2e-rech2-${Date.now()}`,
    });
    assert(
      rechazo2.status === 200,
      "J. segundo recorrido también rechazable",
      JSON.stringify(rechazo2.json).slice(0, 200),
    );
    const movCancel2 = (
      await sqlRows(
        `select count(*)::int as n from mercado_punto_movimientos
         where cargador_id = $1 and motivo = 'cancelacion'`,
        [courierAuth.usuario.id],
      )
    )[0]?.n;
    assert(movCancel2 >= 2, "J. cada rechazo registra su penalización", String(movCancel2));
  }

  console.log(
    `\n[resumen] corrida completa — pedido ${pedido.id}, recorrido ${rec.id}, fallos: ${failures}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("[e2e] abortado:", error?.message ?? error);
  process.exit(1);
});
