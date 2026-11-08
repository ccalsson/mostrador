/**
 * Logica pura de consolidacion de clientes cross-app para la Vista 360.
 * Sin dependencias de DB ni server functions — solo datos y calculos.
 */

export type AppNombre = "Mostrador" | "Mercado" | "Super" | "Materiales";

export type ClienteUnificado = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  apps: Array<{ nombre: AppNombre; clienteId: string; estado: string }>;
  lifetimeValue: number;
  totalCompras: number;
  ultimaActividad: string | null;
  ticketPromedio: number;
  appPreferida: AppNombre | null;
};

export type CompraInput = {
  clienteId: string;
  monto: number;
  createdAt: string;
};

export type ClienteMostrador = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  tenantId: string;
};

export type ClienteMercado = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  userId: string | null;
};

type Clave = string;

function claveDe(email: string | null, telefono: string | null): Clave | null {
  if (email && email.trim()) return `e:${email.trim().toLowerCase()}`;
  if (telefono && telefono.trim()) return `t:${telefono.trim()}`;
  return null;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function consolidarClientes(
  clientesMostrador: ClienteMostrador[],
  clientesMercado: ClienteMercado[],
  comprasMostrador: CompraInput[],
  comprasMercado: CompraInput[],
  comprasSuper: CompraInput[],
  comprasMateriales: CompraInput[],
): ClienteUnificado[] {
  // Map: clave -> datos consolidados
  const map = new Map<
    Clave,
    {
      nombre: string;
      email: string | null;
      telefono: string | null;
      apps: Map<AppNombre, { clienteId: string; estado: string }>;
      comprasPorApp: Record<AppNombre, { total: number; cantidad: number }>;
      ultimaActividad: string | null;
      ids: string[];
    }
  >();

  function obtenerOCrear(clave: Clave, nombre: string, email: string | null, telefono: string | null) {
    let entry = map.get(clave);
    if (!entry) {
      entry = {
        nombre,
        email: email ?? null,
        telefono: telefono ?? null,
        apps: new Map(),
        comprasPorApp: {
          Mostrador: { total: 0, cantidad: 0 },
          Mercado: { total: 0, cantidad: 0 },
          Super: { total: 0, cantidad: 0 },
          Materiales: { total: 0, cantidad: 0 },
        },
        ultimaActividad: null,
        ids: [],
      };
      map.set(clave, entry);
    }
    // Preferir nombre con mas datos (no vacio, mas largo)
    if (nombre.length > entry.nombre.length) entry.nombre = nombre;
    if (!entry.email && email) entry.email = email;
    if (!entry.telefono && telefono) entry.telefono = telefono;
    return entry;
  }

  // 1. Registrar clientes de Mostrador
  for (const c of clientesMostrador) {
    const clave = claveDe(c.email, c.telefono);
    if (!clave) continue;
    const entry = obtenerOCrear(clave, c.nombre, c.email, c.telefono);
    if (!entry.ids.includes(c.id)) entry.ids.push(c.id);
    if (!entry.apps.has("Mostrador")) {
      entry.apps.set("Mostrador", { clienteId: c.id, estado: "activo" });
    }
  }

  // 2. Registrar clientes de Mercado (y Super, que comparten mercado_compradores)
  for (const c of clientesMercado) {
    const clave = claveDe(c.email, c.telefono);
    if (!clave) continue;
    const entry = obtenerOCrear(clave, c.nombre, c.email, c.telefono);
    if (!entry.ids.includes(c.id)) entry.ids.push(c.id);
    if (!entry.apps.has("Mercado")) {
      entry.apps.set("Mercado", { clienteId: c.id, estado: c.userId ? "verificado" : "pendiente" });
    }
  }

  // 3. Procesar compras de Mostrador
  // Necesitamos mapear cliente_id de compra -> clave del cliente
  const mostradorIdAClave = new Map<string, Clave>();
  for (const c of clientesMostrador) {
    const clave = claveDe(c.email, c.telefono);
    if (clave) mostradorIdAClave.set(c.id, clave);
  }
  for (const compra of comprasMostrador) {
    const clave = mostradorIdAClave.get(compra.clienteId);
    if (!clave) continue;
    const entry = map.get(clave);
    if (!entry) continue;
    entry.comprasPorApp.Mostrador.total += compra.monto;
    entry.comprasPorApp.Mostrador.cantidad += 1;
    entry.ultimaActividad = maxDate(entry.ultimaActividad, compra.createdAt);
  }

  // 4. Procesar compras de Mercado
  const mercadoIdAClave = new Map<string, Clave>();
  for (const c of clientesMercado) {
    const clave = claveDe(c.email, c.telefono);
    if (clave) mercadoIdAClave.set(c.id, clave);
  }
  for (const compra of comprasMercado) {
    const clave = mercadoIdAClave.get(compra.clienteId);
    if (!clave) continue;
    const entry = map.get(clave);
    if (!entry) continue;
    entry.comprasPorApp.Mercado.total += compra.monto;
    entry.comprasPorApp.Mercado.cantidad += 1;
    entry.ultimaActividad = maxDate(entry.ultimaActividad, compra.createdAt);
  }

  // 5. Procesar compras de Super (usan mercado_compradores)
  for (const compra of comprasSuper) {
    const clave = mercadoIdAClave.get(compra.clienteId);
    if (!clave) continue;
    const entry = map.get(clave);
    if (!entry) continue;
    entry.comprasPorApp.Super.total += compra.monto;
    entry.comprasPorApp.Super.cantidad += 1;
    entry.ultimaActividad = maxDate(entry.ultimaActividad, compra.createdAt);
    if (!entry.apps.has("Super")) {
      const mercadoEntry = entry.apps.get("Mercado");
      entry.apps.set("Super", {
        clienteId: mercadoEntry?.clienteId ?? compra.clienteId,
        estado: "activo",
      });
    }
  }

  // 6. Procesar compras de Materiales Ya
  // Materiales Ya usa tabla clientes propia o compartida; mapeamos por id directo
  const materialesIdAClave = new Map<string, Clave>();
  // Los clientes de Materiales pueden aparecer en clientesMostrador si comparten DB
  for (const c of clientesMostrador) {
    const clave = claveDe(c.email, c.telefono);
    if (clave) materialesIdAClave.set(c.id, clave);
  }
  for (const c of clientesMercado) {
    const clave = claveDe(c.email, c.telefono);
    if (clave) materialesIdAClave.set(c.id, clave);
  }
  for (const compra of comprasMateriales) {
    const clave = materialesIdAClave.get(compra.clienteId);
    if (!clave) continue;
    const entry = map.get(clave);
    if (!entry) continue;
    entry.comprasPorApp.Materiales.total += compra.monto;
    entry.comprasPorApp.Materiales.cantidad += 1;
    entry.ultimaActividad = maxDate(entry.ultimaActividad, compra.createdAt);
    if (!entry.apps.has("Materiales")) {
      entry.apps.set("Materiales", { clienteId: compra.clienteId, estado: "activo" });
    }
  }

  // 7. Construir resultado
  const resultados: ClienteUnificado[] = [];
  for (const [clave, entry] of map) {
    const ltv =
      entry.comprasPorApp.Mostrador.total +
      entry.comprasPorApp.Mercado.total +
      entry.comprasPorApp.Super.total +
      entry.comprasPorApp.Materiales.total;
    const totalCompras =
      entry.comprasPorApp.Mostrador.cantidad +
      entry.comprasPorApp.Mercado.cantidad +
      entry.comprasPorApp.Super.cantidad +
      entry.comprasPorApp.Materiales.cantidad;

    // App preferida: la de mayor monto
    let appPreferida: AppNombre | null = null;
    let maxMonto = 0;
    for (const app of ["Mostrador", "Mercado", "Super", "Materiales"] as AppNombre[]) {
      if (entry.comprasPorApp[app].total > maxMonto) {
        maxMonto = entry.comprasPorApp[app].total;
        appPreferida = app;
      }
    }

    resultados.push({
      id: clave,
      nombre: entry.nombre,
      email: entry.email,
      telefono: entry.telefono,
      apps: Array.from(entry.apps.entries()).map(([nombre, data]) => ({
        nombre,
        clienteId: data.clienteId,
        estado: data.estado,
      })),
      lifetimeValue: ltv,
      totalCompras,
      ultimaActividad: entry.ultimaActividad,
      ticketPromedio: totalCompras > 0 ? Math.round(ltv / totalCompras) : 0,
      appPreferida,
    });
  }

  return resultados;
}
