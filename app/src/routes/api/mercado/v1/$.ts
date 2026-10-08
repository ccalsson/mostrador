import { createFileRoute } from "@tanstack/react-router";
import { MercadoError, authenticate, cancelBuyerOrder, clearExpiredGoogleStates, createOAuthSession, createOrders, createRoute, emailFromExternal, findGoogleCredential, getBuyerOrder, getMe, listAvisos, listBuyerOrders, listCouriers, listPublicRanking, listRoutes, listStandProducts, listStands, newGoogleState, rateRoute, registerBuyer, registerCourier, restablecer, setCourierAvailability, signIn, signOut, solicitarRecuperacion, updateStop, uploadIdentity, changeRoute } from "@/lib/server/mercado";
import {
  aceptarDocumentoLegal,
  documentoLegalContenido,
  listarDocumentosLegales,
} from "@/lib/server/legal";
import { getSql } from "@/lib/db";
import type { MercadoPerfil } from "@/lib/server/mercado";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  vary: "authorization",
};

class RouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function json(value: unknown, init: ResponseInit = {}) {
  return Response.json(value, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } });
}

function errorResponse(error: unknown) {
  if (error instanceof MercadoError || error instanceof RouteError) {
    return json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return json(
      { error: "conflict", message: "El recurso ya existe o ya fue procesado." },
      { status: 409 },
    );
  }
  console.error("[mercado] request failed");
  return json({ error: "internal_error", message: "No se pudo completar la solicitud." }, { status: 500 });
}

function tokenFrom(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  return header?.match(/^Bearer\s+(.+)$/i)?.[1];
}

function segmentsOf(splat: string | undefined): string[] {
  return (splat ?? "").split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new RouteError(415, "unsupported_media_type", "Enviá el cuerpo como application/json.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RouteError(400, "invalid_request", "El cuerpo no es JSON válido.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RouteError(400, "invalid_request", "El cuerpo debe ser un objeto JSON.");
  }
  return body as Record<string, unknown>;
}

function pathOf(splat: string | undefined) {
  return segmentsOf(splat);
}

function setCookie(state: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `mercado_google_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/mercado/v1/auth/google/callback; Max-Age=600${secure}`;
}

function cookieValue(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie") ?? "";
  const pair = raw.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  if (!pair) return undefined;
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function clearStateCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `mercado_google_state=; HttpOnly; SameSite=Lax; Path=/api/mercado/v1/auth/google/callback; Max-Age=0${secure}`;
}

async function startGoogle(request: Request, body: Record<string, unknown>) {
  const perfil = body.perfil;
  if (perfil !== "comprador" && perfil !== "cargador") {
    throw new RouteError(400, "invalid_request", "perfil debe ser comprador o cargador.");
  }
  if (body.destino !== undefined && body.destino !== "app" && body.destino !== "web") {
    throw new RouteError(400, "invalid_request", "destino inválido.");
  }
  const clientId = process.env.GROK_AUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GROK_AUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new RouteError(503, "google_unavailable", "El acceso con Google no está configurado en este servidor.");
  }
  const baseUrl = process.env.BETTER_AUTH_URL?.trim() || new URL(request.url).origin;
  const callback = new URL("/api/mercado/v1/auth/google/callback", baseUrl);
  const state = newGoogleState();
  const destino = body.destino === "web" ? "web" : "app";
  const sql = await getSql();
  await clearExpiredGoogleStates(sql);
  await sql`
    insert into mercado_google_state (state, perfil, destino, expires_at)
    values (${state}, ${perfil}, ${destino}, now() + interval '10 minutes')
  `;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback.toString());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return json(
    { url: url.toString() },
    { headers: { "set-cookie": setCookie(state) } },
  );
}

async function finishGoogle(request: Request, url: URL) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const stateCookie = cookieValue(request, "mercado_google_state");
  if (!state || !stateCookie || state !== stateCookie || !code) {
    throw new RouteError(400, "google_state_invalid", "No se pudo validar el regreso de Google.");
  }
  const sql = await getSql();
  const states = await sql<{ perfil: MercadoPerfil; destino: "app" | "web" }>`
    delete from mercado_google_state
    where state = ${state} and expires_at > now()
    returning perfil, destino
  `;
  const oauth = states[0];
  if (!oauth) throw new RouteError(400, "google_state_expired", "El acceso con Google venció. Volvé a intentarlo.");
  const clientId = process.env.GROK_AUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GROK_AUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new RouteError(503, "google_unavailable", "El acceso con Google no está configurado en este servidor.");
  }
  const baseUrl = process.env.BETTER_AUTH_URL?.trim() || new URL(request.url).origin;
  const redirectUri = new URL("/api/mercado/v1/auth/google/callback", baseUrl).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new RouteError(502, "google_exchange_failed", "Google no pudo completar la autenticación.");
  const tokenBody = await tokenResponse.json() as { access_token?: string };
  if (!tokenBody.access_token) throw new RouteError(502, "google_exchange_failed", "Google no devolvió una sesión válida.");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!profileResponse.ok) throw new RouteError(502, "google_profile_failed", "No se pudo verificar el perfil de Google.");
  const profile = await profileResponse.json() as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    phone_number?: string;
  };
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new RouteError(403, "google_email_unverified", "La cuenta de Google no tiene un correo verificado.");
  }
  const actor = await findGoogleCredential(
    emailFromExternal(profile.email),
    profile.sub,
    oauth.perfil,
    profile.name?.trim() || profile.email,
    profile.phone_number?.trim() || "",
  );
  const token = await createOAuthSession(actor);
  const destination = oauth.destino === "web"
    ? new URL(`/mercado?token=${encodeURIComponent(token)}`, baseUrl)
    : new URL(`mercadoaltoque://auth?token=${encodeURIComponent(token)}`);
  return new Response(null, {
    status: 302,
    headers: {
      location: destination.toString(),
      "cache-control": "no-store",
      "set-cookie": clearStateCookie(),
    },
  });
}

async function handle(method: "GET" | "POST", request: Request, splat?: string) {
  try {
    const segments = pathOf(splat);
    const url = new URL(request.url);
    if (method === "POST" && segments.join("/") === "auth/registro") {
      return json(await registerBuyer(await bodyOf(request)), { status: 201 });
    }
    if (method === "POST" && segments.join("/") === "auth/registro-cargador") {
      return json(await registerCourier(await bodyOf(request)), { status: 201 });
    }
    if (method === "POST" && segments.join("/") === "auth/ingreso") {
      return json(await signIn(await bodyOf(request)));
    }
    if (method === "POST" && segments.join("/") === "auth/recuperar") {
      return json(await solicitarRecuperacion(await bodyOf(request)));
    }
    if (method === "POST" && segments.join("/") === "auth/restablecer") {
      return json(await restablecer(await bodyOf(request)));
    }
    if (method === "POST" && segments.join("/") === "auth/google") {
      return startGoogle(request, await bodyOf(request));
    }
    if (method === "GET" && segments.join("/") === "auth/google/callback") {
      return await finishGoogle(request, url);
    }
    if (method === "POST" && segments.join("/") === "auth/salir") {
      return json(await signOut(tokenFrom(request)));
    }
    if (method === "GET" && segments.join("/") === "ranking") {
      return json(await listPublicRanking(), { headers: { "cache-control": "public, max-age=60" } });
    }
    if (method === "GET" && segments.join("/") === "avisos") {
      return json(await listAvisos(), { headers: { "cache-control": "public, max-age=60" } });
    }

    const actor = await authenticate(tokenFrom(request));
    const route = segments.join("/");
    if (method === "GET" && route === "yo") return json(await getMe(actor));
    if (method === "POST" && route === "identidad") return json(await uploadIdentity(actor, await bodyOf(request)));
    if (method === "GET" && route === "puestos") return json(await listStands());
    if (method === "GET" && segments.length === 3 && segments[0] === "puestos" && segments[2] === "productos") {
      return json(await listStandProducts(segments[1]!));
    }
    if (method === "GET" && route === "pedidos") return json(await listBuyerOrders(actor));
    if (method === "POST" && route === "pedidos") {
      return json(await createOrders(actor, request.headers.get("idempotency-key") ?? undefined, await bodyOf(request)), { status: 201 });
    }
    if (method === "GET" && segments.length === 2 && segments[0] === "pedidos") {
      return json(await getBuyerOrder(actor, segments[1]!));
    }
    if (method === "POST" && segments.length === 3 && segments[0] === "pedidos" && segments[2] === "cancelar") {
      return json(await cancelBuyerOrder(actor, segments[1]!));
    }
    if (method === "GET" && route === "cargadores") return json(await listCouriers());
    if (method === "POST" && route === "recorridos") {
      return json(await createRoute(actor, request.headers.get("idempotency-key") ?? undefined, await bodyOf(request)), { status: 201 });
    }
    if (method === "GET" && route === "recorridos") return json(await listRoutes(actor));
    if (method === "POST" && segments.length === 3 && segments[0] === "recorridos" && ["aceptar", "rechazar"].includes(segments[2]!)) {
      return json(await changeRoute(actor, segments[1]!, segments[2] as "aceptar" | "rechazar", request.headers.get("idempotency-key") ?? undefined));
    }
    if (method === "POST" && segments.length === 3 && segments[0] === "recorridos" && ["retirar", "entregar"].includes(segments[2]!)) {
      const body = await bodyOf(request);
      if (typeof body.pedidoId !== "string" || !body.pedidoId.trim()) {
        throw new RouteError(400, "invalid_request", "pedidoId es obligatorio.");
      }
      return json(await updateStop(actor, segments[1]!, body.pedidoId, segments[2] as "retirar" | "entregar", request.headers.get("idempotency-key") ?? undefined));
    }
    if (method === "POST" && segments.length === 3 && segments[0] === "recorridos" && segments[2] === "calificar") {
      return json(await rateRoute(actor, segments[1]!, await bodyOf(request)));
    }
    if (method === "POST" && route === "cargador/disponibilidad") {
      return json(await setCourierAvailability(actor, await bodyOf(request)));
    }
    if (method === "GET" && route === "legal/documentos") {
      return json(await listarDocumentosLegales(actor));
    }
    if (method === "GET" && segments.length === 3 && segments[0] === "legal" && segments[1] === "documentos") {
      const raw = url.searchParams.get("version");
      const version = raw == null || raw === "" ? undefined : Number(raw);
      if (version !== undefined && (!Number.isInteger(version) || version <= 0)) {
        throw new RouteError(400, "cuerpo_invalido", "version debe ser un entero positivo.");
      }
      return json(await documentoLegalContenido(actor, segments[2]!, version));
    }
    if (method === "POST" && segments.length === 4 && segments[0] === "legal" && segments[1] === "documentos" && segments[3] === "aceptar") {
      const body = await bodyOf(request);
      const version = typeof body.version === "number" ? body.version : Number.NaN;
      const hash = typeof body.hash === "string" ? body.hash.trim() : "";
      if (!Number.isInteger(version) || version <= 0 || !hash) {
        throw new RouteError(400, "cuerpo_invalido", "version y hash son obligatorios.");
      }
      return json(
        await aceptarDocumentoLegal(
          actor,
          segments[2]!,
          { version, hash },
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
          request.headers.get("user-agent") ?? "",
        ),
      );
    }
    return json({ error: "not_found", message: "Ruta inexistente." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/mercado/v1/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle("GET", request, params._splat),
      POST: ({ request, params }) => handle("POST", request, params._splat),
    },
  },
});
