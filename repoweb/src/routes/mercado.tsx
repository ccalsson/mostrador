import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PuertaLegal } from "@/components/puerta-legal";

export const Route = createFileRoute("/mercado")({
  head: () => ({ meta: [{ title: "Mercado al Toque" }] }),
  component: MercadoPage,
});

const TOKEN = "mercado.token";

type Linea = {
  tenantId: string;
  tenantNombre: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  unidad: string;
};

type Pedido = {
  id: string;
  tenantNombre: string;
  estado: string;
  total: number;
  bultos: number;
  comision?: string | null;
};

type Parada = { pedidoId: string; puesto: string; estado: string; bultos: number; preparado: boolean };
type Recorrido = { id: string; estado: string; bultos: number; cargador?: string; comprador?: string; paradas: Parada[] };
type Cargador = { id: string; nombre: string; nivel: string };
type Producto = { id: string; nombre: string; precio: number; disponible: number; unidad: string; unidadLabel: string };
type Puesto = { id: string; nombre: string; tier?: string };
type Aviso = { id: string; tenantNombre: string; placement: string; currency: string; price: number; startsOn: string; endsOn: string; notes: string; contentRef: string };
type Ranking = { puesto: number; nombre: string; nivel: string; puntos: number; score: number };

async function pedir<T>(ruta: string, opts: { method?: string; token?: string; body?: unknown; clave?: string } = {}) {
  const res = await fetch(`/api/mercado/v1/${ruta}`, {
    method: opts.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.clave ? { "idempotency-key": opts.clave } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message || "No se pudo completar.");
  return data;
}

function bultosDe(lineas: Linea[]) {
  return lineas.reduce((suma, linea) => suma + (linea.unidad === "bulto" ? linea.cantidad : 0), 0);
}

function clave() {
  return crypto.randomUUID();
}

function MercadoPage() {
  const [token, setToken] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<"comprador" | "cargador">("comprador");
  const [como, setComo] = useState<"comprador" | "cargador">("comprador");
  const [alta, setAlta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pais, setPais] = useState("AR");
  const [documento, setDocumento] = useState("");
  const [identidad, setIdentidad] = useState("pendiente");
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [ranking, setRanking] = useState<Ranking[]>([]);
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [cargadores, setCargadores] = useState<Cargador[]>([]);
  const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
  const [panel, setPanel] = useState<"puestos" | "carrito" | "pedidos">("puestos");

  const bultos = useMemo(() => bultosDe(carrito), [carrito]);
  const bultosElegidos = useMemo(
    () => pedidos.filter((pedido) => elegidos.includes(pedido.id)).reduce((suma, pedido) => suma + (pedido.bultos || 0), 0),
    [pedidos, elegidos],
  );

  function entrar(nuevo: string, siguiente: "comprador" | "cargador") {
    sessionStorage.setItem(TOKEN, nuevo);
    setToken(nuevo);
    setPerfil(siguiente);
    setError(null);
  }

  function salir() {
    if (token) void pedir("auth/salir", { method: "POST", token }).catch(() => undefined);
    sessionStorage.removeItem(TOKEN);
    setToken(null);
    setCarrito([]);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desdeGoogle = params.get("token");
    const guardado = desdeGoogle || sessionStorage.getItem(TOKEN);
    if (desdeGoogle) {
      sessionStorage.setItem(TOKEN, desdeGoogle);
      window.history.replaceState({}, "", "/mercado");
    }
    if (!guardado) return;
    setToken(guardado);
    void pedir<{ perfil?: string; comprador?: { identidadEstado?: string } }>("yo", { token: guardado })
      .then((yo) => {
        const siguiente = yo.perfil === "cargador" ? "cargador" : "comprador";
        setPerfil(siguiente);
        setIdentidad(yo.comprador?.identidadEstado ?? "pendiente");
      })
      .catch(() => {
        sessionStorage.removeItem(TOKEN);
        setToken(null);
      });
  }, []);

  useEffect(() => {
    if (!token || perfil !== "comprador" || identidad === "pendiente" || identidad === "rechazada") return;
    void pedir<{ puestos: Puesto[] }>("puestos", { token }).then((data) => setPuestos(data.puestos)).catch((e: Error) => setError(e.message));
    void pedir<{ avisos: Aviso[] }>("avisos").then((data) => setAvisos(data.avisos)).catch(() => setAvisos([]));
    void pedir<{ ranking: Ranking[] }>("ranking").then((data) => setRanking(data.ranking)).catch(() => setRanking([]));
  }, [token, perfil, identidad]);

  async function correr(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setOcupado(false);
    }
  }

  async function ingresar() {
    await correr(async () => {
      const data = await pedir<{ token: string; comprador?: { identidadEstado?: string } }>("auth/ingreso", {
        method: "POST",
        body: { email, password, perfil: como },
      });
      if (data.comprador?.identidadEstado) setIdentidad(data.comprador.identidadEstado);
      entrar(data.token, como);
    });
  }

  async function registrar() {
    await correr(async () => {
      if (como === "cargador") {
        const data = await pedir<{ token: string }>("auth/registro-cargador", {
          method: "POST",
          body: { nombre, email, password, telefono },
        });
        entrar(data.token, "cargador");
        return;
      }
      const data = await pedir<{ token: string; comprador?: { identidadEstado?: string } }>("auth/registro", {
        method: "POST",
        body: {
          nombre,
          email,
          password,
          telefono,
          pais,
          tipoDocumento: pais === "PY" ? "CI_PY" : "DNI",
          numeroDocumento: documento,
        },
      });
      setIdentidad(data.comprador?.identidadEstado ?? "pendiente");
      entrar(data.token, "comprador");
    });
  }

  async function google() {
    await correr(async () => {
      const data = await pedir<{ url: string }>("auth/google", {
        method: "POST",
        body: { perfil: como, destino: "web" },
      });
      window.location.href = data.url;
    });
  }

  async function subirIdentidad(documentoArchivo: File, selfieArchivo: File) {
    await correr(async () => {
      const [documentoBase64, selfieBase64] = await Promise.all([
        archivoABase64(documentoArchivo),
        archivoABase64(selfieArchivo),
      ]);
      const data = await pedir<{ comprador?: { identidadEstado?: string } }>("identidad", {
        method: "POST",
        token: token ?? undefined,
        body: {
          pais,
          tipoDocumento: pais === "PY" ? "CI_PY" : "DNI",
          numeroDocumento: documento,
          documentoBase64,
          selfieBase64,
        },
      });
      setIdentidad(data.comprador?.identidadEstado ?? "documentacion_cargada");
    });
  }

  async function abrirPuesto(item: Puesto) {
    if (!token) return;
    setPuesto(item);
    setProductos([]);
    const data = await pedir<{ productos: Producto[] }>(`puestos/${item.id}/productos`, { token });
    setProductos(data.productos);
  }

  function sumar(producto: Producto) {
    if (!puesto) return;
    setCarrito((actual) => {
      const previa = actual.find((linea) => linea.tenantId === puesto.id && linea.productoId === producto.id);
      if (previa) {
        return actual.map((linea) =>
          linea === previa ? { ...linea, cantidad: linea.cantidad + 1 } : linea,
        );
      }
      return [
        ...actual,
        {
          tenantId: puesto.id,
          tenantNombre: puesto.nombre,
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          precio: producto.precio,
          unidad: producto.unidad,
        },
      ];
    });
  }

  async function confirmar() {
    if (!token) return;
    await correr(async () => {
      await pedir("pedidos", {
        method: "POST",
        token,
        clave: clave(),
        body: {
          medioPago: "efectivo",
          items: carrito.map((linea) => ({
            tenantId: linea.tenantId,
            productoId: linea.productoId,
            cantidad: linea.cantidad,
          })),
        },
      });
      setCarrito([]);
      setPanel("pedidos");
      await cargarPedidos();
    });
  }

  async function cargarPedidos() {
    if (!token) return;
    const data = await pedir<{ pedidos: Pedido[]; recorridos: Recorrido[] }>("pedidos", { token });
    setPedidos(data.pedidos);
    const rutas = await pedir<{ recorridos: Recorrido[] }>("recorridos", { token });
    setRecorridos(rutas.recorridos);
    const lista = await pedir<{ cargadores: Cargador[] }>("cargadores", { token });
    setCargadores(lista.cargadores);
  }

  async function elegir(cargadorId: string) {
    if (!token || elegidos.length === 0) return;
    await correr(async () => {
      await pedir("recorridos", {
        method: "POST",
        token,
        clave: clave(),
        body: { cargadorId, pedidoIds: elegidos },
      });
      setElegidos([]);
      await cargarPedidos();
    });
  }

  async function calificar(recorridoId: string, estrellas: number) {
    if (!token) return;
    await correr(async () => {
      await pedir(`recorridos/${recorridoId}/calificar`, {
        method: "POST",
        token,
        body: { estrellas, comentario: "" },
      });
    });
  }

  async function cargarRecorridos() {
    if (!token) return;
    const data = await pedir<{ recorridos: Recorrido[] }>("recorridos", { token });
    setRecorridos(data.recorridos);
  }

  async function disponibilidad(valor: string) {
    if (!token) return;
    await correr(async () => {
      await pedir("cargador/disponibilidad", { method: "POST", token, body: { disponibilidad: valor } });
    });
  }

  async function accion(recorridoId: string, nombreAccion: string, pedidoId?: string) {
    if (!token) return;
    await correr(async () => {
      await pedir(`recorridos/${recorridoId}/${nombreAccion}`, {
        method: "POST",
        token,
        clave: clave(),
        body: pedidoId ? { pedidoId } : {},
      });
      await cargarRecorridos();
    });
  }

  if (!token) {
    return (
      <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-8 text-ink">
        <p className="font-display text-3xl">Mercado al Toque</p>
        <p className="mt-1 text-sm text-muted">Comprá en los puestos o entrá como cargador.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant={como === "comprador" ? "primary" : "secondary"} onClick={() => setComo("comprador")}>
            Comprador
          </Button>
          <Button variant={como === "cargador" ? "primary" : "secondary"} onClick={() => setComo("cargador")}>
            Cargador
          </Button>
        </div>
        <form
          className="mt-4 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            void (alta ? registrar() : ingresar());
          }}
        >
          {alta ? <Campo label="Nombre" value={nombre} onChange={setNombre} /> : null}
          <Campo label="Email" value={email} onChange={setEmail} type="email" />
          <Campo label="Clave" value={password} onChange={setPassword} type="password" />
          {alta ? <Campo label="Teléfono" value={telefono} onChange={setTelefono} /> : null}
          {alta && como === "comprador" ? (
            <>
              <label className="block text-sm">
                País
                <select className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3" value={pais} onChange={(ev) => setPais(ev.target.value)}>
                  <option value="AR">Argentina</option>
                  <option value="PY">Paraguay</option>
                </select>
              </label>
              <Campo label={pais === "PY" ? "Cédula" : "DNI"} value={documento} onChange={setDocumento} />
            </>
          ) : null}
          {error ? <p className="text-sm text-terra">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={ocupado}>
            {alta ? "Crear cuenta" : "Entrar"}
          </Button>
        </form>
        <button type="button" className="mt-3 text-sm text-leaf" onClick={() => setAlta((v) => !v)}>
          {alta ? "Ya tengo cuenta" : "Crear cuenta"}
        </button>
        <Button variant="secondary" className="mt-4 w-full" disabled={ocupado} onClick={() => void google()}>
          Continuar con Google
        </Button>
        <p className="mt-6 text-center text-sm">
          <a href="/login" className="text-muted">
            Volver al puesto
          </a>
        </p>
      </main>
    );
  }

  if (perfil === "cargador") {
    return (
      <PuertaLegal token={token}>
      <Marco titulo="Cargador" onSalir={salir} onCargar={() => void cargarRecorridos()}>
        {error ? <p className="text-sm text-terra">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={ocupado} onClick={() => void disponibilidad("disponible")}>
            Disponible
          </Button>
          <Button variant="secondary" disabled={ocupado} onClick={() => void disponibilidad("no_disponible")}>
            No disponible
          </Button>
        </div>
        <ListaRecorridos recorridos={recorridos} cargador ocupado={ocupado} onAccion={accion} onCalificar={calificar} />
      </Marco>
      </PuertaLegal>
    );
  }

  if (identidad === "pendiente" || identidad === "rechazada") {
    return (
      <PuertaLegal token={token}>
      <Marco titulo="Documentación" onSalir={salir}>
        <p className="text-sm text-muted">Cargá el documento y una selfie. Eso no los marca como verificados.</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            const form = ev.currentTarget;
            const doc = (form.elements.namedItem("doc") as HTMLInputElement).files?.[0];
            const selfie = (form.elements.namedItem("selfie") as HTMLInputElement).files?.[0];
            if (!doc || !selfie) return;
            void subirIdentidad(doc, selfie);
          }}
        >
          <Campo label={pais === "PY" ? "Cédula" : "DNI"} value={documento} onChange={setDocumento} />
          <label className="block text-sm">
            Foto del documento
            <input name="doc" type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-sm" required />
          </label>
          <label className="block text-sm">
            Selfie
            <input name="selfie" type="file" accept="image/*" capture="user" className="mt-1 block w-full text-sm" required />
          </label>
          {error ? <p className="text-sm text-terra">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={ocupado}>
            Guardar
          </Button>
        </form>
      </Marco>
      </PuertaLegal>
    );
  }

  return (
    <PuertaLegal token={token}>
    <Marco titulo="Mercado al Toque" onSalir={salir}>
      <div className="grid grid-cols-3 gap-2">
        <Button variant={panel === "puestos" ? "primary" : "secondary"} onClick={() => setPanel("puestos")}>
          Puestos
        </Button>
        <Button variant={panel === "carrito" ? "primary" : "secondary"} onClick={() => setPanel("carrito")}>
          Carrito
        </Button>
        <Button
          variant={panel === "pedidos" ? "primary" : "secondary"}
          onClick={() => {
            setPanel("pedidos");
            void cargarPedidos();
          }}
        >
          Pedidos
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
      {panel === "puestos" ? (
        <div className="mt-4 space-y-3">
          {puestos.length === 0 ? <p className="text-sm text-muted">Ningún puesto está publicado en Mercado al Toque.</p> : null}
          {avisos.map((aviso) => (
            <article key={aviso.id} className="rounded-md border border-line bg-surface px-3 py-2 text-sm">
              <p className="font-medium">{aviso.tenantNombre}</p>
              <p className="text-muted">{aviso.placement} · {aviso.startsOn} → {aviso.endsOn} · {aviso.currency} {aviso.price}</p>
              {aviso.contentRef ? <p className="text-muted">{aviso.contentRef}</p> : null}
              {aviso.notes ? <p>{aviso.notes}</p> : null}
            </article>
          ))}
          {puestos.map((item) => (
            <button key={item.id} type="button" className="block w-full rounded-md border border-line bg-surface px-3 py-3 text-left" onClick={() => void abrirPuesto(item)}>
              {item.nombre}
              {item.tier ? <span className="ml-2 text-xs text-muted">{item.tier}</span> : null}
            </button>
          ))}
          {puesto ? (
            <div className="space-y-2">
              {productos.map((producto) => (
                <div key={producto.id} className="flex items-center justify-between gap-2 border-t border-line py-2">
                  <div>
                    <p>{producto.nombre}</p>
                    <p className="text-sm text-muted">
                      ${producto.precio} · {producto.unidadLabel} · hay {producto.disponible}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => sumar(producto)}>
                    Sumar
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {panel === "carrito" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">{bultos} bultos en {new Set(carrito.map((linea) => linea.tenantNombre)).size || 0} puestos. Los kilos no se cuentan.</p>
          {carrito.map((linea) => (
            <p key={`${linea.tenantId}-${linea.productoId}`}>
              {linea.tenantNombre}: {linea.cantidad} {linea.unidad === "bulto" ? "bultos" : linea.unidad} de {linea.nombre}
            </p>
          ))}
          <Button className="w-full" disabled={ocupado || carrito.length === 0} onClick={() => void confirmar()}>
            Confirmar pedidos
          </Button>
        </div>
      ) : null}
      {panel === "pedidos" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">{elegidos.length ? `${bultosElegidos} bultos en los pedidos elegidos.` : "Elegí los pedidos y después un cargador."}</p>
          {pedidos.map((pedido) => (
            <label key={pedido.id} className="flex items-start gap-2 rounded-md border border-line px-3 py-2">
              <input
                type="checkbox"
                checked={elegidos.includes(pedido.id)}
                onChange={(ev) =>
                  setElegidos((actual) =>
                    ev.target.checked ? [...actual, pedido.id] : actual.filter((id) => id !== pedido.id),
                  )
                }
              />
              <span>
                {pedido.tenantNombre}
                <span className="block text-sm text-muted">
                  {pedido.bultos} bultos · {pedido.estado} · ${pedido.total}
                  {pedido.comision ? <span className="block">{pedido.comision}</span> : null}
                </span>
              </span>
            </label>
          ))}
          {cargadores.map((cargador) => (
            <Button key={cargador.id} variant="secondary" className="w-full" disabled={ocupado || elegidos.length === 0} onClick={() => void elegir(cargador.id)}>
              Elegir a {cargador.nombre} · {cargador.nivel}
            </Button>
          ))}
          <ListaRecorridos recorridos={recorridos} ocupado={ocupado} onAccion={accion} onCalificar={calificar} />
          {ranking.length > 0 ? (
            <div className="pt-2">
              <p className="text-sm font-medium">Ranking de cargadores</p>
              <ul className="mt-1 text-sm text-muted">
                {ranking.map((item) => (
                  <li key={`${item.puesto}-${item.nombre}`}>{item.puesto}. {item.nombre} · {item.nivel} · {item.puntos} pts · score {item.score}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Marco>
    </PuertaLegal>
  );
}

function Campo({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <Input className="mt-1" type={type} value={value} onChange={(ev) => onChange(ev.target.value)} required />
    </label>
  );
}

function Marco({ titulo, onSalir, onCargar, children }: { titulo: string; onSalir: () => void; onCargar?: () => void; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-6 text-ink">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl">{titulo}</h1>
        <div className="flex gap-2">
          {onCargar ? (
            <Button variant="ghost" size="sm" onClick={onCargar}>
              Actualizar
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onSalir}>
            Salir
          </Button>
        </div>
      </div>
      {children}
    </main>
  );
}

function ListaRecorridos({
  recorridos,
  cargador = false,
  ocupado,
  onAccion,
  onCalificar,
}: {
  recorridos: Recorrido[];
  cargador?: boolean;
  ocupado: boolean;
  onAccion: (id: string, accion: string, pedidoId?: string) => Promise<void>;
  onCalificar: (id: string, estrellas: number) => Promise<void>;
}) {
  if (recorridos.length === 0) return null;
  return (
    <div className="space-y-3">
      {recorridos.map((recorrido) => (
        <section key={recorrido.id} className="rounded-md border border-line p-3">
          <p className="font-medium">{recorrido.bultos} bultos</p>
          <p className="text-sm text-muted">{cargador ? recorrido.comprador : recorrido.cargador} · {recorrido.estado}</p>
          {(recorrido.paradas ?? []).map((parada) => (
            <div key={parada.pedidoId} className="mt-2 border-t border-line pt-2">
              <p>
                {parada.puesto}: {parada.bultos} bultos · {parada.estado}
              </p>
              {cargador && parada.estado === "aceptado" ? (
                <Button size="sm" className="mt-1" disabled={ocupado || !parada.preparado} onClick={() => void onAccion(recorrido.id, "retirar", parada.pedidoId)}>
                  Retiré este puesto
                </Button>
              ) : null}
              {cargador && parada.estado === "retirado" ? (
                <Button size="sm" className="mt-1" disabled={ocupado} onClick={() => void onAccion(recorrido.id, "entregar", parada.pedidoId)}>
                  Entregué este puesto
                </Button>
              ) : null}
            </div>
          ))}
          {cargador && recorrido.estado === "asignado" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="sm" disabled={ocupado} onClick={() => void onAccion(recorrido.id, "aceptar")}>
                Aceptar
              </Button>
              <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void onAccion(recorrido.id, "rechazar")}>
                Rechazar
              </Button>
            </div>
          ) : null}
          {!cargador && recorrido.estado === "entregado" ? (
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((estrella) => (
                <Button key={estrella} size="sm" variant="secondary" disabled={ocupado} onClick={() => void onCalificar(recorrido.id, estrella)}>
                  {estrella}
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function archivoABase64(archivo: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const texto = String(reader.result ?? "");
      resolve(texto.slice(texto.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("No se pudo leer la foto."));
    reader.readAsDataURL(archivo);
  });
}
