/**
 * Server-side client for the canonical `/api/v1` backend in `app/`
 * (convergencia A2): repoweb's server functions proxy ERP operations there so
 * authorization, idempotency and audit live in one place. The caller's session
 * token is forwarded as `Authorization: Bearer` — same Better Auth tables and
 * secret (A1), so app/ validates it directly.
 *
 * Server-only (`.server.ts`): it fetches from the Node runtime, never the
 * browser.
 */

const BASE = process.env.APP_API_URL?.trim() || "http://127.0.0.1:8080";

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
