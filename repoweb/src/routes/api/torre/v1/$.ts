import { createFileRoute } from "@tanstack/react-router";
import { handleTorreMovil } from "@/lib/torre/movil-http";

export const Route = createFileRoute("/api/torre/v1/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleTorreMovil(request),
      POST: ({ request }) => handleTorreMovil(request),
    },
  },
});
