import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { ipDe, rechazarCupo } from "@/lib/seguridad/cupo";
import { cupoFirme } from "@/lib/seguridad/cupo-db";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: async ({ request }) => {
        const ruta = new URL(request.url).pathname;
        if (ruta.includes("sign-in") || ruta.includes("sign-up")) {
          const alta = ruta.includes("sign-up");
          const golpe = await cupoFirme(`auth:${ipDe(request)}`, alta ? 40 : 60, alta ? 60 * 60 * 1000 : 15 * 60 * 1000);
          if (!golpe.ok) return rechazarCupo(golpe.reintento);
        }
        return auth.handler(request);
      },
    },
  },
});
