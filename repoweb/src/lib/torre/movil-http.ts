import { TorreMovilError, habilitarDesdeMovil, ingresarTorre, pendientesTorre, sesionTorre } from "@/lib/torre/movil";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function cuerpo(request: Request) {
  if (request.method === "GET") return {} as Record<string, unknown>;
  const texto = await request.text();
  if (!texto) return {} as Record<string, unknown>;
  const data = JSON.parse(texto) as unknown;
  if (!data || typeof data !== "object") throw new TorreMovilError("El cuerpo no es válido.");
  return data as Record<string, unknown>;
}

function texto(data: Record<string, unknown>, clave: string) {
  return typeof data[clave] === "string" ? data[clave] : "";
}

export async function handleTorreMovil(request: Request) {
  try {
    const ruta = new URL(request.url).pathname.replace(/^\/api\/torre\/v1\/?/, "").replace(/\/$/, "");
    const data = await cuerpo(request);
    if (request.method === "POST" && ruta === "auth/ingreso") {
      return json(await ingresarTorre(texto(data, "email"), texto(data, "password")));
    }
    const ses = await sesionTorre(request);
    if (request.method === "GET" && ruta === "pendientes") return json(await pendientesTorre());
    const habilitar = ruta.match(/^pedidos\/([^/]+)\/habilitar$/);
    if (request.method === "POST" && habilitar) {
      return json(await habilitarDesdeMovil(ses.email, decodeURIComponent(habilitar[1])));
    }
    return json({ message: "Esa ruta no existe." }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ message: "El cuerpo no es válido." }, 400);
    const status = error instanceof TorreMovilError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo completar.";
    return json({ message }, status);
  }
}
