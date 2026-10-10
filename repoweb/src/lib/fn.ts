import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { appApi, AppApiError } from "@/lib/app-api.server";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { num } from "@/lib/money";
import { matchProduct } from "@/lib/server/match";
import { applyStock } from "@/lib/server/stock";
import {
  assertRole,
  audit,
  getMarcaCompleta,
  getTenant,
  loadStaffByUserId,
  mapProducto,
} from "@/lib/server/context";
import { ensureBootstrapped, ensureStaffForUser, seedDemoAccounts } from "@/lib/server/bootstrap";
import { condicionOperativa, puedeAparecer } from "@/lib/torre/presencia";
import type { TicketContenido } from "@/lib/termica";
import type {
  Alerta,
  Cliente,
  FormaPago,
  Pedido,
  PedidoEstado,
  Producto,
  Rol,
  Staff,
} from "@/lib/types";
import { hashPassword } from "better-auth/crypto";

export const prepareDemo = createServerFn({ method: "POST" }).handler(async () => {
  return seedDemoAccounts();
});

export const getSessionStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    const tenant = await getTenant();
    return { staff, tenant };
  });

export const getMarca = createServerFn({ method: "GET" }).handler(async () => {
  await ensureBootstrapped();
  return getMarcaCompleta();
});

export const guardarMarca = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; bajada: string; membrete: string; pieTicket: string; fondo: string | null }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const nombre = data.nombre.trim();
    if (!nombre) throw new Error("Falta el nombre del puesto.");
    if (nombre.length > 80) throw new Error("El nombre es demasiado largo.");
    if (data.bajada.trim().length > 80) throw new Error("La bajada es demasiado larga.");
    if (data.membrete.trim().length > 240) throw new Error("El membrete es demasiado largo.");
    if (data.pieTicket.trim().length > 240) throw new Error("El pie del ticket es demasiado largo.");
    if (data.fondo && (!data.fondo.startsWith("data:image/") || data.fondo.length > 450_000)) {
      throw new Error("El fondo tiene que ser una imagen chica.");
    }
    const actual = await getMarcaCompleta();
    const sql = await getSql();
    const rows = await sql<{ config: unknown }>`select config from tenants where id = ${staff.tenantId} limit 1`;
    const previo =
      typeof rows[0]?.config === "string"
        ? (JSON.parse(rows[0].config) as Record<string, unknown>)
        : ((rows[0]?.config as Record<string, unknown> | null) ?? {});
    const config = {
      ...previo,
      bajada: data.bajada.trim() || "Mercado Central",
      membrete: data.membrete.trim(),
      pieTicket: data.pieTicket.trim() || actual.pieTicket,
      fondo: data.fondo,
    };
    await sql`
      update tenants set nombre = ${nombre}, config = ${JSON.stringify(config)}::jsonb
      where id = ${staff.tenantId}
    `;
    await audit(staff.tenantId, staff, "marca", "tenant", { nombre });
    return getMarcaCompleta();
  });

export const quienSoy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureBootstrapped();
    const tenant = await getTenant();
    const staff = await loadStaffByUserId(context.userId);
    if (staff) return { tipo: "staff" as const, staff, tenant };
    const sql = await getSql();
    const cliente = await sql<{ id: string }>`
      select id from clientes where user_id = ${context.userId} and activo = true limit 1
    `;
    if (cliente[0]) return { tipo: "cliente" as const, tenant };
    try {
      const mercado = await sql<{ id: string }>`
        select id from mercado_compradores where user_id = ${context.userId}
        union all
        select id from mercado_cargadores where user_id = ${context.userId}
        limit 1
      `;
      if (mercado[0]) return { tipo: "mercado" as const, tenant };
    } catch {
      /* el canal todavía no está migrado */
    }
    const usuario = await sql<{ email: string }>`
      select email from "user" where id = ${context.userId} limit 1
    `;
    const email = (usuario[0]?.email ?? "").trim().toLowerCase();
    if (email) {
      try {
        const acceso = await sql<{ email: string }>`
          select email from torre.saas_access where lower(email) = ${email} limit 1
        `;
        if (acceso[0]) return { tipo: "torre" as const, tenant };
      } catch {
        /* el schema de la Torre todavía no existe */
      }
    }
    const creado = await ensureStaffForUser(context.userId);
    return { tipo: "staff" as const, staff: creado, tenant };
  });

export const listProductos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<Producto[]>({ token: context.token, method: "GET", path: ["catalogo"] });
  });

export const canalMercado = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const rows = await sql<{ config: unknown }>`select config from tenants where id = ${staff.tenantId} limit 1`;
    const raw = rows[0]?.config;
    const config =
      typeof raw === "string" ? (JSON.parse(raw) as { mercadoAlToque?: boolean }) : ((raw ?? {}) as { mercadoAlToque?: boolean });
    const condicion = await condicionOperativa(staff.tenantId);
    return {
      activo: config.mercadoAlToque === true,
      presencia: condicion.presencia,
      tier: condicion.tier,
      cuentaCorriente: condicion.cuentaCorriente,
      packs: condicion.packs,
      avisos: condicion.avisos,
      comision: condicion.comision,
    };
  });

export const guardarCanalMercado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((activo: boolean) => activo)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    if (data) {
      const presencia = await puedeAparecer(staff.tenantId, { mercadoAlToque: true });
      if (!presencia.tier) throw new Error("Este puesto no tiene Presencia o Pro activo.");
    }
    await sql`
      update tenants
      set config = coalesce(config, '{}'::jsonb) || ${JSON.stringify({ mercadoAlToque: data })}::jsonb
      where id = ${staff.tenantId}
    `;
    return { activo: data };
  });

export const saveProducto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id?: string;
    nombre: string;
    unidad: Producto["unidad"];
    unidadLabel: string;
    precio: number;
    stockMinimo: number;
    alias: string[];
    activo: boolean;
    publicadoOnline?: boolean;
    stockInicial?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ id: string }>({ token: context.token, method: "POST", path: ["productos"], body: data });
  });

export const quitarProducto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["productos", id, "baja"] });
  });

export const ordenarProductos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ids: string[]) => ids.filter((id) => typeof id === "string" && id.length > 0))
  .handler(async ({ context, data: ids }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["productos", "orden"], body: ids });
  });

export const listClientes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<Cliente[]>({ token: context.token, method: "GET", path: ["clientes"] });
  });

export const createCliente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; telefono?: string; cuentaCorriente?: boolean }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ id: string; nombre: string }>({
      token: context.token,
      method: "POST",
      path: ["clientes"],
      body: data,
    });
  });

type CartLine = { productoId: string; cantidad: number };

export const crearPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    clientUuid: string;
    clienteId?: string | null;
    clienteNombre: string;
    nota?: string;
    items: CartLine[];
  }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido>({
      token: context.token,
      method: "POST",
      path: ["pedidos"],
      body: data,
    });
  });

export const listPedidos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { mine?: boolean; estados?: PedidoEstado[] }) => input ?? {})
  .handler(async ({ context, data }) => {
    return appApi<Pedido[]>({
      token: context.token,
      method: "GET",
      path: ["pedidos"],
      query: {
        ...(data.mine ? { mine: "1" } : {}),
        ...(data.estados?.length ? { estados: data.estados.join(",") } : {}),
      },
    });
  });

export const getPedido = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    try {
      return await appApi<Pedido | null>({
        token: context.token,
        method: "GET",
        path: ["pedidos", id],
      });
    } catch (error) {
      if (error instanceof AppApiError && error.status === 404) return null;
      throw error;
    }
  });

export const updatePedidoEstado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; estado: PedidoEstado }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido | null>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.id, "estado"],
      body: { estado: data.estado },
    });
  });

export const marcarEntregado = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["pedidos", id, "entregar"],
    });
  });

export const updatePedidoItems = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; items: CartLine[] }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido | null>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.id, "items"],
      body: { items: data.items },
    });
  });

export const cobrarPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    pedidoId: string;
    clientUuid: string;
    formaPago: FormaPago;
    montoRecibido?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ cobroId: string; ticketId?: string; numero: number; vuelto: number; total: number }>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.pedidoId, "cobrar"],
      body: {
        clientUuid: data.clientUuid,
        formaPago: data.formaPago,
        montoRecibido: data.montoRecibido,
      },
    });
  });

export const anularPedido = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<Pedido | null>({
      token: context.token,
      method: "POST",
      path: ["pedidos", data.id, "anular"],
      body: { motivo: data.motivo },
    });
  });

export const anularCobro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ ok: true }>({
      token: context.token,
      method: "POST",
      path: ["cobros", data.id, "anular"],
      body: { motivo: data.motivo },
    });
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((cobroId: string) => cobroId)
  .handler(async ({ context, data: cobroId }) => {
    try {
      return await appApi<{
        id: string;
        numero: number;
        contenido: TicketContenido;
        createdAt: string;
      } | null>({ token: context.token, method: "GET", path: ["cobros", cobroId, "ticket"] });
    } catch (error) {
      if (error instanceof AppApiError && error.status === 404) return null;
      throw error;
    }
  });

export const dashboardResumen = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { dias?: number } | undefined) => {
    const raw = input?.dias;
    const dias = raw === 1 || raw === 30 ? raw : 7;
    return { dias };
  })
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const dias = data.dias;
    const span = await sql.query<{ total: unknown; n: unknown; prev_total: unknown; prev_n: unknown }>(
      `select
         coalesce(sum(monto) filter (where created_at::date >= current_date - ($2::int - 1)), 0) as total,
         count(*) filter (where created_at::date >= current_date - ($2::int - 1))::int as n,
         coalesce(sum(monto) filter (
           where created_at::date < current_date - ($2::int - 1)
             and created_at::date >= current_date - ($2::int * 2 - 1)
         ), 0) as prev_total,
         count(*) filter (
           where created_at::date < current_date - ($2::int - 1)
             and created_at::date >= current_date - ($2::int * 2 - 1)
         )::int as prev_n
       from cobros
       where tenant_id = $1
         and anulado = false
         and created_at::date >= current_date - ($2::int * 2 - 1)`,
      [staff.tenantId, dias],
    );
    const colaCount = await sql<{ n: unknown }>`
      select count(*)::int as n from pedidos
      where tenant_id = ${staff.tenantId} and estado in ('enviado','en_preparacion','listo')
    `;
    const series =
      dias === 1
        ? await sql.query<{ dia: string; total: unknown; n: unknown }>(
            `select to_char(h, 'YYYY-MM-DD HH24') as dia,
                    coalesce((select sum(monto) from cobros c
                      where c.tenant_id = $1
                        and c.anulado = false
                        and to_char(c.created_at, 'YYYY-MM-DD HH24') = to_char(h, 'YYYY-MM-DD HH24')), 0) as total,
                    coalesce((select count(*) from cobros c
                      where c.tenant_id = $1
                        and c.anulado = false
                        and to_char(c.created_at, 'YYYY-MM-DD HH24') = to_char(h, 'YYYY-MM-DD HH24')), 0)::int as n
             from generate_series(
               current_date + time '06:00',
               current_date + time '20:00',
               interval '1 hour'
             ) as h`,
            [staff.tenantId],
          )
        : await sql.query<{ dia: string; total: unknown; n: unknown }>(
            `select to_char(d::date, 'YYYY-MM-DD') as dia,
                    coalesce((select sum(monto) from cobros c where c.tenant_id = $1 and c.anulado = false and c.created_at::date = d::date), 0) as total,
                    coalesce((select count(*) from cobros c where c.tenant_id = $1 and c.anulado = false and c.created_at::date = d::date), 0)::int as n
             from generate_series(current_date - ($2::int - 1), current_date, interval '1 day') as d`,
            [staff.tenantId, dias],
          );
    const top = await sql.query<{ nombre: string; cantidad: unknown; total: unknown }>(
      `select i.nombre_snapshot as nombre,
              sum(i.cantidad) as cantidad,
              sum(i.cantidad * i.precio_unitario) as total
       from pedido_items i
       join pedidos p on p.id = i.pedido_id
       where p.tenant_id = $1 and p.estado in ('cobrado', 'entregado')
         and p.created_at::date >= current_date - ($2::int - 1)
       group by i.nombre_snapshot
       order by sum(i.cantidad * i.precio_unitario) desc
       limit 8`,
      [staff.tenantId, dias],
    );
    const formas = await sql.query<{ forma_pago: string; total: unknown; n: unknown }>(
      `select forma_pago, coalesce(sum(monto),0) as total, count(*)::int as n
       from cobros
       where tenant_id = $1 and anulado = false and created_at::date >= current_date - ($2::int - 1)
       group by forma_pago
       order by sum(monto) desc`,
      [staff.tenantId, dias],
    );
    const movimientos = await sql.query<{
      id: string;
      monto: unknown;
      forma_pago: string;
      created_at: string;
      cliente: string;
      numero: number | null;
      productos: string;
    }>(
      `select c.id, c.monto, c.forma_pago, c.created_at::text as created_at,
              coalesce(p.cliente_nombre, 'Mostrador') as cliente, t.numero,
              coalesce((
                select string_agg(distinct i.nombre_snapshot, ', ')
                from pedido_items i
                where i.pedido_id = c.pedido_id
              ), '') as productos
       from cobros c
       left join pedidos p on p.id = c.pedido_id
       left join tickets t on t.cobro_id = c.id
       where c.tenant_id = $1 and c.anulado = false and c.created_at::date >= current_date - ($2::int - 1)
       order by c.created_at desc
       limit 40`,
      [staff.tenantId, dias],
    );
    const cola = await sql<{
      id: string;
      cliente: string;
      estado: string;
      created_at: string;
      total: unknown;
      vendedor: string | null;
    }>`
      select p.id, p.cliente_nombre as cliente, p.estado, p.created_at::text as created_at,
             coalesce((select sum(i.cantidad * i.precio_unitario) from pedido_items i where i.pedido_id = p.id), 0) as total,
             s.nombre as vendedor
      from pedidos p
      left join staff s on s.id = p.vendedor_id
      where p.tenant_id = ${staff.tenantId} and p.estado in ('enviado','en_preparacion','listo')
      order by p.created_at asc
      limit 8
    `;
    const ventas = num(span[0]?.total);
    const tickets = num(span[0]?.n);
    return {
      dias,
      ventas,
      ventasPrev: num(span[0]?.prev_total),
      tickets,
      ticketsPrev: num(span[0]?.prev_n),
      ticketPromedio: tickets ? Math.round(ventas / tickets) : 0,
      enCola: num(colaCount[0]?.n),
      series: series.map((s) => ({ dia: s.dia, total: num(s.total), n: num(s.n) })),
      top: top.map((t) => ({ nombre: t.nombre, cantidad: num(t.cantidad), total: num(t.total) })),
      formas: formas.map((f) => ({
        formaPago: f.forma_pago as FormaPago,
        total: num(f.total),
        n: num(f.n),
      })),
      movimientos: movimientos.map((m) => ({
        id: m.id,
        monto: num(m.monto),
        formaPago: m.forma_pago as FormaPago,
        createdAt: m.created_at,
        cliente: m.cliente,
        numero: m.numero == null ? null : num(m.numero),
        productos: m.productos,
      })),
      cola: cola.map((p) => ({
        id: p.id,
        cliente: p.cliente,
        estado: p.estado,
        createdAt: p.created_at,
        total: num(p.total),
        vendedor: p.vendedor,
      })),
    };
  });

export const resumenVentasProductos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const pedir = (dias: number) =>
      sql.query<{ producto_id: string; nombre: string; cantidad: unknown; total: unknown }>(
        `select i.producto_id,
                max(i.nombre_snapshot) as nombre,
                sum(i.cantidad) as cantidad,
                sum(i.cantidad * i.precio_unitario) as total
         from pedido_items i
         join pedidos p on p.id = i.pedido_id
         where p.tenant_id = $1
           and p.estado in ('cobrado', 'entregado')
           and p.created_at::date >= current_date - ($2::int - 1)
         group by i.producto_id
         order by sum(i.cantidad) desc, sum(i.cantidad * i.precio_unitario) desc
         limit 8`,
        [staff.tenantId, dias],
      );
    const [semana, mes] = await Promise.all([pedir(7), pedir(30)]);
    const mapear = (rows: { producto_id: string; nombre: string; cantidad: unknown; total: unknown }[]) =>
      rows.map((row) => ({
        productoId: row.producto_id,
        nombre: row.nombre,
        cantidad: num(row.cantidad),
        total: num(row.total),
      }));
    return { semana: mapear(semana), mes: mapear(mes) };
  });

export const historialProducto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => {
    if (typeof id !== "string" || !id) throw new Error("Falta el producto.");
    return id;
  })
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const rows = await sql.query<{ dia: string; cantidad: unknown; total: unknown }>(
      `select to_char(d::date, 'YYYY-MM-DD') as dia,
              coalesce((
                select sum(i.cantidad)
                from pedido_items i
                join pedidos p on p.id = i.pedido_id
                where p.tenant_id = $1
                  and i.producto_id = $2
                  and p.estado in ('cobrado', 'entregado')
                  and p.created_at::date = d::date
              ), 0) as cantidad,
              coalesce((
                select sum(i.cantidad * i.precio_unitario)
                from pedido_items i
                join pedidos p on p.id = i.pedido_id
                where p.tenant_id = $1
                  and i.producto_id = $2
                  and p.estado in ('cobrado', 'entregado')
                  and p.created_at::date = d::date
              ), 0) as total
       from generate_series(current_date - 6, current_date, interval '1 day') as d
       order by d::date`,
      [staff.tenantId, id],
    );
    return {
      dias: rows.map((row) => ({ dia: String(row.dia).slice(0, 10), cantidad: num(row.cantidad), total: num(row.total) })),
    };
  });

export const rankingCargadores = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const { ranking } = await import("@/lib/mercado/servicio");
    return ranking();
  });

export const listAlertas = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<Alerta[]>({ token: context.token, method: "GET", path: ["alertas"] });
  });

export const marcarAlertaLeida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["alertas", id, "leida"] });
  });

export const listUsuarios = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    return sql<{
      id: string;
      nombre: string;
      email: string;
      rol: Rol;
      activo: boolean;
      ultimo_login: string | null;
    }>`
      select id, nombre, email, rol, activo, ultimo_login::text as ultimo_login
      from staff
      where tenant_id = ${staff.tenantId}
      order by nombre
    `;
  });

export const createUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { nombre: string; email: string; password: string; rol: Rol }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    const exists = await sql<{ id: string }>`select id from "user" where email = ${email} limit 1`;
    if (exists[0]) throw new Error("Ya existe un usuario con ese email.");
    const userId = newId("usr").replace("usr_", "");
    const now = new Date().toISOString();
    await sql`
      insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values (${userId}, ${data.nombre.trim()}, ${email}, ${true}, ${now}::timestamptz, ${now}::timestamptz)
    `;
    const hash = await hashPassword(data.password);
    await sql`
      insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${newId("acc").replace("acc_", "")}, ${email}, ${"credential"}, ${userId}, ${hash}, ${now}::timestamptz, ${now}::timestamptz)
    `;
    await sql`
      insert into staff (id, tenant_id, user_id, nombre, email, rol, activo)
      values (${newId("stf")}, ${staff.tenantId}, ${userId}, ${data.nombre.trim()}, ${email}, ${data.rol}, ${true})
    `;
    await audit(staff.tenantId, staff, "alta_usuario", "staff", { email, rol: data.rol });
    return { ok: true };
  });

export const toggleUsuario = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; activo: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    if (data.id === staff.id && !data.activo) throw new Error("No podés eliminarte a vos mismo.");
    const sql = await getSql();
    await sql`
      update staff set activo = ${data.activo}
      where id = ${data.id} and tenant_id = ${staff.tenantId}
    `;
    await audit(staff.tenantId, staff, "cambiar_usuario", "staff", data);
    return { ok: true };
  });

export const listAuditoria = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      usuario_nombre: string | null;
      accion: string;
      entidad: string;
      detalle: unknown;
      created_at: string;
    }>`
      select id, usuario_nombre, accion, entidad, detalle, created_at::text as created_at
      from auditoria
      where tenant_id = ${staff.tenantId}
      order by created_at desc
      limit 80
    `;
    return rows.map((r) => ({
      id: r.id,
      usuarioNombre: r.usuario_nombre,
      accion: r.accion,
      entidad: r.entidad,
      detalle:
        typeof r.detalle === "string" ? r.detalle : JSON.stringify(r.detalle ?? {}),
      createdAt: r.created_at,
    }));
  });

type CajaEstado = {
  id: string;
  abiertoAt: string;
  esperado: number;
  totales: { formaPago: FormaPago; total: number; n: number }[];
  ultimos: {
    id: string;
    monto: number;
    formaPago: FormaPago;
    createdAt: string;
    cliente: string;
    numero: number | null;
    facturaId: string | null;
    cae: string | null;
  }[];
};

export const estadoCaja = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return appApi<CajaEstado>({ token: context.token, method: "GET", path: ["caja"] });
  });

export const cerrarCaja = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; real: number; notas?: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ diferencia: number; esperado: number }>({
      token: context.token,
      method: "POST",
      path: ["caja", "cerrar"],
      body: data,
    });
  });


export const ajustarStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { productoId: string; cantidad: number; tipo: "ajuste" | "merma"; motivo: string }) => input)
  .handler(async ({ context, data }) => {
    return appApi<{ ok: true }>({ token: context.token, method: "POST", path: ["stock", "ajuste"], body: data });
  });

export const crearRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    proveedor?: string;
    proveedorId?: string;
    fuente: "csv" | "foto" | "manual" | "pdf";
    archivoNombre?: string;
    lineas: { descripcion: string; cantidad: number; precio?: number }[];
  }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const id = newId("rem");
    let proveedor = data.proveedor?.trim() || null;
    let proveedorId: string | null = null;
    if (data.proveedorId) {
      const prov = await sql<{ nombre: string }>`
        select nombre from proveedores
        where id = ${data.proveedorId} and tenant_id = ${staff.tenantId} and activo = true
        limit 1
      `;
      if (!prov[0]) throw new Error("Elegí un proveedor activo.");
      proveedor = prov[0].nombre;
      proveedorId = data.proveedorId;
    }
    await sql`
      insert into remitos (id, tenant_id, proveedor, proveedor_id, fuente, estado, archivo_nombre)
      values (${id}, ${staff.tenantId}, ${proveedor}, ${proveedorId}, ${data.fuente}, ${"procesado"}, ${data.archivoNombre ?? null})
    `;
    const productosRows = await sql<{
      id: string;
      nombre: string;
      unidad: Producto["unidad"];
      unidad_label: string;
      precio: unknown;
      stock: unknown;
      stock_minimo: unknown;
      alias: unknown;
      activo: boolean;
    }>`select id, nombre, unidad, unidad_label, precio, stock, stock_minimo, alias, activo from productos where tenant_id = ${staff.tenantId} and activo = true`;
    const productos = productosRows.map(mapProducto);
    for (const line of data.lineas) {
      const match = matchProduct(line.descripcion, productos);
      await sql`
        insert into remito_items (
          id, remito_id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
        ) values (
          ${newId("rit")}, ${id}, ${line.descripcion}, ${match.producto?.id ?? null},
          ${line.cantidad}, ${line.precio ?? null}, ${match.score}, ${false}
        )
      `;
    }
    return { id };
  });

export const getRemito = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    const sql = await getSql();
    const rem = await sql<{
      id: string;
      proveedor: string | null;
      proveedor_id: string | null;
      fuente: string;
      estado: string;
      archivo_nombre: string | null;
      created_at: string;
    }>`
      select id, proveedor, proveedor_id, fuente, estado, archivo_nombre, created_at::text as created_at
      from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
    `;
    if (!rem[0]) return null;
    const items = await sql<{
      id: string;
      descripcion_original: string;
      producto_id: string | null;
      cantidad: unknown;
      precio: unknown;
      confianza_match: unknown;
      confirmado: boolean;
    }>`
      select id, descripcion_original, producto_id, cantidad, precio, confianza_match, confirmado
      from remito_items where remito_id = ${id} order by descripcion_original
    `;
    return {
      ...rem[0],
      items: items.map((it) => ({
        id: it.id,
        descripcionOriginal: it.descripcion_original,
        productoId: it.producto_id,
        cantidad: num(it.cantidad),
        precio: it.precio == null ? null : num(it.precio),
        confianza: num(it.confianza_match),
        confirmado: it.confirmado,
      })),
    };
  });

export const listRemitos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    return sql<{
      id: string;
      proveedor: string | null;
      fuente: string;
      estado: string;
      created_at: string;
    }>`
      select id, proveedor, fuente, estado, created_at::text as created_at
      from remitos where tenant_id = ${staff.tenantId}
      order by created_at desc
      limit 30
    `;
  });

export const actualizarRemitoItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; productoId: string | null; cantidad: number; confirmado: boolean }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update remito_items
      set producto_id = ${data.productoId}, cantidad = ${data.cantidad}, confirmado = ${data.confirmado}
      where id = ${data.id}
        and remito_id in (select id from remitos where tenant_id = ${staff.tenantId})
      returning id
    `;
    if (!rows[0]) throw new Error("Remito no encontrado.");
    return { ok: true };
  });

export const confirmarRemito = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin", "cajero"]);
    const sql = await getSql();
    const rem = await sql<{ estado: string }>`
      select estado from remitos where id = ${id} and tenant_id = ${staff.tenantId} limit 1
    `;
    if (!rem[0]) throw new Error("Remito no encontrado.");
    if (rem[0].estado === "confirmado") return { ok: true };
    const items = await sql<{ producto_id: string | null; cantidad: unknown; confirmado: boolean }>`
      select producto_id, cantidad, confirmado from remito_items where remito_id = ${id}
    `;
    const confirmed = items.filter((i) => i.confirmado && i.producto_id);
    if (confirmed.length === 0) throw new Error("Confirmá al menos una línea para ingresar stock.");
    for (const item of confirmed) {
      if (!item.producto_id) continue;
      await applyStock({
        tenantId: staff.tenantId,
        productoId: item.producto_id,
        tipo: "entrada_remito",
        cantidad: num(item.cantidad),
        referencia: id,
        staff,
      });
    }
    await sql`
      update remitos set estado = 'confirmado', confirmado_at = now(), confirmado_por = ${staff.id}
      where id = ${id}
    `;
    await audit(staff.tenantId, staff, "confirmar_remito", "remito", {
      id,
      lineas: confirmed.length,
    });
    return { ok: true, lineas: confirmed.length };
  });

export const parseRemitoVision = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { imageBase64: string; mimeType: string }) => input)
  .handler(async ({ context, data }) => {
    await ensureStaffForUser(context.userId);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "El lector de fotos no está disponible en este entorno." };
    }
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Extraé las líneas de este remito mayorista de frutas y verduras. Devolvé SOLO JSON: {"proveedor": string|null, "lineas":[{"descripcion":string,"cantidad":number,"precio":number|null}]}. Cantidad en bultos/cajones/kg según el papel. Sin markdown.',
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${data.mimeType};base64,${data.imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `No se pudo leer la foto (${res.status}).` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = body.choices[0]?.message.content ?? "";
    const jsonText = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(jsonText) as {
        proveedor?: string | null;
        lineas: { descripcion: string; cantidad: number; precio?: number | null }[];
      };
      return { ok: true as const, proveedor: parsed.proveedor ?? null, lineas: parsed.lineas ?? [] };
    } catch {
      return { ok: false as const, error: "No pude interpretar el remito. Cargalo a mano." };
    }
  });


