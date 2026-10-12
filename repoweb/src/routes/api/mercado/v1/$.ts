import { createFileRoute } from "@tanstack/react-router";
import { handleMercado } from "@/lib/mercado/http";

export const Route = createFileRoute("/api/mercado/v1/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleMercado(request),
      POST: ({ request }) => handleMercado(request),
    },
  },
});
