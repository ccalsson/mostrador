import { TorreMovilError, habilitarDesdeMovil, ingresarTorre, pendientesTorre, sesionTorre } from "@/lib/torre/movil";
import { ipDe, rechazarCupo } from "@/lib/seguridad/cupo";
import { cupoFirme } from "@/lib/seguridad/cupo-db";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function cuerpo(request: Request) {
  if (request.method === "GET") return {} as Record<string, unknown>;
  const anunciado = Number(request.headers.get("content-length") ?? 0);
  if (anunciado > 16_000) throw new TorreMovilError("El envío es demasiado grande.");
  const texto = await request.text();
  if (texto.length > 16_000) throw new TorreMovilError("El envío es demasiado grande.");
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
      const golpe = await cupoFirme(`torre-ingreso:${ipDe(request)}`, 30, 15 * 60 * 1000);
      if (!golpe.ok) return rechazarCupo(golpe.reintento);
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
    if (error instanceof TorreMovilError) return json({ message: error.message }, error.status);
    return json({ message: "No se pudo completar." }, 500);
  }
}
