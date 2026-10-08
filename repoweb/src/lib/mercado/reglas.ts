export type LineaCanal = { tenantId: string; productoId: string; cantidad: number };

const LOGISTICA: Record<string, string[]> = {
  asignado: ["aceptado", "cancelado"],
  aceptado: ["retirado"],
  retirado: ["entregado"],
  entregado: [],
  cancelado: [],
};

export function agruparPorPuesto(lineas: LineaCanal[]) {
  const grupos = new Map<string, LineaCanal[]>();
  for (const linea of lineas) {
    const lista = grupos.get(linea.tenantId) ?? [];
    lista.push(linea);
    grupos.set(linea.tenantId, lista);
  }
  return [...grupos.entries()].map(([tenantId, items]) => ({ tenantId, items }));
}

export function claveDePedido(idempotencyKey: string, tenantId: string) {
  return `${idempotencyKey}:${tenantId}`;
}

export function alcanzaStock(stock: number, cantidad: number) {
  return cantidad > 0 && stock >= cantidad;
}

export function puedePasar(actual: string, siguiente: string) {
  return (LOGISTICA[actual] ?? []).includes(siguiente);
}

export function exigirTransicion(actual: string, siguiente: string) {
  if (!puedePasar(actual, siguiente)) {
    throw new Error(`No se puede pasar de ${actual} a ${siguiente}.`);
  }
}

/** Lo que ve el comprador. `listo` de Mostrador es el pedido preparado. */
export function estadoParaComprador(estadoPedido: string, logistica: string | null) {
  if (logistica === "entregado" || estadoPedido === "entregado") return "entregado";
  if (logistica === "retirado") return "retirado";
  if (estadoPedido === "anulado") return "cancelado";
  if (estadoPedido === "listo" || estadoPedido === "cobrado") return "preparado";
  if (estadoPedido === "en_preparacion") return "en_preparacion";
  return "confirmado";
}

export function minutosEntre(desde: string | null, hasta: string | null) {
  if (!desde || !hasta) return null;
  const delta = Date.parse(hasta) - Date.parse(desde);
  if (!Number.isFinite(delta) || delta < 0) return null;
  return Math.round(delta / 60000);
}

export function calcularScore(datos: {
  calificacionSuma: number;
  calificacionCantidad: number;
  recorridosCompletados: number;
  entregasATiempo: number;
  cancelaciones: number;
}) {
  const promedio = datos.calificacionCantidad
    ? datos.calificacionSuma / datos.calificacionCantidad
    : 0;
  const bruto =
    promedio * 20 +
    datos.recorridosCompletados * 2 +
    datos.entregasATiempo -
    datos.cancelaciones * 5;
  return Math.round(bruto * 100) / 100;
}

export function nivelPara(puntos: number, niveles: { codigo: string; puntosMinimos: number }[]) {
  const ordenados = [...niveles].sort((a, b) => a.puntosMinimos - b.puntosMinimos);
  let actual = ordenados[0]?.codigo ?? "nuevo";
  for (const nivel of ordenados) {
    if (puntos >= nivel.puntosMinimos) actual = nivel.codigo;
  }
  return actual;
}

export function puedeCalificar(estadoRecorrido: string, yaCalifico: boolean) {
  return estadoRecorrido === "entregado" && !yaCalifico;
}

export function contarBultos(items: { cantidad: number; unidad: string }[]) {
  return items.reduce((suma, item) => suma + (item.unidad === "bulto" ? item.cantidad : 0), 0);
}

export function nombreVisible(nombre: string) {
  const parte = nombre.trim().split(/\s+/)[0] ?? "";
  return parte || "Comprador";
}
