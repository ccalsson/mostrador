import { createAuthClient } from "better-auth/react";
import { GOOGLE_PROVIDER } from "./providers";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`. The
 * `onRequest` hook attaches a bearer token when one is stored (used by
 * server-to-server / embedded clients); deployed browser sessions use the
 * `__Host-` cookie and store no token, so nothing changes there.
 *
 * To sign out call `signOut()` below, NOT `authClient.signOut()`.
 */
export const authClient = createAuthClient({
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
  },
});

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`. With the key removed, sign-in is real (Google directo y/o
 * email/password).
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/** True when our own Google OAuth client is configured. */
export const googleDirectEnabled = import.meta.env.VITE_GOOGLE_DIRECT === "true";

/** The upstream providers to render sign-in buttons for. */
export { GOOGLE_PROVIDER };

const BEARER_KEY = "mostrador-auth.bearer-token";

/** The stored bearer token, or null. */
export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

export function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Start sign-in with Google (nuestra propia app de Google Cloud).
 *
 * Limpia la sesión local antes para que un cambio de cuenta realmente cambie
 * de identidad. `callbackURL` es a dónde vuelve Google ya autenticado.
 */
export async function signIn(
  providerId: string = GOOGLE_PROVIDER.providerId,
  opts: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  if (providerId !== GOOGLE_PROVIDER.providerId) {
    throw new Error("Ese proveedor no está configurado.");
  }
  if (!googleDirectEnabled) throw new Error("Google no está configurado en este sitio.");

  const callbackURL = opts.callbackURL ?? "/";
  const errorCallbackURL = opts.errorCallbackURL ?? "/";

  await authClient.signOut().catch(() => undefined);
  setBearerToken(null);

  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL,
    errorCallbackURL,
  });
  if (error) throw new Error(error.message ?? "No se pudo iniciar sesión con Google.");
}

/**
 * Sign out of THIS app's local session, clear the stored token, then redirect.
 * Use this, never `authClient.signOut()` — the raw call leaves the token in
 * place and `onRequest` keeps re-attaching it.
 *
 * Rejects when the server does not confirm the sign-out: the session is an
 * HttpOnly cookie only the server can clear, so redirecting anyway would report
 * a sign-out that did not happen.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "No se pudo cerrar la sesión.");
  setBearerToken(null);
  window.location.replace(redirectTo);
}
