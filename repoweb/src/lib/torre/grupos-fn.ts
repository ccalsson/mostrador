import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { newId } from "@/lib/ids";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { auditar } from "@/lib/torre/audit";
import { exigirAccion } from "@/lib/torre/roles";
import {
  validarGrupo,
  validarAsignacion,
  type GrupoEmpresarial,
  type GrupoDetalle,
  type ClienteParaGrupo,
} from "./grupos-core";

export type { GrupoEmpresarial, GrupoDetalle, ClienteParaGrupo } from "./grupos-core";
export { validarGrupo, validarAsignacion, calcularConsolidado } from "./grupos-core";

// --- Listar grupos con agregados ---

export async function listarGruposCore(_email: string): Promise<GrupoEmpresarial[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    nombre: string;
    descripcion: string;
    creado_por: string;
    created_at: string;
    clientes_count: unknown;
    tenants_count: unknown;
    revenue_total: unknown;
  }>`
    select g.id, g.nombre, g.descripcion, g.creado_por, g.created_at::text,
           count(distinct c.id) as clientes_count,
           count(distinct t.id) as tenants_count,
           coalesce(sum(p.amount), 0) as revenue_total
    from torre.grupos_empresariales g
    left join torre.saas_clients c on c.grupo_id = g.id
    left join torre.saas_tenants t on t.client_id = c.id and t.status = 'active'
    left join torre.saas_payments p on p.client_id = c.id and p.status = 'paid'
    group by g.id
    order by g.nombre
  `;

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    creadoPor: r.creado_por,
    clientesCount: num(r.clientes_count),
    tenantsCount: num(r.tenants_count),
    revenueTotal: num(r.revenue_total),
    createdAt: r.created_at,
  }));
}

// --- Crear grupo ---

type CrearGrupoInput = {
  nombre: string;
  descripcion: string;
};

export async function crearGrupoCore(email: string, data: CrearGrupoInput): Promise<GrupoEmpresarial> {
  await exigirAccion(email, "comercial");
  const error = validarGrupo({ nombre: data.nombre });
  if (error) throw new Error(error);

  const sql = await getSql();
  const id = newId("grp");

  await sql`
    insert into torre.grupos_empresariales (id, nombre, descripcion, creado_por)
    values (${id}, ${data.nombre.trim()}, ${data.descripcion.trim()}, ${email})
  `;

  await auditar(email, "crear_grupo_empresarial", "grupo_empresarial", id, { nombre: data.nombre.trim() });

  const rows = await sql<{
    id: string; nombre: string; descripcion: string; creado_por: string; created_at: string;
  }>`select id, nombre, descripcion, creado_por, created_at::text from torre.grupos_empresariales where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    creadoPor: r.creado_por,
    clientesCount: 0,
    tenantsCount: 0,
    revenueTotal: 0,
    createdAt: r.created_at,
  };
}

// --- Actualizar grupo ---

type ActualizarGrupoInput = {
  nombre: string;
  descripcion: string;
};

export async function actualizarGrupoCore(email: string, id: string, data: ActualizarGrupoInput): Promise<GrupoEmpresarial> {
  await exigirAccion(email, "comercial");
  const error = validarGrupo({ nombre: data.nombre });
  if (error) throw new Error(error);

  const sql = await getSql();

  const prev = await sql<{ id: string }>`select id from torre.grupos_empresariales where id = ${id}`;
  if (!prev[0]) throw new Error("No existe ese grupo empresarial.");

  await sql`
    update torre.grupos_empresariales set
      nombre = ${data.nombre.trim()},
      descripcion = ${data.descripcion.trim()},
      updated_at = now()
    where id = ${id}
  `;

  await auditar(email, "actualizar_grupo_empresarial", "grupo_empresarial", id, { nombre: data.nombre.trim() });

  // Return updated group with aggregates
  const grupos = await listarGruposCore(email);
  const grupo = grupos.find((g) => g.id === id);
  if (!grupo) throw new Error("No se encontro el grupo actualizado.");
  return grupo;
}

// --- Eliminar grupo ---

export async function eliminarGrupoCore(email: string, id: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string }>`select id from torre.grupos_empresariales where id = ${id}`;
  if (!prev[0]) throw new Error("No existe ese grupo empresarial.");

  // Check if any clients are assigned
  const clientes = await sql<{ id: string }>`select id from torre.saas_clients where grupo_id = ${id} limit 1`;
  if (clientes.length > 0) throw new Error("No se puede eliminar un grupo con clientes asignados. Desasignalos primero.");

  await sql`delete from torre.grupos_empresariales where id = ${id}`;
  await auditar(email, "eliminar_grupo_empresarial", "grupo_empresarial", id, {});
}

// --- Detalle de grupo ---

export async function detalleGrupoCore(email: string, id: string): Promise<GrupoDetalle> {
  await exigirAccion(email, "lectura");
  const sql = await getSql();

  const grupos = await sql<{
    id: string; nombre: string; descripcion: string; creado_por: string; created_at: string;
  }>`select id, nombre, descripcion, creado_por, created_at::text from torre.grupos_empresariales where id = ${id}`;

  if (!grupos[0]) throw new Error("No existe ese grupo empresarial.");

  const g = grupos[0];

  const clientes = await sql<{
    id: string;
    nombre: string;
    business_name: string;
    status: string;
    tenants_count: unknown;
    revenue: unknown;
  }>`
    select c.id, c.name as nombre, c.business_name, c.status,
           count(distinct t.id) as tenants_count,
           coalesce(sum(p.amount), 0) as revenue
    from torre.saas_clients c
    left join torre.saas_tenants t on t.client_id = c.id and t.status = 'active'
    left join torre.saas_payments p on p.client_id = c.id and p.status = 'paid'
    where c.grupo_id = ${id}
    group by c.id, c.name, c.business_name, c.status
    order by c.name
  `;

  return {
    grupo: {
      id: g.id,
      nombre: g.nombre,
      descripcion: g.descripcion,
      creadoPor: g.creado_por,
      clientesCount: clientes.length,
      tenantsCount: clientes.reduce((acc, c) => acc + num(c.tenants_count), 0),
      revenueTotal: clientes.reduce((acc, c) => acc + num(c.revenue), 0),
      createdAt: g.created_at,
    },
    clientes: clientes.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      businessName: c.business_name,
      status: c.status,
      tenantsCount: num(c.tenants_count),
      revenue: num(c.revenue),
    })),
  };
}

// --- Listar clientes para asignar a grupo ---

export async function listarClientesParaGrupoCore(_email: string): Promise<ClienteParaGrupo[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    nombre: string;
    business_name: string;
    grupo_id: string | null;
    grupo_nombre: string | null;
  }>`
    select c.id, c.name as nombre, c.business_name,
           c.grupo_id, g.nombre as grupo_nombre
    from torre.saas_clients c
    left join torre.grupos_empresariales g on g.id = c.grupo_id
    order by c.name
  `;

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    businessName: r.business_name,
    grupoId: r.grupo_id,
    grupoNombre: r.grupo_nombre,
  }));
}

// --- Asignar cliente a grupo ---

export async function asignarClienteAGrupoCore(email: string, clienteId: string, grupoId: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const error = validarAsignacion(clienteId, grupoId);
  if (error) throw new Error(error);

  const sql = await getSql();

  const cliente = await sql<{ id: string }>`select id from torre.saas_clients where id = ${clienteId}`;
  if (!cliente[0]) throw new Error("No existe ese cliente.");

  const grupo = await sql<{ id: string }>`select id from torre.grupos_empresariales where id = ${grupoId}`;
  if (!grupo[0]) throw new Error("No existe ese grupo empresarial.");

  await sql`update torre.saas_clients set grupo_id = ${grupoId} where id = ${clienteId}`;
  await auditar(email, "asignar_cliente_grupo", "saas_clients", clienteId, { grupoId });
}

// --- Desasignar cliente de grupo ---

export async function desasignarClienteCore(email: string, clienteId: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const cliente = await sql<{ id: string }>`select id from torre.saas_clients where id = ${clienteId}`;
  if (!cliente[0]) throw new Error("No existe ese cliente.");

  await sql`update torre.saas_clients set grupo_id = null where id = ${clienteId}`;
  await auditar(email, "desasignar_cliente_grupo", "saas_clients", clienteId, {});
}

// --- Server function wrappers ---

export const listarGrupos = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarGruposCore(email);
  });

export const crearGrupo = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: CrearGrupoInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return crearGrupoCore(email, data);
  });

export const actualizarGrupo = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { id: string } & ActualizarGrupoInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    const { id, ...rest } = data;
    return actualizarGrupoCore(email, id, rest);
  });

export const eliminarGrupo = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return eliminarGrupoCore(email, data);
  });

export const detalleGrupo = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return detalleGrupoCore(email, data);
  });

export const listarClientesParaGrupo = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarClientesParaGrupoCore(email);
  });

export const asignarClienteAGrupo = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: { clienteId: string; grupoId: string }) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return asignarClienteAGrupoCore(email, data.clienteId, data.grupoId);
  });

export const desasignarCliente = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((clienteId: string) => clienteId)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return desasignarClienteCore(email, data);
  });
