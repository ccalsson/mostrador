import { MercadoError, leerSesion } from "@/lib/mercado/servicio";
import * as mercado from "@/lib/mercado/servicio";

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
  if (!data || typeof data !== "object") throw new MercadoError("El cuerpo no es válido.");
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
    const data = await cuerpo(request);
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
    if (request.method === "POST" && ruta === "auth/salir") return json(await mercado.salir(request));
    if (request.method === "POST" && ruta === "auth/google") {
      const perfil = texto(data, "perfil") === "cargador" ? "cargador" : "comprador";
      const inicio = await mercado.iniciarGoogle(request, perfil, data.destino === "web");
      const respuesta = json({ url: inicio.url });
      for (const cookie of inicio.cookies) respuesta.headers.append("set-cookie", cookie);
      return respuesta;
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
    if (request.method === "GET" && ruta === "puestos") return json(await mercado.puestos());
    const productos = ruta.match(/^puestos\/([^/]+)\/productos$/);
    if (request.method === "GET" && productos) return json(await mercado.productosDe(decodeURIComponent(productos[1])));
    if (request.method === "POST" && ruta === "pedidos") {
      const items = Array.isArray(data.items) ? data.items : [];
      return json(
        await mercado.crearPedidos(
          ses,
          clave(request, data),
          items
            .filter((item): item is { tenantId: string; productoId: string; cantidad: number } => {
              if (!item || typeof item !== "object") return false;
              const row = item as Record<string, unknown>;
              return typeof row.tenantId === "string" && typeof row.productoId === "string" && typeof row.cantidad === "number";
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
    if (request.method === "POST" && ruta === "cargador/disponibilidad") {
      return json(await mercado.disponibilidad(ses, texto(data, "disponibilidad")));
    }
    return json({ message: "No existe esa ruta." }, 404);
  } catch (error) {
    if (error instanceof MercadoError) return json({ message: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ message: "El cuerpo no es válido." }, 400);
    const message = error instanceof Error ? error.message : "No se pudo completar.";
    return json({ message }, 400);
  }
}
