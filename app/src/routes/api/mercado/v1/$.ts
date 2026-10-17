import { createFileRoute } from "@tanstack/react-router";
import {
  MercadoError,
  authenticate,
  cancelBuyerOrder,
  clearExpiredGoogleStates,
  createOAuthSession,
  createOrders,
  createRoute,
  emailFromExternal,
  findGoogleCredential,
  getBuyerOrder,
  getMe,
  listAvisos,
  listBuyerOrders,
  listCouriers,
  listPublicRanking,
  listRoutes,
  listStandProducts,
  listStands,
  newGoogleState,
  rateRoute,
  registerBuyer,
  registerCourier,
  restablecer,
  setCourierAvailability,
  signIn,
  signOut,
  solicitarRecuperacion,
  updateStop,
  uploadIdentity,
  changeRoute,
} from "@/lib/server/mercado";
import {
  aceptarDocumentoLegal,
  documentoLegalContenido,
  listarDocumentosLegales,
} from "@/lib/server/legal";
import { getSql } from "@/lib/db";
import type { MercadoPerfil } from "@/lib/server/mercado";
import { ipDe, rechazarCupo } from "@/lib/seguridad/cupo";
import { cupoFirme } from "@/lib/seguridad/cupo-db";
import { verificarTurnstile } from "@/lib/seguridad/turnstile";
import {
  confirmarTokenMercado,
  reenviarSiPendienteMercado,
} from "@/lib/seguridad/confirmar-mercado";
import { correoAceptable } from "@/lib/seguridad/correo";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  vary: "authorization",
};

/** Tope del pedido común. La identidad lleva la foto del documento y la selfie. */
const TOPE_CUERPO = 24_000;
const TOPE_ADJUNTO = 1_500_000;

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
  if (error !== null && typeof error === "object" && "code" in error && error.code === "23505") {
    return json(
      { error: "conflict", message: "El recurso ya existe o ya fue procesado." },
      { status: 409 },
    );
  }
  console.error("[mercado] request failed");
  return json(
    { error: "internal_error", message: "No se pudo completar la solicitud." },
    { status: 500 },
  );
}

function tokenFrom(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  return header?.match(/^Bearer\s+(.+)$/i)?.[1];
}

function segmentsOf(splat: string | undefined): string[] {
  return (splat ?? "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

async function bodyOf(request: Request, tope = TOPE_CUERPO): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new RouteError(415, "unsupported_media_type", "Enviá el cuerpo como application/json.");
  }
  const anunciado = Number(request.headers.get("content-length") ?? 0);
  if (anunciado > tope) throw new RouteError(413, "payload_too_large", "El envío es demasiado grande.");
  const texto = await request.text();
  if (texto.length > tope) throw new RouteError(413, "payload_too_large", "El envío es demasiado grande.");
  let body: unknown;
  try {
    body = texto ? JSON.parse(texto) : undefined;
  } catch {
    throw new RouteError(400, "invalid_request", "El cuerpo no es JSON válido.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RouteError(400, "invalid_request", "El cuerpo debe ser un objeto JSON.");
  }
  return body as Record<string, unknown>;
}

function textoDe(data: Record<string, unknown>, clave: string): string {
  return typeof data[clave] === "string" ? data[clave] : "";
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
  const pair = raw
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
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

function mercadoWebBaseUrl(request: Request) {
  return (
    process.env.MERCADO_WEB_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    new URL(request.url).origin
  );
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
    throw new RouteError(
      503,
      "google_unavailable",
      "El acceso con Google no está configurado en este servidor.",
    );
  }
  const callback = new URL("/api/mercado/v1/auth/google/callback", mercadoWebBaseUrl(request));
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
  return json({ url: url.toString() }, { headers: { "set-cookie": setCookie(state) } });
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
  if (!oauth)
    throw new RouteError(
      400,
      "google_state_expired",
      "El acceso con Google venció. Volvé a intentarlo.",
    );
  const clientId = process.env.GROK_AUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GROK_AUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new RouteError(
      503,
      "google_unavailable",
      "El acceso con Google no está configurado en este servidor.",
    );
  }
  const callbackBaseUrl = mercadoWebBaseUrl(request);
  const redirectUri = new URL("/api/mercado/v1/auth/google/callback", callbackBaseUrl).toString();
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
  if (!tokenResponse.ok)
    throw new RouteError(
      502,
      "google_exchange_failed",
      "Google no pudo completar la autenticación.",
    );
  const tokenBody = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenBody.access_token)
    throw new RouteError(502, "google_exchange_failed", "Google no devolvió una sesión válida.");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!profileResponse.ok)
    throw new RouteError(502, "google_profile_failed", "No se pudo verificar el perfil de Google.");
  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    phone_number?: string;
  };
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new RouteError(
      403,
      "google_email_unverified",
      "La cuenta de Google no tiene un correo verificado.",
    );
  }
  const actor = await findGoogleCredential(
    emailFromExternal(profile.email),
    profile.sub,
    oauth.perfil,
    profile.name?.trim() || profile.email,
    profile.phone_number?.trim() || "",
  );
  const token = await createOAuthSession(actor);
  const webBaseUrl = callbackBaseUrl;
  let destination: URL;
  try {
    destination =
      oauth.destino === "web"
        ? new URL(`/mercado?token=${encodeURIComponent(token)}`, webBaseUrl)
        : new URL(`mercadoaltoque://auth?token=${encodeURIComponent(token)}`);
  } catch {
    throw new RouteError(
      503,
      "web_redirect_unavailable",
      "El regreso a Mercado web no está configurado.",
    );
  }
  if (oauth.destino === "web" && !["http:", "https:"].includes(destination.protocol)) {
    throw new RouteError(
      503,
      "web_redirect_unavailable",
      "El regreso a Mercado web no está configurado.",
    );
  }
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
    const ruta = segments.join("/");
    const ip = ipDe(request);
    const publico =
      method === "GET" && (ruta === "ranking" || ruta === "avisos" || ruta.startsWith("puestos"));
    const registro =
      method === "POST" && (ruta === "auth/registro" || ruta === "auth/registro-cargador");
    const ingreso = method === "POST" && ruta === "auth/ingreso";
    const confirmarReenviar =
      method === "POST" && (ruta === "auth/confirmar" || ruta === "auth/reenviar");
    const golpe = await cupoFirme(
      `${confirmarReenviar ? "confirmar" : registro ? "registro" : ingreso ? "ingreso" : publico ? "lectura" : "uso"}:${ip}`,
      confirmarReenviar ? 40 : registro ? 80 : ingreso ? 40 : publico ? 600 : 120,
      confirmarReenviar ? 15 * 60 * 1000 : registro ? 60 * 60 * 1000 : ingreso ? 15 * 60 * 1000 : 60 * 1000,
    );
    if (!golpe.ok) return rechazarCupo(golpe.reintento);
    if (registro) {
      const data = await bodyOf(request);
      // Campo oculto: si viene con texto es un robot. Se finge el alta y no se crea nada.
      if (textoDe(data, "website")) {
        return json(
          { pendiente: true, aviso: "Si el correo es válido, te llega un enlace para confirmarlo." },
          { status: 201 },
        );
      }
      const humano = await verificarTurnstile(textoDe(data, "captcha"), ip);
      if (!humano.ok) throw new RouteError(400, "captcha", humano.motivo);
      const origen = mercadoWebBaseUrl(request);
      return json(
        await (ruta === "auth/registro"
          ? registerBuyer(data, origen)
          : registerCourier(data, origen)),
        { status: 201 },
      );
    }
    if (method === "POST" && ruta === "auth/ingreso") {
      return json(await signIn(await bodyOf(request)));
    }
    if (method === "POST" && ruta === "auth/recuperar") {
      return json(await solicitarRecuperacion(await bodyOf(request)));
    }
    if (method === "POST" && ruta === "auth/restablecer") {
      return json(await restablecer(await bodyOf(request)));
    }
    if (method === "POST" && ruta === "auth/confirmar") {
      const body = await bodyOf(request);
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const perfil = body.perfil;
      if (perfil !== "comprador" && perfil !== "cargador") {
        throw new RouteError(400, "invalid_request", "perfil debe ser comprador o cargador.");
      }
      try {
        return json(await confirmarTokenMercado(token, perfil));
      } catch (err) {
        if (err instanceof Error && !(err instanceof MercadoError) && !(err instanceof RouteError)) {
          throw new RouteError(400, "invalid_token", err.message);
        }
        throw err;
      }
    }
    if (method === "POST" && ruta === "auth/reenviar") {
      const golpe = await cupoFirme(`reenviar-mercado:${ip}`, 10, 15 * 60 * 1000);
      if (!golpe.ok) return rechazarCupo(golpe.reintento);
      const body = await bodyOf(request);
      const correo = correoAceptable(typeof body.email === "string" ? body.email : "");
      const perfil = body.perfil;
      if (perfil !== "comprador" && perfil !== "cargador") {
        throw new RouteError(400, "invalid_request", "perfil debe ser comprador o cargador.");
      }
      if (correo.ok) {
        await reenviarSiPendienteMercado(correo.email, perfil, mercadoWebBaseUrl(request)).catch(
          () => undefined,
        );
      }
      return json({ aviso: "Si ese correo está pendiente, le llega otro enlace." });
    }
    if (method === "POST" && ruta === "auth/google") {
      return startGoogle(request, await bodyOf(request));
    }
    if (method === "GET" && ruta === "auth/google/callback") {
      return await finishGoogle(request, url);
    }
    if (method === "POST" && ruta === "auth/salir") {
      return json(await signOut(tokenFrom(request)));
    }
    if (method === "GET" && ruta === "ranking") {
      return json(await listPublicRanking(), {
        headers: { "cache-control": "public, max-age=60" },
      });
    }
    if (method === "GET" && ruta === "avisos") {
      return json(await listAvisos(), { headers: { "cache-control": "public, max-age=60" } });
    }

    const actor = await authenticate(tokenFrom(request));
    if (method === "GET" && ruta === "yo") return json(await getMe(actor));
    if (method === "POST" && ruta === "identidad")
      return json(await uploadIdentity(actor, await bodyOf(request, TOPE_ADJUNTO)));
    if (method === "GET" && ruta === "puestos") return json(await listStands());
    if (
      method === "GET" &&
      segments.length === 3 &&
      segments[0] === "puestos" &&
      segments[2] === "productos"
    ) {
      return json(await listStandProducts(segments[1]!));
    }
    if (method === "GET" && ruta === "pedidos") return json(await listBuyerOrders(actor));
    if (method === "POST" && ruta === "pedidos") {
      return json(
        await createOrders(
          actor,
          request.headers.get("idempotency-key") ?? undefined,
          await bodyOf(request),
        ),
        { status: 201 },
      );
    }
    if (method === "GET" && segments.length === 2 && segments[0] === "pedidos") {
      return json(await getBuyerOrder(actor, segments[1]!));
    }
    if (
      method === "POST" &&
      segments.length === 3 &&
      segments[0] === "pedidos" &&
      segments[2] === "cancelar"
    ) {
      return json(await cancelBuyerOrder(actor, segments[1]!));
    }
    if (method === "GET" && ruta === "cargadores") return json(await listCouriers());
    if (method === "POST" && ruta === "recorridos") {
      return json(
        await createRoute(
          actor,
          request.headers.get("idempotency-key") ?? undefined,
          await bodyOf(request),
        ),
        { status: 201 },
      );
    }
    if (method === "GET" && ruta === "recorridos") return json(await listRoutes(actor));
    if (
      method === "POST" &&
      segments.length === 3 &&
      segments[0] === "recorridos" &&
      ["aceptar", "rechazar"].includes(segments[2]!)
    ) {
      return json(
        await changeRoute(
          actor,
          segments[1]!,
          segments[2] as "aceptar" | "rechazar",
          request.headers.get("idempotency-key") ?? undefined,
        ),
      );
    }
    if (
      method === "POST" &&
      segments.length === 3 &&
      segments[0] === "recorridos" &&
      ["retirar", "entregar"].includes(segments[2]!)
    ) {
      const body = await bodyOf(request);
      if (typeof body.pedidoId !== "string" || !body.pedidoId.trim()) {
        throw new RouteError(400, "invalid_request", "pedidoId es obligatorio.");
      }
      return json(
        await updateStop(
          actor,
          segments[1]!,
          body.pedidoId,
          segments[2] as "retirar" | "entregar",
          request.headers.get("idempotency-key") ?? undefined,
        ),
      );
    }
    if (
      method === "POST" &&
      segments.length === 3 &&
      segments[0] === "recorridos" &&
      segments[2] === "calificar"
    ) {
      return json(await rateRoute(actor, segments[1]!, await bodyOf(request)));
    }
    if (method === "POST" && ruta === "cargador/disponibilidad") {
      return json(await setCourierAvailability(actor, await bodyOf(request)));
    }
    if (method === "GET" && ruta === "legal/documentos") {
      return json(await listarDocumentosLegales(actor));
    }
    if (
      method === "GET" &&
      segments.length === 3 &&
      segments[0] === "legal" &&
      segments[1] === "documentos"
    ) {
      const raw = url.searchParams.get("version");
      const version = raw == null || raw === "" ? undefined : Number(raw);
      if (version !== undefined && (!Number.isInteger(version) || version <= 0)) {
        throw new RouteError(400, "cuerpo_invalido", "version debe ser un entero positivo.");
      }
      return json(await documentoLegalContenido(actor, segments[2]!, version));
    }
    if (
      method === "POST" &&
      segments.length === 4 &&
      segments[0] === "legal" &&
      segments[1] === "documentos" &&
      segments[3] === "aceptar"
    ) {
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
