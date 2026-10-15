import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { CREDITOS_POR_FOTO, TEXTOS_POR_FOTO } from "@/lib/creativos/precios";
import { pintarPieza, redactarTanda, type Formato } from "@/lib/creativos/generar";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { cupoFirme } from "@/lib/seguridad/cupo-db";
import { assertRole } from "@/lib/server/context";
import { ensureStaffForUser } from "@/lib/server/bootstrap";

const PAQUETES = [
  { id: "prod_creditos_50", creditos: 50, usd: 5.99 },
  { id: "prod_creditos_100", creditos: 100, usd: 9.99 },
] as const;

function formatoDe(value: string): Formato {
  if (value === "banner" || value === "push") return value;
  throw new Error("Esa pieza no se pide desde acá.");
}

async function piezasHabilitadas(tenantId: string) {
  const sql = await getSql();
  const banner = await sql<{ id: string }>`
    select a.id
    from torre.saas_ads a
    join torre.saas_tenants t on t.id = a.tenant_id
    where t.operational_tenant_ref = ${tenantId}
      and a.status in ('scheduled', 'active')
      and a.ends_on >= current_date
    limit 1
  `;
  const push = await sql<{ id: string }>`
    select k.id
    from torre.saas_message_packs k
    join torre.saas_tenants t on t.id = k.tenant_id
    where t.operational_tenant_ref = ${tenantId}
      and k.status = 'active'
      and k.quantity > k.consumed
    limit 1
  `;
  const piezas: Formato[] = [];
  if (banner[0]) piezas.push("banner");
  if (push[0]) piezas.push("push");
  return piezas;
}

export const estadoCreativos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const sql = await getSql();
    const saldo = await sql<{ creditos: number }>`select creditos from creativos_saldo where tenant_id = ${staff.casaId} limit 1`;
    const pedidos = await sql<{
      id: string;
      formato: string;
      cantidad: number;
      creditos: number;
      brief: string;
      estado: string;
      created_at: string;
    }>`
      select id, formato, cantidad, creditos, brief, estado, created_at::text as created_at
      from creativos_pedidos
      where tenant_id = ${staff.casaId}
      order by created_at desc
      limit 8
    `;
    const ids = pedidos.map((pedido) => pedido.id);
    const variantes = ids.length
      ? await sql<{ id: string; pedido_id: string; n: number; titulo: string; texto: string; imagen: string }>`
          select id, pedido_id, n, titulo, texto, imagen
          from creativos_variantes
          where pedido_id = any(${ids}::text[])
          order by n
        `
      : [];
    return {
      creditos: saldo[0]?.creditos ?? 0,
      costo: CREDITOS_POR_FOTO,
      textos: TEXTOS_POR_FOTO,
      paquetes: PAQUETES,
      piezas: await piezasHabilitadas(staff.casaId),
      pedidos: pedidos.map((pedido) => ({
        ...pedido,
        variantes: variantes.filter((item) => item.pedido_id === pedido.id),
      })),
    };
  });

export const pedirCreativos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { formato: string; brief: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await ensureStaffForUser(context.userId);
    assertRole(staff, ["admin"]);
    const formato = formatoDe(data.formato);
    const brief = data.brief.trim().slice(0, 400);
    if (brief.length < 8) throw new Error("Contá un poco más qué tiene que decir la pieza.");
    const habilitadas = await piezasHabilitadas(staff.casaId);
    if (!habilitadas.includes(formato)) throw new Error("Torre todavía no habilitó esa pieza.");
    const golpe = await cupoFirme(`creativos:${staff.casaId}`, 12, 60 * 60 * 1000);
    if (!golpe.ok) throw new Error("Demasiados pedidos. Esperá un momento.");
    const sql = await getSql();
    const saldo = await sql<{ creditos: number }>`select creditos from creativos_saldo where tenant_id = ${staff.casaId} limit 1`;
    if ((saldo[0]?.creditos ?? 0) < CREDITOS_POR_FOTO) throw new Error("No alcanzan los créditos para esa foto.");
    const tanda = await redactarTanda(formato, brief);
    const imagen = await pintarPieza(tanda.imagen);
    const descuento = await sql<{ creditos: number }>`
      update creativos_saldo
      set creditos = creditos - ${CREDITOS_POR_FOTO}, updated_at = now()
      where tenant_id = ${staff.casaId} and creditos >= ${CREDITOS_POR_FOTO}
      returning creditos
    `;
    if (!descuento[0]) throw new Error("No alcanzan los créditos para esa foto.");
    const pedidoId = newId("crea");
    await sql`
      insert into creativos_pedidos (id, tenant_id, formato, cantidad, creditos, brief, estado)
      values (${pedidoId}, ${staff.casaId}, ${formato}, ${tanda.textos.length}, ${CREDITOS_POR_FOTO}, ${brief}, 'listo')
    `;
    const hechas: { n: number; titulo: string; texto: string; imagen: string }[] = [];
    for (let n = 0; n < tanda.textos.length; n += 1) {
      const texto = tanda.textos[n];
      await sql`
        insert into creativos_variantes (id, pedido_id, n, titulo, texto, imagen)
        values (${newId("var")}, ${pedidoId}, ${n + 1}, ${texto.titulo}, ${texto.texto}, ${imagen})
      `;
      hechas.push({ n: n + 1, titulo: texto.titulo, texto: texto.texto, imagen });
    }
    return { id: pedidoId, variantes: hechas, creditos: CREDITOS_POR_FOTO, aviso: "" };
  });
