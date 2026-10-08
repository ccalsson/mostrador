export type QueuedPedido = {
  clientUuid: string;
  clienteId?: string | null;
  clienteNombre: string;
  nota?: string;
  items: { productoId: string; cantidad: number }[];
  createdAt: string;
};

const KEY = "mostrador.outbox";

export function readQueue(): QueuedPedido[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedPedido[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(items: QueuedPedido[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueuePedido(p: QueuedPedido) {
  writeQueue([...readQueue(), p]);
}

export function removeQueued(clientUuid: string) {
  writeQueue(readQueue().filter((p) => p.clientUuid !== clientUuid));
}
