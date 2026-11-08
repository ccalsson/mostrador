import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { newId } from "@/lib/ids";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { auditar } from "@/lib/torre/audit";
import { exigirAccion } from "@/lib/torre/roles";
import {
  evaluarReglas,
  validarRegla,
  type Regla,
  type Condicion,
  type Accion,
  type ResultadoEvaluacion,
  type StockSnapshot,
  type PagosSnapshot,
  type CobrosSnapshot,
  type EgresosSnapshot,
} from "./reglas-auto-core";

export type { Regla, Condicion, Accion, ResultadoEvaluacion } from "./reglas-auto-core";
export { condicionLabel, accionLabel } from "./reglas-auto-core";

function day(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  return text.slice(0, 10);
}

export async function listarReglasCore(_email: string): Promise<Regla[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    nombre: string;
    descripcion: string;
    condicion: unknown;
    accion: unknown;
    activo: boolean;
    created_at: string;
    updated_at: string;
  }>`
    select id, nombre, descripcion, condicion, accion, activo,
           created_at::text as created_at, updated_at::text as updated_at
    from torre.reglas_auto
    order by created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    condicion: typeof r.condicion === "string" ? JSON.parse(r.condicion) as Condicion : r.condicion as Condicion,
    accion: typeof r.accion === "string" ? JSON.parse(r.accion) as Accion : r.accion as Accion,
    activo: r.activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

type CrearReglaInput = {
  nombre: string;
  descripcion: string;
  condicion: Condicion;
  accion: Accion;
  activo: boolean;
};

export async function crearReglaCore(email: string, data: CrearReglaInput): Promise<Regla> {
  await exigirAccion(email, "comercial");
  const error = validarRegla({ nombre: data.nombre, condicion: data.condicion, accion: data.accion });
  if (error) throw new Error(error);

  const sql = await getSql();
  const id = newId("reg");

  await sql`
    insert into torre.reglas_auto (id, nombre, descripcion, condicion, accion, activo)
    values (
      ${id}, ${data.nombre.trim()}, ${data.descripcion.trim()},
      ${JSON.stringify(data.condicion)}::jsonb, ${JSON.stringify(data.accion)}::jsonb,
      ${data.activo}
    )
  `;

  await auditar(email, "crear_regla_auto", "regla_auto", id, { nombre: data.nombre.trim() });

  const rows = await sql<{
    id: string; nombre: string; descripcion: string; condicion: unknown; accion: unknown;
    activo: boolean; created_at: string; updated_at: string;
  }>`select id, nombre, descripcion, condicion, accion, activo, created_at::text as created_at, updated_at::text as updated_at from torre.reglas_auto where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    condicion: typeof r.condicion === "string" ? JSON.parse(r.condicion) as Condicion : r.condicion as Condicion,
    accion: typeof r.accion === "string" ? JSON.parse(r.accion) as Accion : r.accion as Accion,
    activo: r.activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type ActualizarReglaInput = {
  nombre: string;
  descripcion: string;
  condicion: Condicion;
  accion: Accion;
  activo: boolean;
};

export async function actualizarReglaCore(email: string, id: string, data: ActualizarReglaInput): Promise<Regla> {
  await exigirAccion(email, "comercial");
  const error = validarRegla({ nombre: data.nombre, condicion: data.condicion, accion: data.accion });
  if (error) throw new Error(error);

  const sql = await getSql();
  const prev = await sql<{ id: string }>`select id from torre.reglas_auto where id = ${id}`;
  if (!prev[0]) throw new Error("No existe esa regla.");

  await sql`
    update torre.reglas_auto set
      nombre = ${data.nombre.trim()}, descripcion = ${data.descripcion.trim()},
      condicion = ${JSON.stringify(data.condicion)}::jsonb,
      accion = ${JSON.stringify(data.accion)}::jsonb,
      activo = ${data.activo},
      updated_at = now()
    where id = ${id}
  `;

  await auditar(email, "actualizar_regla_auto", "regla_auto", id, { nombre: data.nombre.trim() });

  const rows = await sql<{
    id: string; nombre: string; descripcion: string; condicion: unknown; accion: unknown;
    activo: boolean; created_at: string; updated_at: string;
  }>`select id, nombre, descripcion, condicion, accion, activo, created_at::text as created_at, updated_at::text as updated_at from torre.reglas_auto where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    condicion: typeof r.condicion === "string" ? JSON.parse(r.condicion) as Condicion : r.condicion as Condicion,
    accion: typeof r.accion === "string" ? JSON.parse(r.accion) as Accion : r.accion as Accion,
    activo: r.activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function eliminarReglaCore(email: string, id: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();
  const prev = await sql<{ id: string }>`select id from torre.reglas_auto where id = ${id}`;
  if (!prev[0]) throw new Error("No existe esa regla.");

  await sql`delete from torre.reglas_auto_log where regla_id = ${id}`;
  await sql`delete from torre.reglas_auto where id = ${id}`;
  await auditar(email, "eliminar_regla_auto", "regla_auto", id, {});
}

async function construirSnapshots(): Promise<{ stock: StockSnapshot; pagos: PagosSnapshot; cobros: CobrosSnapshot; egresos: EgresosSnapshot }> {
  const sql = await getSql();

  const stockRows = await sql<{
    tenant_id: string; tenant_nombre: string; producto_nombre: string;
    stock: unknown; stock_minimo: unknown;
  }>`
    select p.tenant_id, t.nombre as tenant_nombre, p.nombre as producto_nombre,
           p.stock, p.stock_minimo
    from productos p
    join tenants t on t.id = p.tenant_id
    join torre.saas_tenants st on st.operational_tenant_ref = t.id
    where st.status = 'active' and p.activo = true
  `;

  const stock: StockSnapshot = stockRows.map((r) => ({
    tenantId: r.tenant_id,
    tenantNombre: r.tenant_nombre,
    productoNombre: r.producto_nombre,
    stock: num(r.stock),
    stockMinimo: num(r.stock_minimo),
  }));

  const pagosRows = await sql<{
    id: string; tenant_id: string; amount: unknown; payment_date: unknown; status: string;
  }>`
    select p.id, coalesce(st.operational_tenant_ref, '') as tenant_id, p.amount,
           p.payment_date, p.status
    from torre.saas_payments p
    left join torre.saas_subscriptions s on s.id = p.subscription_id
    left join torre.saas_tenants st on st.id = s.tenant_id
    where p.status = 'pending'
  `;

  const pagos: PagosSnapshot = pagosRows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    amount: num(r.amount),
    paymentDate: day(r.payment_date),
    status: r.status,
  }));

  const cobrosRows = await sql<{ tenant_id: string; monto: unknown; created_at: string }>`
    select tenant_id, monto, created_at::text as created_at
    from cobros
    where anulado = false
      and created_at >= current_date - 90
  `;

  const cobros: CobrosSnapshot = cobrosRows.map((r) => ({
    tenantId: r.tenant_id,
    monto: num(r.monto),
    createdAt: r.created_at,
  }));

  const egresosRows = await sql<{ tenant_id: string; monto: unknown; created_at: string }>`
    select tenant_id, monto, created_at::text as created_at
    from caja_egresos
    where created_at >= current_date - 90
  `;

  const egresos: EgresosSnapshot = egresosRows.map((r) => ({
    tenantId: r.tenant_id,
    monto: num(r.monto),
    createdAt: r.created_at,
  }));

  return { stock, pagos, cobros, egresos };
}

export async function evaluarReglasAhoraCore(email: string): Promise<ResultadoEvaluacion[]> {
  await exigirAccion(email, "lectura");

  const reglas = await listarReglasCore(email);
  const reglasActivas = reglas.filter((r) => r.activo);

  if (reglasActivas.length === 0) return [];

  const data = await construirSnapshots();
  const resultados = evaluarReglas(reglasActivas, data);

  // Log results
  const sql = await getSql();
  for (const r of resultados) {
    const datosObj = JSON.parse(r.datos) as Record<string, unknown>;
    await sql`
      insert into torre.reglas_auto_log (id, regla_id, evaluado_at, resultado)
      values (
        ${newId("rlog")}, ${r.reglaId}, ${r.evaluadoAt}::timestamptz,
        ${JSON.stringify({ disparada: r.disparada, detalle: r.detalle, datos: datosObj })}::jsonb
      )
    `;
  }

  return resultados;
}

export async function listarLogReglasCore(email: string, limite: number = 50): Promise<ResultadoEvaluacion[]> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    regla_id: string;
    evaluado_at: string;
    resultado: unknown;
  }>`
    select l.id, l.regla_id, l.evaluado_at::text as evaluado_at, l.resultado
    from torre.reglas_auto_log l
    order by l.evaluado_at desc
    limit ${limite}
  `;

  // Need rule names
  const reglaIds = [...new Set(rows.map((r) => r.regla_id))];
  let nombresMap = new Map<string, string>();
  if (reglaIds.length > 0) {
    const nombres = await sql<{ id: string; nombre: string }>`
      select id, nombre from torre.reglas_auto where id = any(${reglaIds})
    `;
    nombresMap = new Map(nombres.map((n) => [n.id, n.nombre]));
  }

  return rows.map((r) => {
    const res = typeof r.resultado === "string"
      ? JSON.parse(r.resultado) as { disparada: boolean; detalle: string; datos: Record<string, unknown> }
      : r.resultado as { disparada: boolean; detalle: string; datos: Record<string, unknown> };
    return {
      reglaId: r.regla_id,
      reglaNombre: nombresMap.get(r.regla_id) ?? r.regla_id,
      disparada: res.disparada,
      detalle: res.detalle,
      datos: JSON.stringify(res.datos),
      evaluadoAt: r.evaluado_at,
    };
  });
}

// --- Server function wrappers ---

export const listarReglas = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarReglasCore(email);
  });

export const crearRegla = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: CrearReglaInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return crearReglaCore(email, data);
  });

export const actualizarRegla = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id: string } & ActualizarReglaInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    const { id, ...rest } = data;
    return actualizarReglaCore(email, id, rest);
  });

export const eliminarRegla = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return eliminarReglaCore(email, data);
  });

export const evaluarReglasAhora = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return evaluarReglasAhoraCore(email);
  });

export const listarLogReglas = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((input: { limite?: number } | undefined) => ({ limite: input?.limite ?? 50 }))
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return listarLogReglasCore(email, data.limite);
  });
