import { createServerFn } from "@tanstack/react-start";
import {
  alicuotaId,
  cbteTipo,
  condicionId,
  cuitValido,
  desglosarLineas,
  docReceptor,
  esCondicion,
  nombreCbte,
  round2,
  validarReceptor,
  type Condicion,
} from "@/lib/afip-calc";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { autorizarCae, feDummy, firmarTra, hoyAR, invalidarWsaa, loginWsaa, qrFactura, type Ambiente } from "@/lib/server/afip";
import { ensureStaffForUser } from "@/lib/server/bootstrap";
import { audit, loadPedido } from "@/lib/server/context";
import type { Staff } from "@/lib/types";

type ConfigRow = {
  cuit: string | null;
  razon_social: string | null;
  domicilio: string | null;
  condicion: string;
  punto_venta: number;
  inicio_actividades: string | null;
  iibb: string | null;
  alicuota: unknown;
  ambiente: string;
  cert_pem: string | null;
  key_pem: string | null;
  habilitada: boolean;
};

function caja(staff: Staff) {
  if (staff.rol !== "admin" && staff.rol !== "cajero") throw new Error("No tenés permiso para esta acción.");
}

function publico(row: ConfigRow | null) {
  return {
    cuit: row?.cuit ?? "",
    razonSocial: row?.razon_social ?? "",
    domicilio: row?.domicilio ?? "",
    condicion: (esCondicion(row?.condicion ?? "") ? row?.condicion : "ri") as Condicion,
    puntoVenta: row?.punto_venta ?? 1,
    inicioActividades: row?.inicio_actividades ?? "",
    iibb: row?.iibb ?? "",
    alicuota: row ? num(row.alicuota) : 10.5,
    ambiente: (row?.ambiente === "prod" ? "prod" : "homo") as Ambiente,
    certCargado: Boolean(row?.cert_pem),
    keyCargada: Boolean(row?.key_pem),
    lista: Boolean(row?.cert_pem && row?.key_pem && row?.cuit && row?.razon_social),
    habilitada: Boolean(row?.habilitada && row?.cert_pem && row?.key_pem && row?.cuit && row?.razon_social),
  };
}

async function leerConfig(tenantId: string) {
  const sql = await getSql();
  const rows = await sql<ConfigRow>`
    select cuit, razon_social, domicilio, condicion, punto_venta, inicio_actividades, iibb,
           alicuota, ambiente, cert_pem, key_pem, habilitada
    from afip_config where tenant_id = ${tenantId} limit 1
  `;
  return rows[0] ?? null;
}

function exigirLista(row: ConfigRow | null): ConfigRow & { cuit: string; cert_pem: string; key_pem: string; razon_social: string } {
  if (!row?.cert_pem || !row.key_pem || !row.cuit || !row.razon_social) {
    throw new Error("Falta el certificado, la clave o el CUIT. Cargalos en ARCA.");
  }
  if (!cuitValido(row.cuit)) throw new Error("El CUIT del puesto no es válido.");
  return row as ConfigRow & { cuit: string; cert_pem: string; key_pem: string; razon_social: string };
}

function exigirHabilitada(row: ConfigRow | null) {
  const lista = exigirLista(row);
  if (!row?.habilitada) throw new Error("ARCA está inhabilitado. El dueño lo habilita en ARCA.");
  return lista;
}

type FacturaRow = {
  id: string;
  cobro_id: string | null;
  origen_id: string | null;
  cbte_tipo: number;
  punto_venta: number;
  numero: number | null;
  fecha: string;
  doc_tipo: number | null;
  doc_nro: string | null;
  receptor_nombre: string | null;
  receptor_condicion: string | null;
  emisor_razon: string | null;
  emisor_cuit: string | null;
  emisor_domicilio: string | null;
  emisor_condicion: string | null;
  emisor_iibb: string | null;
  emisor_inicio: string | null;
  ambiente: string;
  neto: unknown;
  iva: unknown;
  total: unknown;
  alicuota: unknown;
  cae: string | null;
  cae_vto: string | null;
  estado: string;
  error: string | null;
  detalle: unknown;
};

async function presentar(row: FacturaRow, conQr = true) {
  let qr: string | null = null;
  let qrUrl: string | null = null;
  if (conQr && row.cae && row.numero && row.emisor_cuit && row.doc_nro) {
    const hecho = await qrFactura({
      fecha: row.fecha,
      cuit: row.emisor_cuit.replace(/\D/g, ""),
      ptoVta: row.punto_venta,
      tipoCmp: row.cbte_tipo,
      nroCmp: row.numero,
      importe: num(row.total),
      tipoDocRec: row.doc_tipo ?? 99,
      nroDocRec: row.doc_nro,
      cae: row.cae,
    });
    qr = hecho.dataUrl;
    qrUrl = hecho.url;
  }
  const detalle = Array.isArray(row.detalle)
    ? row.detalle
    : typeof row.detalle === "string"
      ? (JSON.parse(row.detalle) as unknown[])
      : [];
  return {
    id: row.id,
    cobroId: row.cobro_id,
    origenId: row.origen_id,
    cbteTipo: row.cbte_tipo,
    nombre: nombreCbte(row.cbte_tipo),
    puntoVenta: row.punto_venta,
    numero: row.numero,
    fecha: row.fecha,
    docTipo: row.doc_tipo,
    docNro: row.doc_nro,
    receptorNombre: row.receptor_nombre,
    receptorCondicion: row.receptor_condicion,
    emisorRazon: row.emisor_razon,
    emisorCuit: row.emisor_cuit,
    emisorDomicilio: row.emisor_domicilio,
    emisorCondicion: row.emisor_condicion,
    emisorIibb: row.emisor_iibb,
    emisorInicio: row.emisor_inicio,
    ambiente: row.ambiente,
    neto: num(row.neto),
    iva: num(row.iva),
    total: num(row.total),
    alicuota: num(row.alicuota),
    cae: row.cae,
    caeVto: row.cae_vto,
    estado: row.estado,
    error: row.error,
    lineas: detalle as { nombre: string; cantidad: number; unidad: string; neto: number; iva: number; total: number }[],
    qr,
    qrUrl,
  };
}

const FACTURA_COLS = `
  id, cobro_id, origen_id, cbte_tipo, punto_venta, numero, fecha, doc_tipo, doc_nro,
  receptor_nombre, receptor_condicion, emisor_razon, emisor_cuit, emisor_domicilio,
  emisor_condicion, emisor_iibb, emisor_inicio, ambiente, neto, iva, total, alicuota,
  cae, cae_vto, estado, error, detalle
`;

export const getAfipConfig = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    caja(staff);
    return publico(await leerConfig(staff.tenantId));
  });

export const guardarAfipConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    cuit: string;
    razonSocial: string;
    domicilio: string;
    condicion: string;
    puntoVenta: number;
    inicioActividades: string;
    iibb: string;
    alicuota: number;
    ambiente: string;
    certPem?: string;
    keyPem?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin") throw new Error("Solo el dueño carga los datos de ARCA.");
    const cuit = data.cuit.replace(/\D/g, "");
    if (!cuitValido(cuit)) throw new Error("El CUIT del puesto no cierra.");
    if (!data.razonSocial.trim()) throw new Error("Falta la razón social.");
    if (!esCondicion(data.condicion) || data.condicion === "consumidor_final") {
      throw new Error("Elegí la condición frente al IVA del puesto.");
    }
    if (![0, 10.5, 21].includes(data.alicuota)) throw new Error("La alícuota tiene que ser 10,5, 21 o 0.");
    const ambiente: Ambiente = data.ambiente === "prod" ? "prod" : "homo";
    const pv = Math.round(data.puntoVenta);
    if (pv < 1 || pv > 9998) throw new Error("El punto de venta no es válido.");
    const sql = await getSql();
    const prev = await leerConfig(staff.tenantId);
    const cert = data.certPem?.trim() || prev?.cert_pem || "";
    const key = data.keyPem?.trim() || prev?.key_pem || "";
    if (cert && key) firmarTra(cert, key);
    await sql`
      insert into afip_config (
        tenant_id, cuit, razon_social, domicilio, condicion, punto_venta, inicio_actividades,
        iibb, alicuota, ambiente, cert_pem, key_pem, updated_at
      ) values (
        ${staff.tenantId}, ${cuit}, ${data.razonSocial.trim()}, ${data.domicilio.trim() || null},
        ${data.condicion}, ${pv}, ${data.inicioActividades || null}, ${data.iibb.trim() || null},
        ${data.alicuota}, ${ambiente}, ${cert || null}, ${key || null}, now()
      )
      on conflict (tenant_id) do update set
        cuit = excluded.cuit,
        razon_social = excluded.razon_social,
        domicilio = excluded.domicilio,
        condicion = excluded.condicion,
        punto_venta = excluded.punto_venta,
        inicio_actividades = excluded.inicio_actividades,
        iibb = excluded.iibb,
        alicuota = excluded.alicuota,
        ambiente = excluded.ambiente,
        cert_pem = excluded.cert_pem,
        key_pem = excluded.key_pem,
        updated_at = now()
    `;
    await audit(staff.tenantId, staff, "afip_config", "afip", { ambiente, puntoVenta: pv });
    return publico(await leerConfig(staff.tenantId));
  });

export const probarAfip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin") throw new Error("Solo el dueño prueba la conexión.");
    const row = exigirLista(await leerConfig(staff.tenantId));
    const ambiente: Ambiente = row.ambiente === "prod" ? "prod" : "homo";
    const dummy = await feDummy(ambiente);
    await loginWsaa(ambiente, row.cert_pem, row.key_pem);
    return { ...dummy, login: true };
  });

export const setArcaHabilitada = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { habilitada: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    if (staff.rol !== "admin") throw new Error("Solo el dueño habilita o inhabilita ARCA.");
    const row = await leerConfig(staff.tenantId);
    if (data.habilitada) exigirLista(row);
    if (!row) throw new Error("Primero cargá el CUIT y el certificado.");
    const sql = await getSql();
    await sql`
      update afip_config set habilitada = ${data.habilitada}, updated_at = now()
      where tenant_id = ${staff.tenantId}
    `;
    await audit(staff.tenantId, staff, data.habilitada ? "arca_habilitar" : "arca_inhabilitar", "afip", {});
    return publico(await leerConfig(staff.tenantId));
  });

export const listarFacturacion = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    caja(staff);
    const sql = await getSql();
    const pendientes = await sql<{
      id: string;
      monto: unknown;
      created_at: string;
      cliente: string;
      numero: number | null;
      ultimo_error: string | null;
    }>`
      select c.id, c.monto, c.created_at::text as created_at,
             coalesce(p.cliente_nombre, 'Mostrador') as cliente, t.numero,
             (select f.error from facturas f
               where f.cobro_id = c.id and f.estado = 'error'
               order by f.created_at desc limit 1) as ultimo_error
      from cobros c
      left join pedidos p on p.id = c.pedido_id
      left join tickets t on t.cobro_id = c.id
      where c.tenant_id = ${staff.tenantId}
        and c.anulado = false
        and not exists (
          select 1 from facturas f
          where f.cobro_id = c.id and f.estado = 'autorizada' and f.cbte_tipo in (1, 6, 11)
        )
      order by c.created_at desc
      limit 20
    `;
    const emitidas = await sql.query<FacturaRow>(
      `select ${FACTURA_COLS} from facturas where tenant_id = $1 and estado = 'autorizada' order by created_at desc limit 20`,
      [staff.tenantId],
    );
    return {
      config: publico(await leerConfig(staff.tenantId)),
      pendientes: pendientes.map((r) => ({
        id: r.id,
        monto: num(r.monto),
        createdAt: r.created_at,
        cliente: r.cliente,
        numero: r.numero == null ? null : num(r.numero),
        error: r.ultimo_error,
      })),
      emitidas: await Promise.all(emitidas.map((r) => presentar(r, false))),
    };
  });

async function facturaActiva(tenantId: string, cobroId: string) {
  const sql = await getSql();
  const rows = await sql.query<FacturaRow>(
    `select ${FACTURA_COLS} from facturas
     where tenant_id = $1 and cobro_id = $2 and estado = 'autorizada' and cbte_tipo in (1, 6, 11)
     limit 1`,
    [tenantId, cobroId],
  );
  return rows[0] ?? null;
}

async function notaActiva(tenantId: string, origenId: string) {
  const sql = await getSql();
  const rows = await sql.query<FacturaRow>(
    `select ${FACTURA_COLS} from facturas
     where tenant_id = $1 and origen_id = $2 and estado = 'autorizada' and cbte_tipo in (3, 8, 13)
     limit 1`,
    [tenantId, origenId],
  );
  return rows[0] ?? null;
}

type Linea = { nombre: string; cantidad: number; unidad: string; neto: number; iva: number; total: number };

async function pedirCae(
  ambiente: Ambiente,
  cert: string,
  key: string,
  cuit: string,
  solicitud: Parameters<typeof autorizarCae>[3],
) {
  const una = async () => autorizarCae(ambiente, cuit, await loginWsaa(ambiente, cert, key), solicitud);
  try {
    return await una();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (!/\b600\b|\b601\b/.test(msg)) throw error;
    invalidarWsaa(ambiente, cert);
    return una();
  }
}

async function insertarFactura(values: unknown[]) {
  const sql = await getSql();
  await sql.query(
    `insert into facturas (
      id, tenant_id, cobro_id, origen_id, cbte_tipo, punto_venta, numero, fecha, doc_tipo, doc_nro,
      receptor_nombre, receptor_condicion, emisor_razon, emisor_cuit, emisor_domicilio, emisor_condicion,
      emisor_iibb, emisor_inicio, ambiente, neto, iva, total, alicuota, cae, cae_vto, estado, error, detalle
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28::jsonb
    )`,
    values,
  );
}

export const emitirFactura = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { cobroId: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    caja(staff);
    const ya = await facturaActiva(staff.tenantId, data.cobroId);
    if (ya) return presentar(ya);
    const cfg = exigirHabilitada(await leerConfig(staff.tenantId));
    const sql = await getSql();
    const cobros = await sql<{
      id: string;
      monto: unknown;
      anulado: boolean;
      pedido_id: string;
      cliente_nombre: string;
      cuit: string | null;
      condicion_iva: string | null;
    }>`
      select c.id, c.monto, c.anulado, c.pedido_id, p.cliente_nombre, cl.cuit, cl.condicion_iva
      from cobros c
      join pedidos p on p.id = c.pedido_id
      left join clientes cl on cl.id = p.cliente_id
      where c.id = ${data.cobroId} and c.tenant_id = ${staff.tenantId}
      limit 1
    `;
    const cobro = cobros[0];
    if (!cobro) throw new Error("No está ese cobro.");
    if (cobro.anulado) throw new Error("Esa venta está anulada.");
    const pedido = await loadPedido(cobro.pedido_id, staff.tenantId);
    const emisorCond = (esCondicion(cfg.condicion) ? cfg.condicion : "ri") as Condicion;
    const receptorCond = (esCondicion(cobro.condicion_iva ?? "") ? cobro.condicion_iva : "consumidor_final") as Condicion;
    const tipo = cbteTipo(emisorCond, receptorCond, false);
    const doc = docReceptor(cobro.cuit, tipo);
    const discrimina = tipo === 1 || tipo === 6;
    const rate = discrimina ? num(cfg.alicuota) : 0;
    let base = (pedido?.items ?? []).map((it) => ({
      nombre: it.nombre,
      cantidad: it.cantidad,
      unidad: it.unidadLabel,
      total: it.subtotal,
    }));
    const suma = round2(base.reduce((acc, l) => acc + l.total, 0));
    if (!base.length || Math.abs(suma - num(cobro.monto)) > 0.5) {
      base = [{ nombre: "Venta de mostrador", cantidad: 1, unidad: "u", total: num(cobro.monto) }];
    }
    const desglose = desglosarLineas(base.map((l) => l.total), rate, discrimina);
    const lineas: Linea[] = base.map((l, i) => ({
      nombre: l.nombre,
      cantidad: l.cantidad,
      unidad: l.unidad,
      neto: desglose.partes[i].neto,
      iva: desglose.partes[i].iva,
      total: l.total,
    }));
    validarReceptor(desglose.total, doc, receptorCond);
    const fecha = hoyAR();
    const ambiente: Ambiente = cfg.ambiente === "prod" ? "prod" : "homo";
    const cuit = cfg.cuit.replace(/\D/g, "");
    const id = newId("fac");
    try {
      const cae = await pedirCae(ambiente, cfg.cert_pem, cfg.key_pem, cuit, {
        puntoVenta: cfg.punto_venta,
        cbteTipo: tipo,
        fecha: fecha.replace(/-/g, ""),
        docTipo: doc.docTipo,
        docNro: doc.docNro,
        neto: desglose.neto,
        iva: desglose.iva,
        total: desglose.total,
        alicuotaId: alicuotaId(rate),
        condicionId: condicionId(receptorCond),
      });
      await insertarFactura([
        id, staff.tenantId, cobro.id, null, tipo, cfg.punto_venta, cae.numero, fecha, doc.docTipo, doc.docNro,
        cobro.cliente_nombre, receptorCond, cfg.razon_social, cuit, cfg.domicilio, emisorCond,
        cfg.iibb, cfg.inicio_actividades, ambiente, desglose.neto, desglose.iva, desglose.total, rate,
        cae.cae, cae.vto, "autorizada", cae.obs, JSON.stringify(lineas),
      ]);
      await audit(staff.tenantId, staff, "factura", "factura", { id, tipo, numero: cae.numero, cae: cae.cae });
    } catch (error) {
      const repetida = await facturaActiva(staff.tenantId, cobro.id);
      if (repetida) return presentar(repetida);
      const msg = error instanceof Error ? error.message : "ARCA no autorizó.";
      await insertarFactura([
        id, staff.tenantId, cobro.id, null, tipo, cfg.punto_venta, null, fecha, doc.docTipo, doc.docNro,
        cobro.cliente_nombre, receptorCond, cfg.razon_social, cuit, cfg.domicilio, emisorCond,
        cfg.iibb, cfg.inicio_actividades, ambiente, desglose.neto, desglose.iva, desglose.total, rate,
        null, null, "error", msg, JSON.stringify(lineas),
      ]).catch(() => undefined);
      throw new Error(msg);
    }
    const hecha = await facturaActiva(staff.tenantId, cobro.id);
    if (!hecha) throw new Error("La factura se autorizó pero no pude leerla.");
    return presentar(hecha);
  });

export const emitirNotaCredito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { facturaId: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    caja(staff);
    const sql = await getSql();
    const rows = await sql.query<FacturaRow>(
      `select ${FACTURA_COLS} from facturas where id = $1 and tenant_id = $2 limit 1`,
      [data.facturaId, staff.tenantId],
    );
    const origen = rows[0];
    if (!origen || origen.estado !== "autorizada" || ![1, 6, 11].includes(origen.cbte_tipo)) {
      throw new Error("Esa factura no está autorizada.");
    }
    const previa = await notaActiva(staff.tenantId, origen.id);
    if (previa) return presentar(previa);
    const cfg = exigirHabilitada(await leerConfig(staff.tenantId));
    const tipo = origen.cbte_tipo === 1 ? 3 : origen.cbte_tipo === 6 ? 8 : 13;
    const ambiente: Ambiente = cfg.ambiente === "prod" ? "prod" : "homo";
    const cuit = cfg.cuit.replace(/\D/g, "");
    const fecha = hoyAR();
    const id = newId("fac");
    const receptor = (esCondicion(origen.receptor_condicion ?? "") ? origen.receptor_condicion : "consumidor_final") as Condicion;
    try {
      const cae = await pedirCae(ambiente, cfg.cert_pem, cfg.key_pem, cuit, {
        puntoVenta: cfg.punto_venta,
        cbteTipo: tipo,
        fecha: fecha.replace(/-/g, ""),
        docTipo: origen.doc_tipo ?? 99,
        docNro: origen.doc_nro ?? "0",
        neto: num(origen.neto),
        iva: num(origen.iva),
        total: num(origen.total),
        alicuotaId: alicuotaId(num(origen.alicuota)),
        condicionId: condicionId(receptor),
        asoc: {
          tipo: origen.cbte_tipo,
          ptoVta: origen.punto_venta,
          nro: origen.numero ?? 0,
          cuit,
          fecha: origen.fecha.replace(/-/g, ""),
        },
      });
      await insertarFactura([
        id, staff.tenantId, origen.cobro_id, origen.id, tipo, cfg.punto_venta, cae.numero, fecha,
        origen.doc_tipo, origen.doc_nro, origen.receptor_nombre, receptor,
        cfg.razon_social, cuit, cfg.domicilio, cfg.condicion, cfg.iibb, cfg.inicio_actividades,
        ambiente, num(origen.neto), num(origen.iva), num(origen.total), num(origen.alicuota),
        cae.cae, cae.vto, "autorizada", cae.obs,
        typeof origen.detalle === "string" ? origen.detalle : JSON.stringify(origen.detalle ?? []),
      ]);
      await audit(staff.tenantId, staff, "nota_credito", "factura", { id, origen: origen.id, cae: cae.cae });
    } catch (error) {
      const repetida = await notaActiva(staff.tenantId, origen.id);
      if (repetida) return presentar(repetida);
      throw error;
    }
    const hecha = await notaActiva(staff.tenantId, origen.id);
    if (!hecha) throw new Error("La nota de crédito se autorizó pero no pude leerla.");
    return presentar(hecha);
  });

export const getFactura = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    caja(staff);
    const sql = await getSql();
    const rows = await sql.query<FacturaRow>(
      `select ${FACTURA_COLS} from facturas where id = $1 and tenant_id = $2 limit 1`,
      [id, staff.tenantId],
    );
    if (!rows[0]) throw new Error("No está ese comprobante.");
    return presentar(rows[0]);
  });

