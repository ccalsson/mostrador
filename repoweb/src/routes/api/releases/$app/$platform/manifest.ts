import { createFileRoute } from "@tanstack/react-router";
import { manifestHttp } from "@/lib/torre/manifest-http";

export const Route = createFileRoute("/api/releases/$app/$platform/manifest")({
  server: {
    handlers: {
      GET: ({ request, params }) => manifestHttp(request, params),
    },
  },
});
