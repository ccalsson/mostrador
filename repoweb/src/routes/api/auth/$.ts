import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { proxyAppAuth } from "@/lib/app-api.server";

function handleAuth(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  if (
    url.pathname === "/api/auth/get-session" &&
    request.headers.has("x-grok-identity")
  ) {
    return auth.handler(request);
  }
  return proxyAppAuth(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuth(request),
      POST: ({ request }) => handleAuth(request),
    },
  },
});
