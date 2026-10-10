import { APP_API_BASE_URL } from "./app-api.server";
import { GROK_PROVIDERS } from "./auth/providers";

type PopupMessage = {
  source: "grok-auth-popup";
  token: string | null;
  error?: string;
};

const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

export async function handleAppAuthPopupRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const done = url.searchParams.get("done") === "1";

  if (done) {
    const errored = url.searchParams.has("error");
    const message: PopupMessage = {
      source: "grok-auth-popup",
      token: errored ? null : readCookie(request, SESSION_TOKEN_COOKIE),
      ...(errored ? { error: url.searchParams.get("error") ?? "sign_in_failed" } : {}),
    };
    return completionResponse(message);
  }

  const providerId = url.searchParams.get("providerId")?.trim();
  if (!GROK_PROVIDERS.some((provider) => provider.providerId === providerId)) {
    return new Response("Missing or unsupported providerId", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const callbackURL = `${url.origin}/auth/popup?done=1`;
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    origin: url.origin,
  });
  for (const name of ["cookie", "user-agent", "x-forwarded-host", "x-forwarded-proto"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const apiRes = await fetch(new URL("/api/auth/sign-in/oauth2", APP_API_BASE_URL), {
      method: "POST",
      headers,
      body: JSON.stringify({
        providerId,
        callbackURL,
        errorCallbackURL: `${callbackURL}&error=1`,
      }),
      cache: "no-store",
      redirect: "manual",
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return completionResponse({
        source: "grok-auth-popup",
        token: null,
        error: detail || `oauth_init_failed_${apiRes.status}`,
      });
    }

    const body = (await apiRes.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url) {
      return completionResponse({
        source: "grok-auth-popup",
        token: null,
        error: "oauth_init_missing_url",
      });
    }

    const responseHeaders = new Headers({
      location: body.url,
      "cache-control": "no-store",
    });
    for (const cookie of apiRes.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", cookie);
    }
    return new Response(null, { status: 302, headers: responseHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_init_failed";
    return completionResponse({ source: "grok-auth-popup", token: null, error: message });
  }
}

function completionResponse(message: PopupMessage): Response {
  const payload = JSON.stringify(message).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Iniciando sesión…</title>
<style>
  html,body{margin:0;min-height:100%;background:#0b0b0c;color:#a1a1aa;
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{min-height:100vh;display:grid;place-items:center;padding:1.5rem;text-align:center}
</style>
</head>
<body>
<main><p>Iniciando sesión…</p></main>
<script type="application/json" id="auth-popup-msg">${payload}</script>
<script>
(function () {
  var el = document.getElementById("auth-popup-msg");
  var msg = { source: "grok-auth-popup", token: null };
  try { if (el && el.textContent) msg = JSON.parse(el.textContent); } catch (e) {}
  try {
    if (window.opener) window.opener.postMessage(msg, window.location.origin);
  } catch (e) {}
  try { window.close(); } catch (e) {}
})();
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const equals = trimmed.indexOf("=");
    if (equals <= 0 || trimmed.slice(0, equals) !== name) continue;
    const raw = trimmed.slice(equals + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
