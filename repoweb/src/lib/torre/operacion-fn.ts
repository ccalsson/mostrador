import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { torreGuard } from "@/lib/torre-fn";

type FilaPedido = { estado: string; origen: string; n: number; monto: unknown };
type FilaCobro = { origen: string; forma: string; n: number; monto: unknown; anulados: number; monto_anulado: unknown };
type FilaProducto = { origen: string; nombre: string; cantidad: unknown; total: unknown };

export const analiticaOperacion = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { dias?: number } | undefined) => {
    const raw = input?.dias;
    const dias = raw === 1 || raw === 30 ? raw : 7;
    return { dias };
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    const dias = data.dias;

    const gente = await sql<{
      puestos: number;
      puestos_linea: number;
      duenos: number;
      duenos_linea: number;
      cajeros: number;
      cajeros_linea: number;
      vendedores: number;
      vendedores_linea: number;
      compradores: number;
      compradores_linea: number;
      cargadores: number;
      cargadores_linea: number;
      cargadores_disponibles: number;
      clientes: number;
      clientes_cuenta: number;
      proveedores: number;
    }>`
      select
        (select count(*)::int from tenants) as puestos,
        (select count(distinct st.tenant_id)::int
           from staff st
           join "session" s on s."userId" = st.user_id and s."expiresAt" > now()
           where st.activo) as puestos_linea,
        (select count(*)::int from staff where rol = 'admin' and activo) as duenos,
        (select count(*)::int from staff st
           join "session" s on s."userId" = st.user_id and s."expiresAt" > now()
           where st.rol = 'admin' and st.activo) as duenos_linea,
        (select count(*)::int from staff where rol = 'cajero' and activo) as cajeros,
        (select count(*)::int from staff st
           join "session" s on s."userId" = st.user_id and s."expiresAt" > now()
           where st.rol = 'cajero' and st.activo) as cajeros_linea,
        (select count(*)::int from staff where rol = 'vendedor' and activo) as vendedores,
        (select count(*)::int from staff st
           join "session" s on s."userId" = st.user_id and s."expiresAt" > now()
           where st.rol = 'vendedor' and st.activo) as vendedores_linea,
        (select count(*)::int from mercado_compradores) as compradores,
        (select count(distinct mc.user_id)::int
           from mercado_compradores mc
           where exists (
             select 1 from mercado_sesiones ms
             where ms.user_id = mc.user_id and ms.perfil = 'comprador' and ms.expires_at > now()
           ) or exists (
             select 1 from "session" s where s."userId" = mc.user_id and s."expiresAt" > now()
           )) as compradores_linea,
        (select count(*)::int from mercado_cargadores where estado = 'activo') as cargadores,
        (select count(distinct cg.user_id)::int
           from mercado_cargadores cg
           where cg.estado = 'activo' and (
             exists (
               select 1 from mercado_sesiones ms
               where ms.user_id = cg.user_id and ms.perfil = 'cargador' and ms.expires_at > now()
             ) or exists (
               select 1 from "session" s where s."userId" = cg.user_id and s."expiresAt" > now()
             )
           )) as cargadores_linea,
        (select count(*)::int from mercado_cargadores
           where estado = 'activo' and disponibilidad = 'disponible') as cargadores_disponibles,
        (select count(*)::int from clientes where activo) as clientes,
        (select count(*)::int from clientes where activo and cuenta_corriente) as clientes_cuenta,
        (select count(*)::int from proveedores where activo) as proveedores
    `;

    const pedidos = await sql.query<FilaPedido>(
      `select p.estado,
              case when p.origen = 'mercado_al_toque' then 'mercado' else 'mostrador' end as origen,
              count(*)::int as n,
              coalesce(sum((select sum(i.cantidad * i.precio_unitario) from pedido_items i where i.pedido_id = p.id)), 0) as monto
       from pedidos p
       where p.created_at::date >= current_date - ($1::int - 1)
       group by p.estado, origen`,
      [dias],
    );

    const cobros = await sql.query<FilaCobro>(
      `select case when p.origen = 'mercado_al_toque' then 'mercado' else 'mostrador' end as origen,
              c.forma_pago as forma,
              count(*) filter (where c.anulado = false)::int as n,
              coalesce(sum(c.monto) filter (where c.anulado = false), 0) as monto,
              count(*) filter (where c.anulado)::int as anulados,
              coalesce(sum(c.monto) filter (where c.anulado), 0) as monto_anulado
       from cobros c
       left join pedidos p on p.id = c.pedido_id
       where c.created_at::date >= current_date - ($1::int - 1)
       group by origen, c.forma_pago`,
      [dias],
    );

    const serie = await sql.query<{ dia: string; mostrador: unknown; mercado: unknown; n: number; anulados: number }>(
      `select to_char(d::date, 'YYYY-MM-DD') as dia,
              coalesce(sum(c.monto) filter (
                where c.anulado = false and coalesce(p.origen, '') <> 'mercado_al_toque'
              ), 0) as mostrador,
              coalesce(sum(c.monto) filter (
                where c.anulado = false and p.origen = 'mercado_al_toque'
              ), 0) as mercado,
              count(c.id) filter (where c.anulado = false)::int as n,
              count(c.id) filter (where c.anulado)::int as anulados
       from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') as d
       left join cobros c on c.created_at::date = d::date
       left join pedidos p on p.id = c.pedido_id
       group by d::date
       order by d::date`,
      [dias],
    );

    const productos = await sql.query<FilaProducto>(
      `select case when p.origen = 'mercado_al_toque' then 'mercado' else 'mostrador' end as origen,
              i.nombre_snapshot as nombre,
              sum(i.cantidad) as cantidad,
              sum(i.cantidad * i.precio_unitario) as total
       from pedido_items i
       join pedidos p on p.id = i.pedido_id
       where p.estado in ('cobrado', 'entregado')
         and p.created_at::date >= current_date - ($1::int - 1)
       group by origen, i.nombre_snapshot
       order by sum(i.cantidad * i.precio_unitario) desc`,
      [dias],
    );

    const puestos = await sql.query<{ nombre: string; mostrador: unknown; mercado: unknown; tickets: number }>(
      `select t.nombre,
              coalesce(sum(c.monto) filter (where coalesce(p.origen, '') <> 'mercado_al_toque'), 0) as mostrador,
              coalesce(sum(c.monto) filter (where p.origen = 'mercado_al_toque'), 0) as mercado,
              count(c.id)::int as tickets
       from cobros c
       join tenants t on t.id = c.tenant_id
       left join pedidos p on p.id = c.pedido_id
       where c.anulado = false
         and c.created_at::date >= current_date - ($1::int - 1)
       group by t.id, t.nombre
       order by sum(c.monto) desc
       limit 8`,
      [dias],
    );

    const enLinea = await sql<{ nombre: string; rol: string }>`
      select t.nombre, st.rol
      from staff st
      join tenants t on t.id = st.tenant_id
      join "session" s on s."userId" = st.user_id and s."expiresAt" > now()
      where st.activo
      order by t.nombre
      limit 12
    `;

    const recorridos = await sql.query<{ estado: string; n: number }>(
      `select estado, count(*)::int as n
       from mercado_recorridos
       where created_at::date >= current_date - ($1::int - 1)
       group by estado
       order by n desc`,
      [dias],
    );

    const remitos = await sql.query<{ estado: string; n: number }>(
      `select estado, count(*)::int as n
       from remitos
       where created_at::date >= current_date - ($1::int - 1)
       group by estado
       order by n desc`,
      [dias],
    );

    const cuenta = await sql.query<{ tipo: string; n: number; monto: unknown }>(
      `select tipo, count(*)::int as n, coalesce(sum(monto), 0) as monto
       from cuenta_movimientos
       where created_at::date >= current_date - ($1::int - 1)
       group by tipo
       order by tipo`,
      [dias],
    );

    const stock = await sql.query<{ tipo: string; n: number; cantidad: unknown }>(
      `select tipo, count(*)::int as n, coalesce(sum(cantidad), 0) as cantidad
       from stock_movimientos
       where created_at::date >= current_date - ($1::int - 1)
       group by tipo
       order by n desc`,
      [dias],
    );

    const facturas = await sql.query<{ estado: string; n: number; total: unknown }>(
      `select estado, count(*)::int as n, coalesce(sum(total), 0) as total
       from facturas
       where created_at::date >= current_date - ($1::int - 1)
       group by estado
       order by n desc`,
      [dias],
    );

    const cierres = await sql.query<{ n: number; diferencia: unknown }>(
      `select count(*) filter (where cerrado_at is not null)::int as n,
              coalesce(sum(diferencia) filter (where cerrado_at is not null), 0) as diferencia
       from cierres_caja
       where abierto_at::date >= current_date - ($1::int - 1)`,
      [dias],
    );

    const catalogo = await sql<{ productos: number; publicados: number }>`
      select count(*)::int as productos,
             count(*) filter (where publicado_online and activo)::int as publicados
      from productos
    `;

    const g = gente[0];
    const mapPedido = (rows: FilaPedido[]) =>
      rows.map((row) => ({ estado: row.estado, n: num(row.n), monto: num(row.monto) }));
    const mapCobro = (rows: FilaCobro[]) =>
      rows.map((row) => ({
        forma: row.forma,
        n: num(row.n),
        monto: num(row.monto),
        anulados: num(row.anulados),
        montoAnulado: num(row.monto_anulado),
      }));
    const mapProducto = (rows: FilaProducto[]) =>
      rows
        .map((row) => ({ nombre: row.nombre, cantidad: num(row.cantidad), total: num(row.total) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

    return {
      dias,
      gente: {
        puestos: num(g?.puestos),
        puestosLinea: num(g?.puestos_linea),
        duenos: num(g?.duenos),
        duenosLinea: num(g?.duenos_linea),
        cajeros: num(g?.cajeros),
        cajerosLinea: num(g?.cajeros_linea),
        vendedores: num(g?.vendedores),
        vendedoresLinea: num(g?.vendedores_linea),
        compradores: num(g?.compradores),
        compradoresLinea: num(g?.compradores_linea),
        cargadores: num(g?.cargadores),
        cargadoresLinea: num(g?.cargadores_linea),
        cargadoresDisponibles: num(g?.cargadores_disponibles),
        clientes: num(g?.clientes),
        clientesCuenta: num(g?.clientes_cuenta),
        proveedores: num(g?.proveedores),
      },
      mostrador: {
        pedidos: mapPedido(pedidos.filter((row) => row.origen === "mostrador")),
        cobros: mapCobro(cobros.filter((row) => row.origen === "mostrador")),
        productos: mapProducto(productos.filter((row) => row.origen === "mostrador")),
      },
      mercado: {
        pedidos: mapPedido(pedidos.filter((row) => row.origen === "mercado")),
        cobros: mapCobro(cobros.filter((row) => row.origen === "mercado")),
        productos: mapProducto(productos.filter((row) => row.origen === "mercado")),
      },
      serie: serie.map((row) => ({
        dia: row.dia,
        mostrador: num(row.mostrador),
        mercado: num(row.mercado),
        n: num(row.n),
        anulados: num(row.anulados),
      })),
      puestos: puestos.map((row) => ({
        nombre: row.nombre,
        mostrador: num(row.mostrador),
        mercado: num(row.mercado),
        tickets: num(row.tickets),
      })),
      enLinea: enLinea.map((row) => ({ nombre: row.nombre, rol: row.rol })),
      recorridos: recorridos.map((row) => ({ estado: row.estado, n: num(row.n) })),
      remitos: remitos.map((row) => ({ estado: row.estado, n: num(row.n) })),
      cuenta: cuenta.map((row) => ({ tipo: row.tipo, n: num(row.n), monto: num(row.monto) })),
      stock: stock.map((row) => ({ tipo: row.tipo, n: num(row.n), cantidad: num(row.cantidad) })),
      facturas: facturas.map((row) => ({ estado: row.estado, n: num(row.n), total: num(row.total) })),
      cierres: { n: num(cierres[0]?.n), diferencia: num(cierres[0]?.diferencia) },
      catalogo: { productos: num(catalogo[0]?.productos), publicados: num(catalogo[0]?.publicados) },
    };
  });
