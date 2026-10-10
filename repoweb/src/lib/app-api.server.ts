/**
 * Server-side client for the canonical `/api/v1` backend in `app/`
 * (convergencia A2–A5): repoweb's server functions proxy ERP operations there so
 * authorization, idempotency and audit live in one place. The caller's session
 * token is forwarded as `Authorization: Bearer` — same Better Auth tables and
 * secret (A1), so app/ validates it directly.
 *
 * Server-only (`.server.ts`): it fetches from the Node runtime, never the
 * browser.
 */

export const APP_API_BASE_URL = process.env.APP_API_URL?.trim() || "http://127.0.0.1:8080";
const BASE = APP_API_BASE_URL;

export class AppApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppApiError";
    this.status = status;
    this.code = code;
  }
}

type AppApiResponse = { data?: unknown; error?: string; message?: string };

export async function appApi<T>(opts: {
  token: string;
  method: "GET" | "POST";
  path: string[];
  query?: Record<string, string | undefined>;
  body?: unknown;
  forwardedFor?: string;
  userAgent?: string;
}): Promise<T> {
  const url = new URL(`/api/v1/${opts.path.map(encodeURIComponent).join("/")}`, BASE);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      authorization: `Bearer ${opts.token}`,
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
      ...(opts.forwardedFor ? { "x-forwarded-for": opts.forwardedFor } : {}),
      ...(opts.userAgent ? { "user-agent": opts.userAgent } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const payload = (await res.json().catch(() => null)) as AppApiResponse | null;
  if (!res.ok) {
    throw new AppApiError(
      res.status,
      payload?.error ?? "app_api_error",
      payload?.message ?? `La API devolvió el código ${res.status}.`,
    );
  }
  return (payload && payload.data !== undefined ? payload.data : payload) as T;
}

export async function appApiPublic<T>(opts: {
  method: "GET" | "POST";
  path: string[];
  query?: Record<string, string | undefined>;
  body?: unknown;
}): Promise<T> {
  const url = new URL(`/api/v1/${opts.path.map(encodeURIComponent).join("/")}`, BASE);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    method: opts.method,
    ...(opts.body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(opts.body),
        }),
  });
  const payload = (await res.json().catch(() => null)) as AppApiResponse | null;
  if (!res.ok) {
    throw new AppApiError(
      res.status,
      payload?.error ?? "app_api_error",
      payload?.message ?? `La API devolvió el código ${res.status}.`,
    );
  }
  return (payload && payload.data !== undefined ? payload.data : payload) as T;
}

export async function appMercadoApi<T>(opts: {
  token: string;
  method: "GET" | "POST";
  path: string[];
  query?: Record<string, string | undefined>;
  body?: unknown;
}): Promise<T> {
  const url = new URL(`/api/mercado/v1/${opts.path.map(encodeURIComponent).join("/")}`, BASE);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      authorization: `Bearer ${opts.token}`,
      accept: "application/json",
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => null)) as AppApiResponse | null;
  if (!res.ok) {
    throw new AppApiError(
      res.status,
      payload?.error ?? "app_api_error",
      payload?.message ?? `La API devolvió el código ${res.status}.`,
    );
  }
  return (payload && payload.data !== undefined ? payload.data : payload) as T;
}

export async function proxyAppMercado(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, BASE);
  const headers = new Headers();
  for (const name of [
    "accept",
    "authorization",
    "content-type",
    "cookie",
    "idempotency-key",
    "user-agent",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual",
  });
  return response;
}

export async function proxyAppAuth(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, BASE);
  const headers = new Headers();
  for (const name of [
    "accept",
    "authorization",
    "content-type",
    "cookie",
    "origin",
    "user-agent",
    "x-forwarded-host",
    "x-forwarded-proto",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual",
  });
}

export async function appApiPublicTenant(path: string[]): Promise<{
  id: string;
  nombre: string;
  bajada: string;
  membrete: string;
  pieTicket: string;
  fondo: string | null;
}> {
  const url = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, BASE);
  const res = await fetch(url);
  const payload = (await res.json().catch(() => null)) as {
    id?: unknown;
    nombre?: unknown;
    bajada?: unknown;
    membrete?: unknown;
    pieTicket?: unknown;
    fondo?: unknown;
    error?: string;
    message?: string;
  } | null;
  if (!res.ok) {
    throw new AppApiError(
      res.status,
      payload?.error ?? "app_api_error",
      payload?.message ?? `La API devolvió el código ${res.status}.`,
    );
  }
  if (
    !payload ||
    typeof payload.id !== "string" ||
    typeof payload.nombre !== "string" ||
    typeof payload.bajada !== "string" ||
    typeof payload.membrete !== "string" ||
    typeof payload.pieTicket !== "string" ||
    (payload.fondo !== null && typeof payload.fondo !== "string")
  ) {
    throw new AppApiError(
      res.status,
      "invalid_response",
      "La API devolvió una identidad de puesto inválida.",
    );
  }
  return {
    id: payload.id,
    nombre: payload.nombre,
    bajada: payload.bajada,
    membrete: payload.membrete,
    pieTicket: payload.pieTicket,
    fondo: payload.fondo,
  };
}
