import { MercadoError, leerSesion } from "@/lib/mercado/servicio";
import * as mercado from "@/lib/mercado/servicio";
import { confirmarToken, reenviarSiPendiente } from "@/lib/seguridad/confirmar";
import { correoAceptable } from "@/lib/seguridad/correo";
import { ipDe, rechazarCupo } from "@/lib/seguridad/cupo";
import { cupoFirme } from "@/lib/seguridad/cupo-db";
import { verificarTurnstile } from "@/lib/seguridad/turnstile";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function cuerpo(request: Request, tope: number) {
  if (request.method === "GET") return {} as Record<string, unknown>;
  const anunciado = Number(request.headers.get("content-length") ?? 0);
  if (anunciado > tope) throw new MercadoError("El envío es demasiado grande.", 413);
  const texto = await request.text();
  if (texto.length > tope) throw new MercadoError("El envío es demasiado grande.", 413);
  if (!texto) return {} as Record<string, unknown>;
  const data = JSON.parse(texto) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new MercadoError("El cuerpo no es válido.");
  return data as Record<string, unknown>;
}

function texto(data: Record<string, unknown>, clave: string) {
  return typeof data[clave] === "string" ? data[clave] : "";
}

function clave(request: Request, data: Record<string, unknown>) {
  return request.headers.get("idempotency-key") || texto(data, "idempotencyKey");
}

export async function handleMercado(request: Request) {
  try {
    const ruta = new URL(request.url).pathname.replace(/^\/api\/mercado\/v1\/?/, "").replace(/\/$/, "");
    const ip = ipDe(request);
    const publico = request.method === "GET" && (ruta === "ranking" || ruta === "avisos" || ruta.startsWith("puestos"));
    const registro = request.method === "POST" && (ruta === "auth/registro" || ruta === "auth/registro-cargador");
    const ingreso = request.method === "POST" && ruta === "auth/ingreso";
    const golpe = await cupoFirme(
      `${registro ? "registro" : ingreso ? "ingreso" : publico ? "lectura" : "uso"}:${ip}`,
      registro ? 80 : ingreso ? 40 : publico ? 600 : 120,
      registro ? 60 * 60 * 1000 : ingreso ? 15 * 60 * 1000 : 60 * 1000,
    );
    if (!golpe.ok) return rechazarCupo(golpe.reintento);
    const tope = ruta.includes("comprobante") || ruta === "identidad" || ruta === "cargador/perfil" ? 1_500_000 : 24_000;
    const data = await cuerpo(request, tope);
    if (request.method === "POST" && (ruta === "auth/registro" || ruta === "auth/registro-cargador") && texto(data, "website")) {
      return json({ pendiente: true, aviso: "Si el correo es válido, te llega un enlace para confirmarlo." }, 201);
    }
    if (registro) {
      const humano = await verificarTurnstile(texto(data, "captcha"), ip);
      if (!humano.ok) return json({ message: humano.motivo }, 400);
    }
    if (request.method === "POST" && ruta === "auth/registro") {
      return json(
        await mercado.registrarComprador({
          nombre: texto(data, "nombre"),
          email: texto(data, "email"),
          password: texto(data, "password"),
          telefono: texto(data, "telefono"),
          pais: texto(data, "pais"),
          tipoDocumento: texto(data, "tipoDocumento"),
          numeroDocumento: texto(data, "numeroDocumento"),
        }),
        201,
      );
    }
    if (request.method === "POST" && ruta === "auth/registro-cargador") {
      return json(
        await mercado.registrarCargador({
          nombre: texto(data, "nombre"),
          email: texto(data, "email"),
          password: texto(data, "password"),
          telefono: texto(data, "telefono"),
        }),
        201,
      );
    }
    if (request.method === "POST" && ruta === "auth/ingreso") {
      const perfil = texto(data, "perfil") === "cargador" ? "cargador" : "comprador";
      return json(await mercado.ingresar(texto(data, "email"), texto(data, "password"), perfil));
    }
    if (request.method === "POST" && ruta === "auth/confirmar") {
      return json(await confirmarToken(texto(data, "token")));
    }
    if (request.method === "POST" && ruta === "auth/reenviar") {
      const correo = correoAceptable(texto(data, "email"));
      if (correo.ok) await reenviarSiPendiente(correo.email).catch(() => undefined);
      return json({ aviso: "Si ese correo está pendiente, le llega otro enlace." });
    }
    if (request.method === "POST" && ruta === "auth/salir") return json(await mercado.salir(request));
    if (request.method === "POST" && ruta === "auth/google") {
      const perfil = texto(data, "perfil") === "cargador" ? "cargador" : "comprador";
      const inicio = await mercado.iniciarGoogle(request, perfil, data.destino === "web");
      const respuesta = json({ url: inicio.url });
      for (const cookie of inicio.cookies) respuesta.headers.append("set-cookie", cookie);
      return respuesta;
    }
    if (request.method === "GET" && ruta === "auth/google/ir") {
      const perfil = new URL(request.url).searchParams.get("perfil") === "cargador" ? "cargador" : "comprador";
      const inicio = await mercado.iniciarGoogle(request, perfil, false);
      const headers = new Headers({ location: inicio.url });
      for (const cookie of inicio.cookies) headers.append("set-cookie", cookie);
      return new Response(null, { status: 302, headers });
    }
    if (request.method === "GET" && ruta === "auth/google/vuelta") return mercado.volverDeGoogle(request);
    if (request.method === "GET" && ruta === "ranking") return json(await mercado.ranking());
    if (request.method === "GET" && ruta === "avisos") return json(await mercado.avisos());

    const ses = await leerSesion(request);
    if (request.method === "GET" && ruta === "yo") return json(await mercado.yo(ses));
    if (request.method === "POST" && ruta === "identidad") {
      return json(
        await mercado.cargarIdentidad(ses, {
          pais: texto(data, "pais"),
          tipoDocumento: texto(data, "tipoDocumento"),
          numeroDocumento: texto(data, "numeroDocumento"),
          documentoBase64: texto(data, "documentoBase64"),
          selfieBase64: texto(data, "selfieBase64"),
        }),
      );
    }
    if (request.method === "GET" && ruta === "puestos") return json(await mercado.puestos(ses.userId));
    const productos = ruta.match(/^puestos\/([^/]+)\/productos$/);
    if (request.method === "GET" && productos) return json(await mercado.productosDe(decodeURIComponent(productos[1])));
    if (request.method === "POST" && ruta === "pedidos") {
      const items = Array.isArray(data.items) ? data.items.slice(0, 30) : [];
      return json(
        await mercado.crearPedidos(
          ses,
          clave(request, data),
          items
            .filter((item): item is { tenantId: string; productoId: string; cantidad: number } => {
              if (!item || typeof item !== "object") return false;
              const row = item as Record<string, unknown>;
              return (
                typeof row.tenantId === "string" &&
                typeof row.productoId === "string" &&
                typeof row.cantidad === "number" &&
                Number.isFinite(row.cantidad) &&
                row.cantidad > 0 &&
                row.cantidad <= 500
              );
            })
            .map((item) => ({ tenantId: item.tenantId, productoId: item.productoId, cantidad: item.cantidad })),
          texto(data, "medioPago"),
          texto(data, "nota"),
        ),
        201,
      );
    }
    if (request.method === "GET" && ruta === "pedidos") return json(await mercado.pedidosDe(ses));
    const pedido = ruta.match(/^pedidos\/([^/]+)$/);
    if (request.method === "GET" && pedido) return json(await mercado.pedidoDe(ses, decodeURIComponent(pedido[1])));
    const cancelar = ruta.match(/^pedidos\/([^/]+)\/cancelar$/);
    if (request.method === "POST" && cancelar) {
      return json(await mercado.cancelarPedido(ses, decodeURIComponent(cancelar[1])));
    }
    const comprobante = ruta.match(/^pedidos\/([^/]+)\/comprobante$/);
    if (request.method === "POST" && comprobante) {
      return json(
        await mercado.adjuntarComprobante(
          ses,
          decodeURIComponent(comprobante[1]),
          texto(data, "nombre"),
          texto(data, "data").slice(0, 1_400_000),
        ),
      );
    }
    if (request.method === "GET" && ruta === "cargadores") return json(await mercado.cargadoresDisponibles());
    if (request.method === "POST" && ruta === "recorridos") {
      const pedidoIds = Array.isArray(data.pedidoIds) ? data.pedidoIds.filter((id): id is string => typeof id === "string") : [];
      return json(await mercado.elegirCargador(ses, clave(request, data), texto(data, "cargadorId"), pedidoIds), 201);
    }
    if (request.method === "GET" && ruta === "recorridos") return json(await mercado.recorridosDe(ses));
    const aceptar = ruta.match(/^recorridos\/([^/]+)\/aceptar$/);
    if (request.method === "POST" && aceptar) {
      return json(await mercado.aceptarRecorrido(ses, clave(request, data), decodeURIComponent(aceptar[1])));
    }
    const retirar = ruta.match(/^recorridos\/([^/]+)\/retirar$/);
    if (request.method === "POST" && retirar) {
      return json(
        await mercado.marcarParada(ses, clave(request, data), decodeURIComponent(retirar[1]), texto(data, "pedidoId"), "retirado"),
      );
    }
    const entregar = ruta.match(/^recorridos\/([^/]+)\/entregar$/);
    if (request.method === "POST" && entregar) {
      return json(
        await mercado.marcarParada(ses, clave(request, data), decodeURIComponent(entregar[1]), texto(data, "pedidoId"), "entregado"),
      );
    }
    const rechazar = ruta.match(/^recorridos\/([^/]+)\/rechazar$/);
    if (request.method === "POST" && rechazar) {
      return json(await mercado.rechazarRecorrido(ses, clave(request, data), decodeURIComponent(rechazar[1])));
    }
    const calificar = ruta.match(/^recorridos\/([^/]+)\/calificar$/);
    if (request.method === "POST" && calificar) {
      return json(
        await mercado.calificar(
          ses,
          decodeURIComponent(calificar[1]),
          typeof data.estrellas === "number" ? data.estrellas : 0,
          texto(data, "comentario"),
        ),
      );
    }
    if (request.method === "POST" && ruta === "cargador/perfil") {
      return json(
        await mercado.guardarPerfilCargador(ses, {
          nombre: texto(data, "nombre"),
          telefono: texto(data, "telefono"),
          foto: texto(data, "foto") || null,
        }),
      );
    }
    const calificarComprador = ruta.match(/^recorridos\/([^/]+)\/calificar-comprador$/);
    if (request.method === "POST" && calificarComprador) {
      return json(
        await mercado.calificarComprador(
          ses,
          decodeURIComponent(calificarComprador[1]),
          typeof data.estrellas === "number" ? data.estrellas : 0,
          texto(data, "comentario"),
        ),
      );
    }
    const calificarPuesto = ruta.match(/^pedidos\/([^/]+)\/calificar-puesto$/);
    if (request.method === "POST" && calificarPuesto) {
      return json(
        await mercado.calificarPuesto(
          ses,
          decodeURIComponent(calificarPuesto[1]),
          typeof data.estrellas === "number" ? data.estrellas : 0,
          texto(data, "comentario"),
        ),
      );
    }
    if (request.method === "POST" && ruta === "cargador/disponibilidad") {
      return json(await mercado.disponibilidad(ses, texto(data, "disponibilidad")));
    }
    return json({ message: "No existe esa ruta." }, 404);
  } catch (error) {
    if (error instanceof MercadoError) return json({ message: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ message: "El cuerpo no es válido." }, 400);
    return json({ message: "No se pudo completar." }, 500);
  }
}
