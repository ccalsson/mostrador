type Balde = { n: number; vence: number };

const baldes = new Map<string, Balde>();

export function cupo(clave: string, limite: number, ventanaMs: number): { ok: true } | { ok: false; reintento: number } {
  const ahora = Date.now();
  if (baldes.size > 8000) {
    for (const [id, balde] of baldes) {
      if (balde.vence <= ahora) baldes.delete(id);
    }
  }
  const actual = baldes.get(clave);
  if (!actual || actual.vence <= ahora) {
    baldes.set(clave, { n: 1, vence: ahora + ventanaMs });
    return { ok: true };
  }
  if (actual.n >= limite) return { ok: false, reintento: Math.max(1, Math.ceil((actual.vence - ahora) / 1000)) };
  actual.n += 1;
  return { ok: true };
}

export function ipDe(request: Request) {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const adelante = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (adelante) return adelante.slice(0, 64);
  return "sin-ip";
}

export function rechazarCupo(reintento: number) {
  return new Response(JSON.stringify({ message: "Demasiados intentos. Esperá un momento." }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": String(reintento),
      "cache-control": "no-store",
    },
  });
}
