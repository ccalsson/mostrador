import { createFileRoute } from "@tanstack/react-router";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId, UnauthorizedError } from "@/lib/auth/verify.server";
import { ensureStaffForUser } from "@/lib/server/bootstrap";
import {
  crearPedidoForStaff,
  listProductosForStaff,
  syncCatalogoForStaff,
  type CrearPedidoInput,
} from "@/lib/server/catalog-pedidos";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) return json({ error: "unauthorized" }, { status: 401 });
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
  const message = error instanceof Error ? error.message : "Solicitud inválida.";
  return json({ error: status === 403 ? "forbidden" : "invalid_request", message }, { status });
}

function bearerToken(request: Request): string | undefined {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function parsePedido(value: unknown): CrearPedidoInput {
  if (!value || typeof value !== "object") throw new Error("El cuerpo debe ser un objeto JSON.");
  const body = value as Record<string, unknown>;
  const clientUuid = typeof body.clientUuid === "string" ? body.clientUuid.trim() : "";
  const clienteNombre = typeof body.clienteNombre === "string" ? body.clienteNombre.trim() : "";
  const nota = typeof body.nota === "string" ? body.nota.trim() : undefined;
  const clienteId = typeof body.clienteId === "string" ? body.clienteId : null;
  if (!clientUuid || clientUuid.length > 120) throw new Error("clientUuid es obligatorio.");
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) {
    throw new Error("El pedido debe incluir entre 1 y 200 ítems.");
  }
  const items = body.items.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Ítem inválido.");
    const line = item as Record<string, unknown>;
    const productoId = typeof line.productoId === "string" ? line.productoId.trim() : "";
    const cantidad = typeof line.cantidad === "number" ? line.cantidad : Number.NaN;
    if (!productoId || !Number.isFinite(cantidad) || cantidad <= 0) throw new Error("Ítem inválido.");
    return { productoId, cantidad };
  });
  return { clientUuid, clienteId, clienteNombre: clienteNombre || "Mostrador", nota, items };
}

function parseSince(value: string | null): string | undefined {
  if (!value) return undefined;
  if (Number.isNaN(Date.parse(value))) throw new Error("since debe ser una fecha ISO válida.");
  return value;
}

/**
 * Minimal mobile contract. Better Auth remains mounted at `/api/auth/*`; mobile
 * clients authenticate there and send its session token as `Authorization: Bearer`.
 */
export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          assertSameSiteRequest();
          const staff = await ensureStaffForUser(await requireUserId(bearerToken(request)));
          if (params._splat === "session") {
            return json({ staff: { id: staff.id, nombre: staff.nombre, rol: staff.rol }, tenantId: staff.tenantId });
          }
          if (params._splat === "catalogo") {
            const since = parseSince(new URL(request.url).searchParams.get("since"));
            const catalogo = await syncCatalogoForStaff(staff, since);
            const etag = catalogo.version ? `\"${catalogo.version}\"` : undefined;
            if (etag && request.headers.get("if-none-match") === etag) {
              return new Response(null, {
                status: 304,
                headers: { "cache-control": "private, max-age=30", etag, vary: "authorization" },
              });
            }
            return json(
              { data: catalogo.productos, version: catalogo.version },
              { headers: { "cache-control": "private, max-age=30", etag: etag ?? "", vary: "authorization" } },
            );
          }
          return json({ error: "not_found" }, { status: 404 });
        } catch (error) {
          return errorResponse(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          assertSameSiteRequest();
          if (params._splat !== "pedidos") return json({ error: "not_found" }, { status: 404 });
          if (!request.headers.get("content-type")?.includes("application/json")) {
            return json({ error: "unsupported_media_type" }, { status: 415 });
          }
          const staff = await ensureStaffForUser(await requireUserId(bearerToken(request)));
          const pedido = await crearPedidoForStaff(staff, parsePedido(await request.json()));
          return json({ data: pedido }, { status: 201, headers: { vary: "authorization" } });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
