import { createFileRoute } from "@tanstack/react-router";
import { TENANT_BAJADA, TENANT_ID } from "@/lib/catalog";
import { getMarcaCompleta } from "@/lib/server/marca";

// Branding público del puesto para pantallas de login de las apps Flutter
// (se necesita antes de autenticar, así que vive fuera de /api/v1).
export const Route = createFileRoute("/api/tenant")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const marca = await getMarcaCompleta(TENANT_ID);
          return Response.json(
            marca,
            { headers: { "cache-control": "public, max-age=300" } },
          );
        } catch {
          return Response.json({
            id: TENANT_ID,
            nombre: "Mostrador",
            bajada: TENANT_BAJADA,
            membrete: "",
            pieTicket: "",
            fondo: null,
          });
        }
      },
    },
  },
});
