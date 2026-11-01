import { TorreMovilError, habilitarDesdeMovil, ingresarTorre, pendientesTorre, sesionTorre } from "@/lib/torre/movil";
import { registroMovil } from "@/lib/torre/movil-registro";
import { ipDe, rechazarCupo } from "@/lib/seguridad/cupo";
import { cupoFirme } from "@/lib/seguridad/cupo-db";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function cuerpo(request: Request, maximo = 16_000): Promise<unknown> {
  if (request.method === "GET") return {};
  const anunciado = Number(request.headers.get("content-length") ?? 0);
  if (anunciado > maximo) throw new TorreMovilError("El envío es demasiado grande.");
  const texto = await request.text();
  if (texto.length > maximo) throw new TorreMovilError("El envío es demasiado grande.");
  if (!texto) return {};
  return JSON.parse(texto);
}

function texto(data: unknown, clave: string) {
  if (!data || typeof data !== "object") return "";
  const valor = (data as Record<string, unknown>)[clave];
  return typeof valor === "string" ? valor : "";
}

export async function handleTorreMovil(request: Request) {
  try {
    const ruta = new URL(request.url).pathname.replace(/^\/api\/torre\/v1\/?/, "").replace(/\/$/, "");
    const data = await cuerpo(request, ruta.startsWith("fn/") ? 512_000 : 16_000);
    if (request.method === "POST" && ruta === "auth/ingreso") {
      const golpe = await cupoFirme(`torre-ingreso:${ipDe(request)}`, 30, 15 * 60 * 1000);
      if (!golpe.ok) return rechazarCupo(golpe.reintento);
      return json(await ingresarTorre(texto(data, "email"), texto(data, "password")));
    }
    const ses = await sesionTorre(request);
    if (request.method === "GET" && ruta === "auth/yo") return json({ email: ses.email, role: ses.role });
    if (request.method === "GET" && ruta === "pendientes") return json(await pendientesTorre());
    const habilitar = ruta.match(/^pedidos\/([^/]+)\/habilitar$/);
    if (request.method === "POST" && habilitar) {
      return json(await habilitarDesdeMovil(ses.email, decodeURIComponent(habilitar[1])));
    }
    const llamada = ruta.match(/^fn\/([A-Za-z0-9_]+)$/);
    if (request.method === "POST" && llamada) {
      const fn = registroMovil[llamada[1]];
      if (!fn) throw new TorreMovilError("Esa función no está publicada para el teléfono.", 404);
      try {
        return json(await fn(ses.email, data));
      } catch (error) {
        if (error instanceof TorreMovilError) throw error;
        const message = error instanceof Error ? error.message : "No se pudo completar.";
        const status = message === "Forbidden" || message.includes("permiso") ? 403 : 400;
        throw new TorreMovilError(message, status);
      }
    }
    return json({ message: "Esa ruta no existe." }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ message: "El cuerpo no es válido." }, 400);
    if (error instanceof TorreMovilError) return json({ message: error.message }, error.status);
    return json({ message: "No se pudo completar." }, 500);
  }
}
