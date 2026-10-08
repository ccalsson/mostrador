import { createFileRoute } from "@tanstack/react-router";
import { TENANT_BAJADA, TENANT_ID } from "@/lib/catalog";
import { getSql } from "@/lib/db";

// Branding público del puesto para pantallas de login de las apps Flutter
// (se necesita antes de autenticar, así que vive fuera de /api/v1).
export const Route = createFileRoute("/api/tenant")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = await getSql();
          const rows = await sql<{ nombre: string; config: unknown }>`
            select nombre, config from tenants where id = ${TENANT_ID} limit 1
          `;
          const config = (rows[0]?.config ?? {}) as { bajada?: string };
          return Response.json(
            { nombre: rows[0]?.nombre ?? "Mostrador", bajada: config.bajada ?? TENANT_BAJADA },
            { headers: { "cache-control": "public, max-age=300" } },
          );
        } catch {
          return Response.json({ nombre: "Mostrador", bajada: TENANT_BAJADA });
        }
      },
    },
  },
});
