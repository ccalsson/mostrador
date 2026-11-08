import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { num } from "@/lib/money";
import { newId } from "@/lib/ids";
import { requireTorre, torreGuard } from "@/lib/torre-fn";
import { auditar } from "@/lib/torre/audit";
import { exigirAccion } from "@/lib/torre/roles";
import {
  validarCampania,
  validarSecuencia,
  validarOferta,
  calcularResumen,
  type CampaniaPush,
  type SecuenciaEmail,
  type OfertaAuto,
  type MarketingResumen,
  type SegmentoPush,
  type EstadoCampania,
  type EventoTrigger,
  type CondicionOferta,
} from "./marketing-core";

export type { CampaniaPush, SecuenciaEmail, OfertaAuto, MarketingResumen } from "./marketing-core";
export { segmentoLabel, eventoLabel, condicionLabel } from "./marketing-core";

// --- Campanias Push ---

export async function listarCampaniasCore(_email: string): Promise<CampaniaPush[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    nombre: string;
    segmento: string;
    titulo: string;
    cuerpo: string;
    estado: string;
    programado_at: string | null;
    enviado_at: string | null;
    enviados_count: unknown;
    created_at: string;
  }>`
    select id, nombre, segmento, titulo, cuerpo, estado,
           programado_at::text as programado_at,
           enviado_at::text as enviado_at,
           enviados_count,
           created_at::text as created_at
    from torre.campanias_push
    order by created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    segmento: r.segmento as SegmentoPush,
    titulo: r.titulo,
    cuerpo: r.cuerpo,
    estado: r.estado as EstadoCampania,
    programadoAt: r.programado_at,
    enviadoAt: r.enviado_at,
    enviadosCount: num(r.enviados_count),
    createdAt: r.created_at,
  }));
}

type CrearCampaniaInput = {
  nombre: string;
  segmento: SegmentoPush;
  titulo: string;
  cuerpo: string;
  programadoAt: string | null;
};

export async function crearCampaniaCore(email: string, data: CrearCampaniaInput): Promise<CampaniaPush> {
  await exigirAccion(email, "comercial");
  const error = validarCampania({ nombre: data.nombre, segmento: data.segmento, titulo: data.titulo, cuerpo: data.cuerpo });
  if (error) throw new Error(error);

  const sql = await getSql();
  const id = newId("camp");
  const estado: EstadoCampania = data.programadoAt ? "programada" : "borrador";

  await sql`
    insert into torre.campanias_push (id, nombre, segmento, titulo, cuerpo, estado, programado_at)
    values (
      ${id}, ${data.nombre.trim()}, ${data.segmento}, ${data.titulo.trim()}, ${data.cuerpo.trim()},
      ${estado}, ${data.programadoAt ? data.programadoAt : null}::timestamptz
    )
  `;

  await auditar(email, "crear_campania_push", "campania_push", id, { nombre: data.nombre.trim() });

  const rows = await sql<{
    id: string; nombre: string; segmento: string; titulo: string; cuerpo: string;
    estado: string; programado_at: string | null; enviado_at: string | null;
    enviados_count: unknown; created_at: string;
  }>`select id, nombre, segmento, titulo, cuerpo, estado, programado_at::text as programado_at, enviado_at::text as enviado_at, enviados_count, created_at::text as created_at from torre.campanias_push where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    segmento: r.segmento as SegmentoPush,
    titulo: r.titulo,
    cuerpo: r.cuerpo,
    estado: r.estado as EstadoCampania,
    programadoAt: r.programado_at,
    enviadoAt: r.enviado_at,
    enviadosCount: num(r.enviados_count),
    createdAt: r.created_at,
  };
}

export async function enviarCampaniaCore(email: string, id: string): Promise<CampaniaPush> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string; estado: string }>`select id, estado from torre.campanias_push where id = ${id}`;
  if (!prev[0]) throw new Error("No existe esa campania.");
  if (prev[0].estado === "enviada") throw new Error("La campania ya fue enviada.");
  if (prev[0].estado === "cancelada") throw new Error("La campania esta cancelada.");

  // TODO: integrate with push notification service (src/lib/mensajes/push.ts)
  // For now, simulate sending by counting segment size
  const enviadosCount = 1; // placeholder

  await sql`
    update torre.campanias_push set
      estado = 'enviada',
      enviado_at = now(),
      enviados_count = ${enviadosCount}
    where id = ${id}
  `;

  await auditar(email, "enviar_campania_push", "campania_push", id, { enviados: enviadosCount });

  const rows = await sql<{
    id: string; nombre: string; segmento: string; titulo: string; cuerpo: string;
    estado: string; programado_at: string | null; enviado_at: string | null;
    enviados_count: unknown; created_at: string;
  }>`select id, nombre, segmento, titulo, cuerpo, estado, programado_at::text as programado_at, enviado_at::text as enviado_at, enviados_count, created_at::text as created_at from torre.campanias_push where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    segmento: r.segmento as SegmentoPush,
    titulo: r.titulo,
    cuerpo: r.cuerpo,
    estado: r.estado as EstadoCampania,
    programadoAt: r.programado_at,
    enviadoAt: r.enviado_at,
    enviadosCount: num(r.enviados_count),
    createdAt: r.created_at,
  };
}

export async function cancelarCampaniaCore(email: string, id: string): Promise<void> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string; estado: string }>`select id, estado from torre.campanias_push where id = ${id}`;
  if (!prev[0]) throw new Error("No existe esa campania.");
  if (prev[0].estado === "enviada") throw new Error("No se puede cancelar una campania ya enviada.");

  await sql`update torre.campanias_push set estado = 'cancelada' where id = ${id}`;
  await auditar(email, "cancelar_campania_push", "campania_push", id, {});
}

// --- Secuencias Email ---

export async function listarSecuenciasCore(_email: string): Promise<SecuenciaEmail[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    nombre: string;
    evento_trigger: string;
    asunto: string;
    contenido: string;
    activo: boolean;
    created_at: string;
  }>`
    select id, nombre, evento_trigger, asunto, contenido, activo,
           created_at::text as created_at
    from torre.secuencias_email
    order by created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    eventoTrigger: r.evento_trigger as EventoTrigger,
    asunto: r.asunto,
    contenido: r.contenido,
    activo: r.activo,
    createdAt: r.created_at,
  }));
}

type CrearSecuenciaInput = {
  nombre: string;
  eventoTrigger: EventoTrigger;
  asunto: string;
  contenido: string;
};

export async function crearSecuenciaCore(email: string, data: CrearSecuenciaInput): Promise<SecuenciaEmail> {
  await exigirAccion(email, "comercial");
  const error = validarSecuencia({ nombre: data.nombre, eventoTrigger: data.eventoTrigger, asunto: data.asunto, contenido: data.contenido });
  if (error) throw new Error(error);

  const sql = await getSql();
  const id = newId("seq");

  await sql`
    insert into torre.secuencias_email (id, nombre, evento_trigger, asunto, contenido)
    values (${id}, ${data.nombre.trim()}, ${data.eventoTrigger}, ${data.asunto.trim()}, ${data.contenido.trim()})
  `;

  await auditar(email, "crear_secuencia_email", "secuencia_email", id, { nombre: data.nombre.trim() });

  const rows = await sql<{
    id: string; nombre: string; evento_trigger: string; asunto: string;
    contenido: string; activo: boolean; created_at: string;
  }>`select id, nombre, evento_trigger, asunto, contenido, activo, created_at::text as created_at from torre.secuencias_email where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    eventoTrigger: r.evento_trigger as EventoTrigger,
    asunto: r.asunto,
    contenido: r.contenido,
    activo: r.activo,
    createdAt: r.created_at,
  };
}

export async function toggleSecuenciaCore(email: string, id: string): Promise<SecuenciaEmail> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string; activo: boolean }>`select id, activo from torre.secuencias_email where id = ${id}`;
  if (!prev[0]) throw new Error("No existe esa secuencia.");

  const nuevoActivo = !prev[0].activo;
  await sql`update torre.secuencias_email set activo = ${nuevoActivo} where id = ${id}`;
  await auditar(email, "toggle_secuencia_email", "secuencia_email", id, { activo: nuevoActivo });

  const rows = await sql<{
    id: string; nombre: string; evento_trigger: string; asunto: string;
    contenido: string; activo: boolean; created_at: string;
  }>`select id, nombre, evento_trigger, asunto, contenido, activo, created_at::text as created_at from torre.secuencias_email where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    eventoTrigger: r.evento_trigger as EventoTrigger,
    asunto: r.asunto,
    contenido: r.contenido,
    activo: r.activo,
    createdAt: r.created_at,
  };
}

// --- Ofertas Automaticas ---

export async function listarOfertasCore(_email: string): Promise<OfertaAuto[]> {
  await exigirAccion(_email, "lectura");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    nombre: string;
    condicion: string;
    descuento_pct: unknown;
    mensaje: string;
    activo: boolean;
    created_at: string;
  }>`
    select id, nombre, condicion, descuento_pct, mensaje, activo,
           created_at::text as created_at
    from torre.ofertas_auto
    order by created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    condicion: r.condicion as CondicionOferta,
    descuentoPct: num(r.descuento_pct),
    mensaje: r.mensaje,
    activo: r.activo,
    createdAt: r.created_at,
  }));
}

type CrearOfertaInput = {
  nombre: string;
  condicion: CondicionOferta;
  descuentoPct: number;
  mensaje: string;
};

export async function crearOfertaCore(email: string, data: CrearOfertaInput): Promise<OfertaAuto> {
  await exigirAccion(email, "comercial");
  const error = validarOferta({ nombre: data.nombre, condicion: data.condicion, descuentoPct: data.descuentoPct, mensaje: data.mensaje });
  if (error) throw new Error(error);

  const sql = await getSql();
  const id = newId("ofe");

  await sql`
    insert into torre.ofertas_auto (id, nombre, condicion, descuento_pct, mensaje)
    values (${id}, ${data.nombre.trim()}, ${data.condicion}, ${data.descuentoPct}, ${data.mensaje.trim()})
  `;

  await auditar(email, "crear_oferta_auto", "oferta_auto", id, { nombre: data.nombre.trim() });

  const rows = await sql<{
    id: string; nombre: string; condicion: string; descuento_pct: unknown;
    mensaje: string; activo: boolean; created_at: string;
  }>`select id, nombre, condicion, descuento_pct, mensaje, activo, created_at::text as created_at from torre.ofertas_auto where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    condicion: r.condicion as CondicionOferta,
    descuentoPct: num(r.descuento_pct),
    mensaje: r.mensaje,
    activo: r.activo,
    createdAt: r.created_at,
  };
}

export async function toggleOfertaCore(email: string, id: string): Promise<OfertaAuto> {
  await exigirAccion(email, "comercial");
  const sql = await getSql();

  const prev = await sql<{ id: string; activo: boolean }>`select id, activo from torre.ofertas_auto where id = ${id}`;
  if (!prev[0]) throw new Error("No existe esa oferta.");

  const nuevoActivo = !prev[0].activo;
  await sql`update torre.ofertas_auto set activo = ${nuevoActivo} where id = ${id}`;
  await auditar(email, "toggle_oferta_auto", "oferta_auto", id, { activo: nuevoActivo });

  const rows = await sql<{
    id: string; nombre: string; condicion: string; descuento_pct: unknown;
    mensaje: string; activo: boolean; created_at: string;
  }>`select id, nombre, condicion, descuento_pct, mensaje, activo, created_at::text as created_at from torre.ofertas_auto where id = ${id}`;

  const r = rows[0];
  return {
    id: r.id,
    nombre: r.nombre,
    condicion: r.condicion as CondicionOferta,
    descuentoPct: num(r.descuento_pct),
    mensaje: r.mensaje,
    activo: r.activo,
    createdAt: r.created_at,
  };
}

// --- Resumen ---

export async function marketingResumenCore(email: string): Promise<MarketingResumen> {
  const [campanias, secuencias, ofertas] = await Promise.all([
    listarCampaniasCore(email),
    listarSecuenciasCore(email),
    listarOfertasCore(email),
  ]);
  return calcularResumen(campanias, secuencias, ofertas);
}

// --- Server function wrappers ---

export const listarCampanias = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarCampaniasCore(email);
  });

export const crearCampania = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: CrearCampaniaInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return crearCampaniaCore(email, data);
  });

export const enviarCampania = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return enviarCampaniaCore(email, data);
  });

export const cancelarCampania = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return cancelarCampaniaCore(email, data);
  });

export const listarSecuencias = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarSecuenciasCore(email);
  });

export const crearSecuencia = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: CrearSecuenciaInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return crearSecuenciaCore(email, data);
  });

export const toggleSecuencia = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return toggleSecuenciaCore(email, data);
  });

export const listarOfertas = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return listarOfertasCore(email);
  });

export const crearOferta = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((input: CrearOfertaInput) => input)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return crearOfertaCore(email, data);
  });

export const toggleOferta = createServerFn({ method: "POST" })
  .middleware([torreGuard])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    const email = await requireTorre(context.userId);
    return toggleOfertaCore(email, data);
  });

export const marketingResumen = createServerFn({ method: "GET" })
  .middleware([torreGuard])
  .handler(async ({ context }) => {
    const email = await requireTorre(context.userId);
    return marketingResumenCore(email);
  });
