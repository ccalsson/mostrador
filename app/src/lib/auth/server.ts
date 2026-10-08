/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * The app runs its own Better Auth at `/api/auth/*`:
 *   - Web: same-origin session cookie (`__Host-mostrador-auth.session_token`).
 *   - Mobile (Flutter): signs in at `/api/auth/sign-in/email` and then sends the
 *     returned session token as `Authorization: Bearer` — the `bearer()` plugin
 *     accepts it in place of the cookie.
 *
 * Storage:
 *   - `DATABASE_URL` set -> real Postgres (Neon DEV). Sessions and app data
 *     share the same database.
 *   - unset -> embedded PGLite (local dev without a DB; wiped on restart).
 *
 * Auth is ON unless `VITE_AUTH_ENABLED=false` (explicit off-switch for
 * DB-less demos; see `verify.server.ts` for the fail-closed behavior).
 *
 * NEVER import this from client code — it pulls in `pg` + server-only Better
 * Auth internals. The client uses `@/lib/auth/client`; components read the user
 * via `@/lib/auth/use-current-user`; server functions get a verified id via
 * `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Dev fallback secret must outlive module reloads: PGLite (and its session
 * rows) is stored on `globalThis`, so an HMR re-eval of this file must NOT mint
 * a new signing secret or every existing session becomes invalid mid-dev.
 * Production/dev-with-.env uses `BETTER_AUTH_SECRET` (see `.env.example`).
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __mostradorDevAuthSecret__?: string;
};
function devAuthSecret(): string {
  globalAuthRef.__mostradorDevAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__mostradorDevAuthSecret__;
}

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// Explicit off-switch. Set `VITE_AUTH_ENABLED=false` to force auth off
// everywhere (shared dev user; refuses to run against a real DATABASE_URL).
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

/** True when real auth is enforced (always, unless explicitly disabled). */
export const authConfigured = !authDisabled;

// This app's own Better Auth origin. Set `BETTER_AUTH_URL` when the public URL
// is fixed (deploys); local dev derives the origin per-request from these
// loopback hosts.
const explicitBaseURL = env("BETTER_AUTH_URL");
// Local `npm run dev` (port 8080 contract). Browsers may send Origin as any of
// these for the same server — trusting only `localhost` rejects `127.0.0.1` and
// breaks email/password with "Invalid origin".
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const baseURL = explicitBaseURL ?? {
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  // `auto` → trust both http:// and https:// expansions of allowedHosts.
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

// Origins Better Auth accepts on credentialed POSTs (sign-up/sign-in, etc.).
// Missing entries here surface as FORBIDDEN "Invalid origin".
const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : LOCAL_DEV_ORIGINS;

const databaseUrl = env("DATABASE_URL");

// Real Postgres when `DATABASE_URL` is set, else the app's embedded PGLite via a
// Kysely dialect — so Better Auth persists to the SAME DB as app data. Both use
// the Better Auth schema from `migrations/auth/0001_auth.sql`, copied into
// `migrations/` when the app turns sign-in on.
const authPool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
// Same idle-connection exposure as `db.ts`: without this listener an idle Neon
// client error is re-emitted unhandled and crashes the process.
authPool?.on("error", (err) => console.error("[auth] idle client error:", err.message));
const database = authPool ?? { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name — also read by the dev WebSocket in `mensajes-socket.ts`. */
export const SESSION_TOKEN_COOKIE = "__Host-mostrador-auth.session_token";

export const auth = betterAuth({
  baseURL,
  // `BETTER_AUTH_SECRET` from `.env` (never committed). The in-process fallback
  // keeps local dev bootable without one, but invalidates sessions on restart.
  secret: env("BETTER_AUTH_SECRET") ?? devAuthSecret(),
  database,
  trustedOrigins,

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — this shrinks the "loading"
  // window and reduces auth flicker.
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  // Local email/password — toggled only via `./email-password` (not a plugin).
  // Password reset: there is no SMTP in this stack yet, so in DEV the reset
  // link is printed to the server console (same convention as the seed).
  ...(emailAndPasswordEnabled
    ? {
        emailAndPassword: {
          enabled: true,
          forgetPasswordCallbackPath: "/reset-password",
          sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
            console.log(`[auth] Recuperación de contraseña para ${user.email}: ${url}`);
          },
        },
      }
    : {}),

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute, so a sibling app cannot "toss" a session
  // cookie onto this app. `__Host-` requires Secure + Path=/ + no Domain; Better
  // Auth otherwise uses `__Secure-` (which permits Domain), so we drop its auto
  // prefix (`useSecureCookies: false`) and set Secure + the names ourselves.
  // (Browsers allow Secure cookies on `http://localhost`, so local dev works.)
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-mostrador-auth.session_data" },
      account_data: { name: "__Host-mostrador-auth.account_data" },
      dont_remember: { name: "__Host-mostrador-auth.dont_remember" },
    },
  },

  plugins: [
    // Accept `Authorization: Bearer <session-token>` as an alternative to the
    // cookie — the mobile (Flutter) auth contract. The hook only fires when an
    // Authorization header is present, so the cookie path is unaffected.
    bearer(),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});
