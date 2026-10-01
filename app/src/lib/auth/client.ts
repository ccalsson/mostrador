import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*` — the web
 * session rides the `__Host-mostrador-auth.session_token` cookie. The bearer
 * token in sessionStorage is kept as a fallback for clients where cookies are
 * partitioned/absent (same contract the Flutter clients use against
 * `/api/auth/sign-in/email`); `onRequest` attaches it when present, so the
 * cookie path is untouched elsewhere.
 *
 * To sign out call `signOut()` below, NOT `authClient.signOut()`: the raw call
 * leaves the bearer token in place, and `onRequest` keeps re-attaching it, so
 * the visitor stays signed in.
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
 * not `"false"`. Set that to `"false"` to select the dev user (see
 * `use-current-user`).
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

const BEARER_KEY = "mostrador-auth.bearer-token";

/** The stored mobile/dev bearer token, or null. */
export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

/** Store (or clear) the bearer token returned by `/api/auth/sign-in/email`. */
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
 * Sign out of THIS app's local session, clear the stored bearer token, then
 * redirect. Use this, never `authClient.signOut()` — see the note on
 * `authClient`.
 *
 * Rejects when the server never confirms: the session is an HttpOnly cookie
 * only the server can clear, so redirecting anyway would report a sign-out that
 * did not happen. `<UserButton />` handles that for you; a hand-rolled control
 * must catch it and let the visitor retry.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  setBearerToken(null);
  window.location.href = redirectTo;
}
