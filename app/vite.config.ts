import { readdirSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

/**
 * Chat en vivo en dev: upgrade solo de /api/mensajes. Cualquier otro path
 * (incluido el HMR de Vite) se deja intacto.
 */
function mensajesVivoPlugin(): Plugin {
  const marca = Symbol.for("mostrador.mensajes.upgrade");
  return {
    name: "mostrador:mensajes-vivo",
    apply: "serve",
    configureServer(server) {
      const http = server.httpServer;
      if (!http) return;
      const marcado = http as typeof http & { [marca]?: boolean };
      if (marcado[marca]) return;
      marcado[marca] = true;
      http.on("upgrade", (req, socket, head) => {
        const path = (req.url ?? "").split("?", 1)[0] ?? "";
        if (path !== "/api/mensajes") return;
        socket.pause();
        void server
          .ssrLoadModule("/src/lib/server/mensajes-socket.ts")
          .then((mod) => {
            const aceptar = (mod as { aceptarMensajes?: (req: IncomingMessage, socket: Socket, head: Buffer) => void })
              .aceptarMensajes;
            if (!aceptar) {
              socket.destroy();
              return;
            }
            aceptar(req, socket, Buffer.isBuffer(head) ? head : Buffer.alloc(0));
          })
          .catch((err) => {
            console.error("[mensajes] no se pudo abrir el socket:", err);
            socket.destroy();
          });
      });
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    pgliteBootstrapPlugin(),
    mensajesVivoPlugin(),
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
