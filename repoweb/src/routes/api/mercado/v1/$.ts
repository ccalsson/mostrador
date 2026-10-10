import { createFileRoute } from "@tanstack/react-router";
import { proxyAppMercado } from "@/lib/app-api.server";

export const Route = createFileRoute("/api/mercado/v1/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxyAppMercado(request),
      POST: ({ request }) => proxyAppMercado(request),
    },
  },
});
