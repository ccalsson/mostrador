/**
 * Aviso en proceso para el chat de pedidos. Vive en globalThis para que la
 * función de servidor y el WebSocket del dev server (módulos de Vite distintos)
 * compartan la misma lista de oyentes. La base sigue siendo la fuente de verdad:
 * el aviso solo dice “hay un mensaje nuevo en este pedido”.
 */
export type AvisoMensaje = {
  pedidoId: string;
  clienteId: string;
  tenantId: string;
};

type Oyente = (aviso: AvisoMensaje) => void;

const g = globalThis as typeof globalThis & {
  __mostradorMensajesHub?: Map<string, Set<Oyente>>;
};

function hub(): Map<string, Set<Oyente>> {
  g.__mostradorMensajesHub ??= new Map();
  return g.__mostradorMensajesHub;
}

export function suscribirCanal(canal: string, fn: Oyente): () => void {
  const map = hub();
  let set = map.get(canal);
  if (!set) {
    set = new Set();
    map.set(canal, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) map.delete(canal);
  };
}

export function publicarMensaje(aviso: AvisoMensaje): void {
  const map = hub();
  const canales = [`pedido:${aviso.pedidoId}`, `cliente:${aviso.clienteId}`, `tenant:${aviso.tenantId}`];
  const vistos = new Set<Oyente>();
  for (const canal of canales) {
    const set = map.get(canal);
    if (!set) continue;
    for (const fn of set) {
      if (vistos.has(fn)) continue;
      vistos.add(fn);
      try {
        fn(aviso);
      } catch {
        /* un oyente no puede frenar el envío */
      }
    }
  }
}
