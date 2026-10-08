import { createFileRoute } from "@tanstack/react-router";
import { handleCentral } from "@/lib/torre/central-http";

export const Route = createFileRoute("/api/central/v1/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleCentral(request),
      POST: ({ request }) => handleCentral(request),
    },
  },
});
