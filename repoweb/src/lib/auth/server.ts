/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * The app runs its own Better Auth at `/api/auth/*`, so the session cookie stays
 * on this app's own origin. Sign-in methods:
 *   - Google directo contra nuestra propia app de Google Cloud
 *     (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).
 *   - Email/password local (toggled in `./email-password`).
 *
 * No hay broker externo: nada de la autenticación pasa por Grok/xAI.
 *
 * Tri-mode:
 *   - Deployed: `GOOGLE_CLIENT_*` + `BETTER_AUTH_URL` + `DATABASE_URL` +
 *     `BETTER_AUTH_SECRET` vienen del entorno de Vercel.
 *   - Local: sin `DATABASE_URL` usa el PGLite embebido; sin `BETTER_AUTH_SECRET`
 *     usa un secreto de proceso (globalThis) para no invalidar sesiones en HMR.
 *   - Off (`VITE_AUTH_ENABLED=false`): `requireUserId` resuelve un usuario de
 *     desarrollo sin base configurada y falla cerrado si `DATABASE_URL` existe.
 *
 * NEVER import this from client code — it pulls in `pg` + server-only Better
 * Auth internals. The client uses `@/lib/auth/client`; components read the user
 * via `@/lib/auth/use-current-user`; server functions get a verified id via
 * `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Dev secret must outlive module reloads: PGLite (and its session rows) is
 * stored on `globalThis`, so an HMR re-eval of this file must NOT mint a new
 * signing secret or every existing session becomes invalid mid-dev. Process
 * restart clears both the secret and PGLite together.
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

// Explicit off-switch. The deployer sets `VITE_AUTH_ENABLED=true` when it
// provisions auth; set it to "false" to force auth off everywhere (dev user).
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

// Google OAuth directo, con nuestra propia app de Google Cloud.
const googleClientId = env("GOOGLE_CLIENT_ID");
const googleClientSecret = env("GOOGLE_CLIENT_SECRET");

/** True cuando hay cliente de Google propio: el sign-in va directo a Google. */
export const googleDirecto = Boolean(googleClientId && googleClientSecret);

/** True when sign-in is real (auth is enforced with at least one provider). */
export const authConfigured =
  !authDisabled && (googleDirecto || emailAndPasswordEnabled);

// This app's own Better Auth origin. When deployed the deployer injects the
// public URL; local dev derives it per-request from the loopback hosts.
const vercelProductionHost = env("VERCEL_PROJECT_PRODUCTION_URL");
const vercelDeploymentHost = env("VERCEL_URL");
const productionOrigin = vercelProductionHost ? `https://${vercelProductionHost}` : undefined;
const deploymentOrigin = vercelDeploymentHost ? `https://${vercelDeploymentHost}` : undefined;
const explicitBaseURL = env("BETTER_AUTH_URL") ?? productionOrigin;
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
// Missing entries here surface as FORBIDDEN "Invalid origin". Include the
// production domain and the current deployment host too, not only
// BETTER_AUTH_URL: a stale value in that env var must not lock the live site out.
const configuredOrigins: string[] = explicitBaseURL
  ? [
      ...new Set(
        [explicitBaseURL, productionOrigin, deploymentOrigin, ...LOCAL_DEV_ORIGINS].filter(
          (origin): origin is string => Boolean(origin),
        ),
      ),
    ]
  : [...LOCAL_DEV_ORIGINS];

// Also trust the origin the request actually arrived on (custom domain, alias,
// deployment URL). This stays safe: a cross-site forged POST carries the
// ATTACKER's origin, which is never echoed back here — so the check still
// rejects it. Meanwhile a domain the deployer forgot to list can't lock the site.
const trustedOrigins = (request?: Request): string[] => {
  const origins = [...configuredOrigins];
  try {
    if (request?.url) origins.push(new URL(request.url).origin);
  } catch {
    /* URL malformada: nos quedamos con la lista configurada */
  }
  return origins;
};

const databaseUrl = env("DATABASE_URL");
if (process.env.VERCEL === "1" && !databaseUrl) {
  throw new Error(
    "DATABASE_URL es obligatoria en Vercel. Better Auth no usa la base embebida en producción.",
  );
}
const authSecret = env("BETTER_AUTH_SECRET") ?? (process.env.VERCEL === "1" ? undefined : devAuthSecret());
if (!authSecret) {
  throw new Error("BETTER_AUTH_SECRET es obligatoria en Vercel.");
}

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (local) via a Kysely dialect — so Better Auth persists to the
// SAME DB as app data, including email/password users. Both use the Better Auth
// schema from `migrations/auth/0001_auth.sql`, copied into `migrations/` when
// the app turns sign-in on.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name (also accepted as `Authorization: Bearer`). */
export const SESSION_TOKEN_COOKIE = "__Host-mostrador-auth.session_token";

export const auth = betterAuth({
  baseURL,
  // Deployed apps inject BETTER_AUTH_SECRET. Local: process-stable secret on
  // globalThis so HMR doesn't invalidate PGLite-backed sessions (see above).
  secret: authSecret,
  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // See `trustedOrigins` construction above — must cover local loopback variants,
  // or clients get "Invalid origin".
  trustedOrigins,

  // Google directo (sin broker). Better Auth sólo expone
  // `signIn.social({ provider: "google" })` cuando el provider está acá;
  // registrarlo como plugin no lo publica.
  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: { clientId: googleClientId, clientSecret: googleClientSecret },
        },
      }
    : {}),

  // Encrypt OAuth tokens at rest y enlazar la identidad de Google al usuario
  // existente con el mismo email verificado.
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: false,
    },
  },

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — this shrinks the "loading"
  // window and reduces auth flicker. Gate on `isPending`; SSR the session.
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  // Local email/password — toggled only via `./email-password` (not a plugin).
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true, requireEmailVerification: true } } : {}),

  // `__Host-` prefixed cookies: require Secure + Path=/ + no Domain, so a
  // sibling app cannot "toss" a session cookie onto this one. Better Auth
  // otherwise uses `__Secure-` (which permits Domain), so we drop its auto
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
    // cookie (clientes móviles / pruebas server-to-server). Only fires when an
    // Authorization header is present, so the cookie path is unaffected.
    bearer(),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}
