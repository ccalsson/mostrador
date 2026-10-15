import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { Captcha } from "@/components/captcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PuertaLegal } from "@/components/puerta-legal";
import { money } from "@/lib/money";
import { habilitaCargador } from "@/lib/mercado/reglas";
import {
  cuerpoCheckout,
  esFalloAmbiguo,
  firmaCheckout,
  notaDePedido,
  resolverCheckout,
  type CheckoutPendiente,
} from "@/lib/mercado/checkout-cliente";

export const Route = createFileRoute("/mercado")({
  head: () => ({ meta: [{ title: "Mercado al Toque" }] }),
  component: MercadoPage,
});

const TOKEN = "mercado.token";
const CHECKOUT = "mercado.checkout";

type Linea = {
  tenantId: string;
  tenantNombre: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  unidad: string;
  unidadLabel?: string;
};

type Pedido = {
  id: string;
  tenantNombre: string;
  estado: string;
  total: number;
  bultos: number;
  pagoEstado?: string;
  formaPago?: string | null;
  nota?: string | null;
  tieneComprobante?: boolean;
  tieneCargador?: boolean;
  creadoEn?: string;
  hitos?: Record<string, string | null>;
  tiempos?: { preparacion: number | null; espera: number | null; entrega: number | null; total: number | null };
  items?: { nombre: string; cantidad: number; precio: number; unidad: string }[];
};

type Parada = {
  pedidoId: string;
  puesto: string;
  estado: string;
  bultos: number;
  preparado: boolean;
  items?: { nombre: string; cantidad: number; unidad: string }[];
};
type Recorrido = {
  id: string;
  estado: string;
  bultos: number;
  cargador?: string;
  comprador?: string;
  telefono?: string | null;
  creadoEn?: string;
  paradas: Parada[];
};
type Cargador = {
  id: string;
  nombre: string;
  nivel: string;
  puntos?: number;
  score?: number;
  recorridosCompletados?: number;
  calificacion?: number | null;
};
type FichaCargador = {
  nombre: string;
  telefono: string | null;
  disponibilidad: string;
  puntos: number;
  nivel: string;
  score: number;
  recorridosAceptados: number;
  recorridosCompletados: number;
  cancelaciones: number;
  entregasATiempo: number;
  entregasDemoradas: number;
  calificacion: number | null;
  calificaciones: number;
};
type FichaComprador = {
  nombre: string;
  telefono: string | null;
  pais: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  identidadEstado?: string;
};
type Producto = { id: string; nombre: string; precio: number; disponible: number; unidad: string; unidadLabel: string };
type Puesto = { id: string; nombre: string; bajada?: string | null; tier?: string; cuentaCorriente?: boolean };
type Aviso = {
  id: string;
  tenantNombre: string;
  plantilla: string;
  titulo: string;
  detalle: string;
  precio: number | null;
  unidadLabel: string | null;
  endsOn: string;
};
type Ranking = { puesto: number; nombre: string; nivel: string; puntos: number; score: number };

async function pedir<T>(ruta: string, opts: { method?: string; token?: string; body?: unknown; clave?: string } = {}) {
  let res: Response;
  try {
    res = await fetch(`/api/mercado/v1/${ruta}`, {
      method: opts.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(opts.body ? { "content-type": "application/json" } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.clave ? { "idempotency-key": opts.clave } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ErrorMercado("No hubo respuesta del servidor.", null);
  }
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new ErrorMercado(data.message || "No se pudo completar.", res.status);
  return data;
}

class ErrorMercado extends Error {
  status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

function leerCheckout(): CheckoutPendiente | null {
  try {
    const crudo = sessionStorage.getItem(CHECKOUT);
    if (!crudo) return null;
    const data = JSON.parse(crudo) as CheckoutPendiente;
    if (!data?.clave || !data.cuerpo || !Array.isArray(data.cuerpo.items)) return null;
    if (data.cuerpo.medioPago !== "efectivo" && data.cuerpo.medioPago !== "transferencia" && data.cuerpo.medioPago !== "cuenta_corriente") return null;
    return data;
  } catch {
    return null;
  }
}

function bultosDe(lineas: Linea[]) {
  return lineas.reduce((suma, linea) => suma + (linea.unidad === "bulto" ? linea.cantidad : 0), 0);
}

function clave() {
  return crypto.randomUUID();
}

function hora(iso: string | null | undefined) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ESTADOS: Record<string, string> = {
  confirmado: "Confirmado",
  en_preparacion: "En preparación",
  preparado: "Preparado",
  retirado: "Retirado",
  entregado: "Entregado",
  cancelado: "Cancelado",
  asignado: "Asignado",
  aceptado: "Aceptado",
};

function etiqueta(estado: string) {
  return ESTADOS[estado] ?? estado;
}

function pedidoSigue(estado: string) {
  return estado !== "entregado" && estado !== "cancelado";
}

function motivoCargador(pedido: Pedido) {
  if (habilitaCargador(pedido.formaPago ?? null, pedido.pagoEstado ?? null)) return null;
  if (pedido.formaPago === "efectivo") return "El retiro queda inhabilitado hasta que pagues en caja.";
  if (pedido.formaPago === "cuenta_corriente") return "La cuenta corriente todavía no habilita el cargador.";
  if (!pedido.tieneComprobante) return "Falta el comprobante. Cargalo al pagar.";
  return "Caja o el puesto todavía no cobraron. Ahí se habilita el cargador.";
}

function pagoLegible(forma: string | null | undefined) {
  if (forma === "transferencia") return "Transferencia";
  if (forma === "cuenta_corriente") return "Cuenta corriente";
  if (forma === "efectivo") return "Contado";
  return null;
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
  const [website, setWebsite] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pais, setPais] = useState("AR");
  const [documento, setDocumento] = useState("");
  const [identidad, setIdentidad] = useState("pendiente");
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [ranking, setRanking] = useState<Ranking[]>([]);
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busca, setBusca] = useState("");
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [cargadores, setCargadores] = useState<Cargador[]>([]);
  const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
  const [panel, setPanel] = useState<"puestos" | "carrito" | "pedidos" | "perfil">("puestos");
  const [medioPago, setMedioPago] = useState<"efectivo" | "transferencia" | "cuenta_corriente">("efectivo");
  const [nota, setNota] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const comprobanteRef = useRef<HTMLInputElement>(null);
  const [pendiente, setPendiente] = useState<CheckoutPendiente | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Pedido | null>(null);
  const [calificados, setCalificados] = useState<Record<string, number>>({});
  const [ficha, setFicha] = useState<FichaComprador | null>(null);
  const [yoCargador, setYoCargador] = useState<FichaCargador | null>(null);
  const [puestoInicial, setPuestoInicial] = useState<string | null>(null);

  const bultos = useMemo(() => bultosDe(carrito), [carrito]);
  const puestosEnCarrito = useMemo(() => {
    const mapa = new Map<string, Linea[]>();
    for (const linea of carrito) {
      const lista = mapa.get(linea.tenantNombre) ?? [];
      lista.push(linea);
      mapa.set(linea.tenantNombre, lista);
    }
    return [...mapa.entries()];
  }, [carrito]);
  const cuerpoVisible = useMemo(() => cuerpoCheckout(carrito, medioPago, nota), [carrito, medioPago, nota]);
  const reintentoMismo = Boolean(pendiente && firmaCheckout(pendiente.cuerpo) === firmaCheckout(cuerpoVisible));
  const bultosElegidos = useMemo(
    () => pedidos.filter((pedido) => elegidos.includes(pedido.id)).reduce((suma, pedido) => suma + (pedido.bultos || 0), 0),
    [pedidos, elegidos],
  );

  const vuelo = useRef(false);
  const pedidosRef = useRef(pedidos);
  const abiertoRef = useRef(abierto);
  pedidosRef.current = pedidos;
  abiertoRef.current = abierto;

  function entrar(nuevo: string, siguiente: "comprador" | "cargador") {
    sessionStorage.setItem(TOKEN, nuevo);
    setToken(nuevo);
    setPerfil(siguiente);
    setError(null);
  }

  function salir() {
    if (token) void pedir("auth/salir", { method: "POST", token }).catch(() => undefined);
    sessionStorage.removeItem(TOKEN);
    sessionStorage.removeItem(CHECKOUT);
    setToken(null);
    setCarrito([]);
    setPendiente(null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desdeGoogle = params.get("token");
    const puestoQuery = params.get("puesto");
    if (puestoQuery) setPuestoInicial(puestoQuery);
    const guardado = desdeGoogle || sessionStorage.getItem(TOKEN);
    if (desdeGoogle) {
      sessionStorage.setItem(TOKEN, desdeGoogle);
      window.history.replaceState({}, "", puestoQuery ? `/mercado?puesto=${puestoQuery}` : "/mercado");
    }
    if (!guardado) return;
    setToken(guardado);
    setPendiente(leerCheckout());
    void pedir<{ perfil?: string; comprador?: FichaComprador; cargador?: FichaCargador }>("yo", { token: guardado })
      .then((yo) => {
        const siguiente = yo.perfil === "cargador" ? "cargador" : "comprador";
        setPerfil(siguiente);
        setIdentidad(yo.comprador?.identidadEstado ?? "pendiente");
        if (yo.comprador) setFicha(yo.comprador);
        if (yo.cargador) setYoCargador(yo.cargador);
      })
      .catch(() => {
        sessionStorage.removeItem(TOKEN);
        setToken(null);
      });
  }, []);

  useEffect(() => {
    if (!token || perfil !== "cargador") return;
    void cargarRecorridos();
  }, [token, perfil]);

  useEffect(() => {
    if (!token || perfil !== "comprador" || identidad === "pendiente" || identidad === "rechazada" || panel !== "puestos") return;
    void pedir<{ puestos: Puesto[] }>("puestos", { token }).then((data) => {
      setPuestos(data.puestos);
      if (puestoInicial) {
        const elegido = data.puestos.find((item) => item.id === puestoInicial);
        if (elegido) void abrirPuesto(elegido);
      }
    }).catch((e: Error) => setError(e.message));
  }, [token, perfil, identidad, puestoInicial, panel]);

  useEffect(() => {
    if (!token || perfil !== "comprador" || identidad === "pendiente" || identidad === "rechazada") return;
    void pedir<{ avisos: Aviso[] }>("avisos").then((data) => setAvisos(data.avisos)).catch(() => setAvisos([]));
    void pedir<{ ranking: Ranking[] }>("ranking").then((data) => setRanking(data.ranking)).catch(() => setRanking([]));
  }, [token, perfil, identidad]);

  useEffect(() => {
    if (!token || perfil !== "comprador") return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const previos = pedidosRef.current;
      const vivos = previos.some((pedido) => pedidoSigue(pedido.estado));
      if (previos.length > 0 && !vivos) return;
      const conocidos = new Map(previos.map((pedido) => [pedido.id, pedido.pagoEstado]));
      void cargarPedidos()
        .then((lista) => {
          const nuevo = lista?.some(
            (pedido) =>
              conocidos.has(pedido.id) &&
              conocidos.get(pedido.id) !== "habilitado" &&
              habilitaCargador(pedido.formaPago ?? null, pedido.pagoEstado ?? null) &&
              !pedido.tieneCargador,
          );
          if (!nuevo) return;
          setAviso("Ya podés elegir el cargador.");
          setPanel("pedidos");
        })
        .catch(() => undefined);
      const id = abiertoRef.current;
      if (id) void leerDetalle(id).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [token, perfil]);

  async function correr(accion: () => Promise<void>) {
    if (vuelo.current) return;
    vuelo.current = true;
    setOcupado(true);
    setError(null);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      vuelo.current = false;
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
        const data = await pedir<{ token?: string; pendiente?: boolean; aviso?: string; enlace?: string | null }>("auth/registro-cargador", {
          method: "POST",
          body: { nombre, email, password, telefono, website, captcha },
        });
        if (data.pendiente || !data.token) {
          setAviso(data.enlace ? `${data.aviso ?? "Confirmá el correo."} ${data.enlace}` : (data.aviso ?? "Confirmá el correo antes de entrar."));
          return;
        }
        entrar(data.token, "cargador");
        return;
      }
      const data = await pedir<{ token?: string; pendiente?: boolean; aviso?: string; enlace?: string | null; comprador?: { identidadEstado?: string } }>("auth/registro", {
        method: "POST",
        body: {
          nombre,
          email,
          password,
          telefono,
          pais,
          tipoDocumento: pais === "PY" ? "CI_PY" : "DNI",
          numeroDocumento: documento,
          website,
          captcha,
        },
      });
      if (data.pendiente || !data.token) {
        setAviso(data.enlace ? `${data.aviso ?? "Confirmá el correo."} ${data.enlace}` : (data.aviso ?? "Confirmá el correo antes de entrar."));
        return;
      }
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
    setBusca("");
    setProductos([]);
    const data = await pedir<{ productos: Producto[] }>(`puestos/${item.id}/productos`, { token });
    setProductos(data.productos);
  }

  function tieneCuenta(tenantId: string) {
    return puestos.some((item) => item.id === tenantId && item.cuentaCorriente);
  }

  function aplicarCarrito(siguiente: Linea[]) {
    const sigueCuenta = siguiente.length > 0 && siguiente.every((linea) => tieneCuenta(linea.tenantId));
    const pago = medioPago === "cuenta_corriente" && !sigueCuenta ? "efectivo" : medioPago;
    if (pago !== medioPago) setMedioPago(pago);
    setCarrito(siguiente);
    invalidarSiCambia(cuerpoCheckout(siguiente, pago, nota));
  }

  function invalidarSiCambia(siguiente: ReturnType<typeof cuerpoCheckout>) {
    const guardado = leerCheckout();
    if (!guardado || firmaCheckout(guardado.cuerpo) === firmaCheckout(siguiente)) return;
    sessionStorage.removeItem(CHECKOUT);
    setPendiente(null);
    setAviso("Se descartó el envío anterior porque cambió el pedido. Si ya había salido, está en Pedidos.");
    if (token) void cargarPedidos().catch(() => undefined);
  }

  function guardarCheckout(valor: CheckoutPendiente) {
    sessionStorage.setItem(CHECKOUT, JSON.stringify(valor));
    setPendiente(valor);
  }

  function borrarCheckout() {
    sessionStorage.removeItem(CHECKOUT);
    setPendiente(null);
  }

  function ajustar(producto: Producto, delta: number) {
    if (!puesto) return;
    const previa = carrito.find((linea) => linea.tenantId === puesto.id && linea.productoId === producto.id);
    if (!previa) {
      if (delta > 0) sumar(producto);
      return;
    }
    cambiarCantidad(previa, delta);
  }

  function sumar(producto: Producto) {
    if (!puesto || ocupado || vuelo.current) return;
    const previa = carrito.find((linea) => linea.tenantId === puesto.id && linea.productoId === producto.id);
    const siguiente = previa
      ? carrito.map((linea) => (linea === previa ? { ...linea, cantidad: linea.cantidad + 1 } : linea))
      : [
          ...carrito,
          {
            tenantId: puesto.id,
            tenantNombre: puesto.nombre,
            productoId: producto.id,
            nombre: producto.nombre,
            cantidad: 1,
            precio: producto.precio,
            unidad: producto.unidad,
            unidadLabel: producto.unidadLabel,
          },
        ];
    aplicarCarrito(siguiente);
  }

  function cambiarCantidad(linea: Linea, delta: number) {
    if (ocupado || vuelo.current) return;
    aplicarCarrito(
      carrito.flatMap((item) => {
        if (item.tenantId !== linea.tenantId || item.productoId !== linea.productoId) return [item];
        const cantidad = item.cantidad + delta;
        return cantidad > 0 ? [{ ...item, cantidad }] : [];
      }),
    );
  }

  function quitar(linea: Linea) {
    if (ocupado || vuelo.current) return;
    aplicarCarrito(carrito.filter((item) => item.tenantId !== linea.tenantId || item.productoId !== linea.productoId));
  }

  function cambiarPago(valor: "efectivo" | "transferencia" | "cuenta_corriente") {
    if (ocupado || vuelo.current) return;
    setMedioPago(valor);
    invalidarSiCambia(cuerpoCheckout(carrito, valor, nota));
  }

  function cambiarNota(valor: string) {
    if (ocupado || vuelo.current) return;
    const corta = notaDePedido(valor);
    setNota(corta);
    invalidarSiCambia(cuerpoCheckout(carrito, medioPago, corta));
  }

  async function actualizarPrecios() {
    if (!token || carrito.length === 0) return;
    await correr(async () => {
      const mapas = new Map<string, Producto>();
      for (const id of new Set(carrito.map((linea) => linea.tenantId))) {
        const data = await pedir<{ productos: Producto[] }>(`puestos/${id}/productos`, { token });
        for (const producto of data.productos) mapas.set(`${id}:${producto.id}`, producto);
      }
      setCarrito((actual) =>
        actual.map((linea) => {
          const fresco = mapas.get(`${linea.tenantId}:${linea.productoId}`);
          if (!fresco) return linea;
          return { ...linea, precio: fresco.precio, unidad: fresco.unidad, unidadLabel: fresco.unidadLabel };
        }),
      );
    });
  }

  async function enviarCheckout(envio: CheckoutPendiente, limpiarCarrito: boolean) {
    if (!token) return;
    if (identidad === "pendiente" || identidad === "rechazada") {
      throw new Error("Antes tenés que cargar el documento y la selfie.");
    }
    guardarCheckout(envio);
    let creado: { pedidos: { id: string }[] };
    try {
      creado = await pedir<{ pedidos: { id: string }[] }>("pedidos", { method: "POST", token, clave: envio.clave, body: envio.cuerpo });
    } catch (error) {
      if (error instanceof ErrorMercado && esFalloAmbiguo(error.status)) {
        throw new Error("No sabemos si el pedido salió. Reintentá el mismo envío: no se duplica.");
      }
      borrarCheckout();
      throw error;
    }
    borrarCheckout();
    let avisoPago: string | null = null;
    const archivo = comprobante ?? comprobanteRef.current?.files?.[0] ?? null;
    if (envio.cuerpo.medioPago === "transferencia" && archivo) {
      try {
        const data = await archivoADataUrl(archivo);
        for (const pedido of creado.pedidos ?? []) {
          await pedir(`pedidos/${pedido.id}/comprobante`, {
            method: "POST",
            token,
            body: { nombre: archivo.name, data },
          });
        }
        setComprobante(null);
        if (comprobanteRef.current) comprobanteRef.current.value = "";
        avisoPago = "El comprobante quedó cargado. Cuando caja o el puesto cobren, podés elegir el cargador.";
      } catch (error) {
        avisoPago = error instanceof Error ? `El pedido salió. ${error.message}` : "El pedido salió. Cargá el comprobante en el pedido.";
      }
    }
    if (limpiarCarrito) {
      setCarrito([]);
      setNota("");
    }
    setAviso(avisoPago);
    setPanel("pedidos");
    await cargarPedidos();
  }

  async function confirmar() {
    if (!token) return;
    if (medioPago === "transferencia" && !(comprobante ?? comprobanteRef.current?.files?.[0])) {
      setError("Subí el comprobante para pagar.");
      return;
    }
    const archivo = comprobante ?? comprobanteRef.current?.files?.[0] ?? null;
    if (archivo && archivo.size > 700_000) {
      setError("El comprobante tiene que pesar menos de 700 KB.");
      return;
    }
    const cuerpo = cuerpoCheckout(carrito, medioPago, nota);
    if (cuerpo.items.length === 0) return;
    await correr(async () => {
      const guardado = leerCheckout();
      const { envio, reutilizado } = resolverCheckout(guardado, cuerpo, clave);
      if (guardado && !reutilizado) {
        setAviso("Se descartó el envío anterior porque cambió el pedido. Si ya había salido, está en Pedidos.");
        await cargarPedidos().catch(() => undefined);
      }
      await enviarCheckout(envio, true);
    });
  }

  async function reintentarGuardado() {
    const envio = leerCheckout();
    if (!envio) return;
    const mismo = firmaCheckout(envio.cuerpo) === firmaCheckout(cuerpoCheckout(carrito, medioPago, nota));
    await correr(async () => {
      await enviarCheckout(envio, mismo);
    });
  }

  async function cancelar(pedidoId: string) {
    if (!token) return;
    await correr(async () => {
      await pedir(`pedidos/${pedidoId}/cancelar`, { method: "POST", token });
      await cargarPedidos();
      if (abiertoRef.current === pedidoId) await leerDetalle(pedidoId).catch(() => undefined);
    });
  }

  async function subirComprobante(pedidoId: string, archivo: File) {
    if (!token) return;
    await correr(async () => {
      const data = await archivoADataUrl(archivo);
      await pedir(`pedidos/${pedidoId}/comprobante`, {
        method: "POST",
        token,
        body: { nombre: archivo.name, data },
      });
      await cargarPedidos();
      if (abiertoRef.current === pedidoId) await leerDetalle(pedidoId).catch(() => undefined);
    });
  }

  async function cargarPedidos() {
    if (!token) return;
    const data = await pedir<{ pedidos: Pedido[] }>("pedidos", { token });
    setPedidos(data.pedidos);
    const rutas = await pedir<{ recorridos: Recorrido[] }>("recorridos", { token });
    setRecorridos(rutas.recorridos);
    const lista = await pedir<{ cargadores: Cargador[] }>("cargadores", { token });
    setCargadores(lista.cargadores);
    return data.pedidos;
  }

  async function leerDetalle(id: string) {
    if (!token) return;
    const data = await pedir<{ pedido: Pedido }>(`pedidos/${encodeURIComponent(id)}`, { token });
    setDetalle(data.pedido);
    setPedidos((actual) => actual.map((pedido) => (pedido.id === id ? { ...pedido, ...data.pedido } : pedido)));
  }

  async function verPedido(id: string) {
    setAbierto(id);
    setError(null);
    try {
      await leerDetalle(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el pedido.");
    }
  }

  async function asignarUno(pedidoId: string, cargadorId: string) {
    if (!token || !cargadorId) return;
    await correr(async () => {
      await pedir("recorridos", {
        method: "POST",
        token,
        clave: clave(),
        body: { cargadorId, pedidoIds: [pedidoId] },
      });
      setElegidos((actual) => actual.filter((id) => id !== pedidoId));
      setAviso("Cargador asignado.");
      await cargarPedidos();
    });
  }

  async function elegir(cargadorId: string) {
    if (!token || elegidos.length === 0) return;
    const pedidoIds = elegidos.filter((id) => {
      const pedido = pedidos.find((item) => item.id === id);
      return pedido ? habilitaCargador(pedido.formaPago ?? null, pedido.pagoEstado ?? null) : false;
    });
    if (pedidoIds.length === 0) {
      setError("Esos pedidos todavía no habilitan el retiro. El contado se habilita al pagar en caja.");
      return;
    }
    await correr(async () => {
      await pedir("recorridos", {
        method: "POST",
        token,
        clave: clave(),
        body: { cargadorId, pedidoIds },
      });
      setElegidos([]);
      await cargarPedidos();
    });
  }

  async function calificar(recorridoId: string, estrellas: number, comentario: string) {
    if (!token) return;
    await correr(async () => {
      try {
        await pedir(`recorridos/${recorridoId}/calificar`, {
          method: "POST",
          token,
          body: { estrellas, comentario },
        });
        setCalificados((actual) => ({ ...actual, [recorridoId]: estrellas }));
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "";
        if (mensaje.includes("ya fue calificada")) {
          setCalificados((actual) => ({ ...actual, [recorridoId]: actual[recorridoId] ?? 0 }));
        }
        throw error;
      }
      await cargarPedidos();
      const data = await pedir<{ ranking: Ranking[] }>("ranking");
      setRanking(data.ranking);
    });
  }

  async function calificarComprador(recorridoId: string, estrellas: number, comentario: string) {
    if (!token) return;
    await correr(async () => {
      await pedir(`recorridos/${recorridoId}/calificar-comprador`, {
        method: "POST",
        token,
        body: { estrellas, comentario },
      });
    });
  }

  async function calificarPuesto(pedidoId: string, estrellas: number, comentario: string) {
    if (!token) return;
    await correr(async () => {
      await pedir(`pedidos/${pedidoId}/calificar-puesto`, {
        method: "POST",
        token,
        body: { estrellas, comentario },
      });
    });
  }

  async function guardarPerfil(nombre: string, telefono: string, foto: string | null) {
    if (!token) return;
    await correr(async () => {
      const fichaNueva = await pedir<FichaCargador>("cargador/perfil", {
        method: "POST",
        token,
        body: { nombre, telefono, foto },
      });
      setYoCargador(fichaNueva);
    });
  }

  async function cargarRecorridos() {
    if (!token) return;
    const data = await pedir<{ recorridos: Recorrido[] }>("recorridos", { token });
    setRecorridos(data.recorridos);
    const yo = await pedir<{ cargador?: FichaCargador }>("yo", { token });
    if (yo.cargador) setYoCargador(yo.cargador);
  }

  async function disponibilidad(valor: string) {
    if (!token) return;
    await correr(async () => {
      await pedir<FichaCargador>("cargador/disponibilidad", { method: "POST", token, body: { disponibilidad: valor } }).then(setYoCargador);
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
          {alta ? (
            <label className="absolute -left-[9999px] h-0 overflow-hidden" aria-hidden>
              Web
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(ev) => setWebsite(ev.target.value)} />
            </label>
          ) : null}
          {alta ? <Campo label="Teléfono" value={telefono} onChange={setTelefono} /> : null}
          {alta ? <Captcha onToken={setCaptcha} /> : null}
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
      <PuertaLegal modo="mercado" token={token}>
      <Marco titulo="Cargador" onSalir={salir} onCargar={() => void cargarRecorridos()}>
        {error ? <p className="text-sm text-terra">{error}</p> : null}
        {yoCargador ? (
          <section className="mb-4 rounded-md border border-line bg-surface px-3 py-3 text-sm">
            <p className="font-medium">{yoCargador.nombre}</p>
            <p className="text-muted">{yoCargador.telefono || "Sin teléfono"} · {yoCargador.nivel}</p>
            <p className="mt-1">
              {yoCargador.calificacion == null ? "Sin calificaciones" : `${yoCargador.calificacion} de 5 · ${yoCargador.calificaciones} calificaciones`}
            </p>
            <p className="text-muted">
              {yoCargador.recorridosCompletados} recorridos hechos · {yoCargador.puntos} pts · score {yoCargador.score}
            </p>
            <p className="text-muted">
              A tiempo {yoCargador.entregasATiempo} · demoradas {yoCargador.entregasDemoradas} · cancelaciones {yoCargador.cancelaciones}
            </p>
            <p className="mt-1">{yoCargador.disponibilidad === "disponible" ? "Estás disponible." : "No estás disponible."}</p>
          </section>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={ocupado} onClick={() => void disponibilidad("disponible")}>
            Disponible
          </Button>
          <Button variant="secondary" disabled={ocupado} onClick={() => void disponibilidad("no_disponible")}>
            No disponible
          </Button>
        </div>
        {yoCargador ? (
          <form
            className="mt-4 space-y-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              const form = ev.currentTarget;
              const nombre = (form.elements.namedItem("nombre") as HTMLInputElement).value;
              const telefono = (form.elements.namedItem("telefono") as HTMLInputElement).value;
              const archivo = (form.elements.namedItem("foto") as HTMLInputElement).files?.[0];
              if (!archivo) {
                void guardarPerfil(nombre, telefono, null);
                return;
              }
              if (archivo.size > 700_000) {
                setError("La foto tiene que pesar menos de 700 KB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => void guardarPerfil(nombre, telefono, String(reader.result));
              reader.readAsDataURL(archivo);
            }}
          >
            <p className="text-sm font-medium">Editar perfil</p>
            <Input name="nombre" defaultValue={yoCargador.nombre} required />
            <Input name="telefono" defaultValue={yoCargador.telefono ?? ""} placeholder="Teléfono" />
            <label className="block text-xs text-muted">
              Foto, si querés. No es obligatoria.
              <input name="foto" type="file" accept="image/*" className="mt-1 block w-full text-sm" />
            </label>
            <Button type="submit" disabled={ocupado}>Guardar perfil</Button>
          </form>
        ) : null}
        <p className="mt-4 text-sm text-muted">Los trabajos te los asigna el comprador. Aceptá el que te toca: otro cargador no puede tomarlo al mismo tiempo.</p>
        <div className="mt-3">
          <ListaRecorridos
            recorridos={recorridos}
            cargador
            ocupado={ocupado}
            onAccion={accion}
            onCalificar={calificar}
            onCalificarComprador={calificarComprador}
          />
        </div>
      </Marco>
      </PuertaLegal>
    );
  }

  if (identidad === "pendiente" || identidad === "rechazada") {
    return (
      <PuertaLegal modo="mercado" token={token}>
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
    <PuertaLegal modo="mercado" token={token}>
    <Marco titulo="Mercado al Toque" onSalir={salir}>
      <div className="grid grid-cols-4 gap-2">
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
        <Button variant={panel === "perfil" ? "primary" : "secondary"} onClick={() => setPanel("perfil")}>
          Perfil
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
      {aviso ? <p className="mt-3 text-sm text-muted">{aviso}</p> : null}
      {panel === "puestos" && !puesto ? (
        <div className="mt-4 space-y-3">
          {puestos.length === 0 ? <p className="text-sm text-muted">Ningún puesto está publicado en Mercado al Toque.</p> : null}
          {avisos.map((aviso) => (
            <article key={aviso.id} className="rounded-md border border-line bg-surface px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted">{aviso.titulo}</p>
              <p className="font-medium">{aviso.tenantNombre}</p>
              <p>{aviso.detalle}</p>
              {aviso.precio != null ? <p className="tabular-nums">{money(aviso.precio)}{aviso.unidadLabel ? ` / ${aviso.unidadLabel}` : ""}</p> : null}
              <p className="text-xs text-muted">Hasta {aviso.endsOn}</p>
            </article>
          ))}
          {puestos.map((item) => (
            <button key={item.id} type="button" className="block w-full rounded-md border border-line bg-surface px-3 py-3 text-left" onClick={() => void abrirPuesto(item)}>
              <span className="font-medium">{item.nombre}</span>
              {item.bajada ? <span className="mt-0.5 block text-sm text-muted">{item.bajada}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {panel === "puestos" && puesto ? (
        <div className="mt-3 pb-44">
          <button type="button" className="text-sm text-leaf" onClick={() => { setPuesto(null); setProductos([]); setBusca(""); }}>
            Puestos
          </button>
          <h2 className="font-display text-xl font-semibold">{puesto.nombre}</h2>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-10" placeholder="Buscar banana, papa, lechuga…" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
          </div>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {productos
              .filter((producto) => producto.nombre.toLowerCase().includes(busca.trim().toLowerCase()))
              .map((producto) => {
                const n = carrito.find((linea) => linea.tenantId === puesto.id && linea.productoId === producto.id)?.cantidad ?? 0;
                return (
                  <li key={producto.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => ajustar(producto, 1)}>
                      <span className="block truncate font-medium leading-tight">{producto.nombre}</span>
                      <span className="text-sm text-muted">
                        {money(producto.precio)} / {producto.unidadLabel}
                        <span className="ml-2 tabular-nums">{producto.disponible} {producto.unidadLabel}</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="secondary" size="icon" className="size-9" disabled={n === 0 || ocupado} aria-label="Quitar" onClick={() => ajustar(producto, -1)}>
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-7 text-center font-medium tabular-nums">{n || ""}</span>
                      <Button size="icon" className="size-9" disabled={ocupado} aria-label="Agregar" onClick={() => ajustar(producto, 1)}>
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            {productos.filter((producto) => producto.nombre.toLowerCase().includes(busca.trim().toLowerCase())).length === 0 ? (
              <li className="px-3 py-6 text-sm text-muted">Ningún producto con ese nombre.</li>
            ) : null}
          </ul>
          <aside className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-h-[52vh] max-w-md flex-col overflow-hidden border-t border-line bg-surface px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(26,22,18,0.06)]">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Pedido</h2>
              <span className="font-display text-2xl font-semibold tabular-nums">{money(carrito.reduce((suma, linea) => suma + linea.precio * linea.cantidad, 0))}</span>
            </div>
            {carrito.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Tocá un producto. El puesto confirma el importe.</p>
            ) : (
              <ul className="mt-1 min-h-0 flex-1 space-y-1 overflow-auto">
                {carrito.map((linea) => (
                  <li key={`${linea.tenantId}-${linea.productoId}`} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{linea.nombre}</div>
                      <div className="text-muted tabular-nums">
                        {linea.cantidad} {linea.unidadLabel || linea.unidad}
                        {linea.tenantNombre !== puesto.nombre ? ` · ${linea.tenantNombre}` : ""}
                      </div>
                    </div>
                    <button type="button" className="text-muted" aria-label="Sacar" onClick={() => quitar(linea)}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 shrink-0 border-t border-line pt-2">
            <div className="grid grid-cols-3 gap-1">
              {(["efectivo", "transferencia", "cuenta_corriente"] as const).map((valor) => (
                <button
                  key={valor}
                  type="button"
                  disabled={ocupado || (valor === "cuenta_corriente" && (carrito.length === 0 || !carrito.every((linea) => tieneCuenta(linea.tenantId))))}
                  className={`h-9 rounded-md border text-xs ${medioPago === valor ? "border-btn bg-btn text-btn-fg" : "border-line bg-paper"}`}
                  onClick={() => cambiarPago(valor)}
                >
                  {valor === "efectivo" ? "Contado" : valor === "transferencia" ? "Transferencia" : "Cuenta"}
                </button>
              ))}
            </div>
            <Input className="mt-2" placeholder="Nota para el puesto" maxLength={500} value={nota} disabled={ocupado} onChange={(ev) => cambiarNota(ev.target.value)} />
            {medioPago === "transferencia" ? (
              <label className="mt-2 block text-xs text-muted">
                Comprobante
                <input
                  ref={comprobanteRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="mt-1 block w-full text-sm text-ink"
                  disabled={ocupado}
                  onChange={(ev) => setComprobante(ev.target.files?.[0] ?? null)}
                />
                {comprobante ? <span className="text-ink">{comprobante.name}</span> : null}
              </label>
            ) : (
              <p className="mt-1 text-xs text-muted">
                {medioPago === "efectivo" ? "El retiro queda cerrado hasta que pagues en caja." : "La cuenta ya habilita el cargador. Elegilo en Pedidos."}
              </p>
            )}
            <Button className="mt-2 w-full" disabled={ocupado || carrito.length === 0} onClick={() => void confirmar()}>
              {ocupado ? "Enviando…" : "Pagar"}
            </Button>
            </div>
          </aside>
        </div>
      ) : null}
      {panel === "carrito" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">{bultos} bultos en {puestosEnCarrito.length} puestos. Los kilos no se cuentan.</p>
          {carrito.length === 0 ? <p className="text-sm text-muted">El carrito está vacío.</p> : null}
          {pendiente && !reintentoMismo ? (
            <section className="rounded-md border border-line bg-surface px-3 py-3 text-sm">
              <p>Quedó un envío sin respuesta ({pendiente.cuerpo.items.length} productos, {pagoLegible(pendiente.cuerpo.medioPago)}).</p>
              <Button className="mt-2 w-full" disabled={ocupado} onClick={() => void reintentarGuardado()}>
                Reintentar el mismo envío
              </Button>
            </section>
          ) : null}
          {puestosEnCarrito.map(([nombre, lineas]) => (
            <section key={nombre}>
              <p className="text-sm font-medium">{nombre}</p>
              {lineas.map((linea) => (
                <div key={`${linea.tenantId}-${linea.productoId}`} className="border-b border-line py-2">
                  <p>{linea.nombre}</p>
                  <p className="text-sm text-muted">
                    {linea.cantidad} {linea.unidadLabel || linea.unidad} · {money(linea.precio)} c/u
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => cambiarCantidad(linea, -1)}>-</Button>
                    <span className="w-6 text-center">{linea.cantidad}</span>
                    <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => cambiarCantidad(linea, 1)}>+</Button>
                    <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => quitar(linea)}>Quitar</Button>
                  </div>
                </div>
              ))}
            </section>
          ))}
          {carrito.length > 0 ? (
            <Button variant="secondary" disabled={ocupado} onClick={() => void actualizarPrecios()}>
              Actualizar precios
            </Button>
          ) : null}
          <label className="block text-sm">
            Cómo pagás
            <select
              className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
              value={medioPago}
              disabled={ocupado}
              onChange={(ev) => {
                const valor = ev.target.value;
                cambiarPago(valor === "transferencia" || valor === "cuenta_corriente" ? valor : "efectivo");
              }}
            >
              <option value="efectivo">Contado</option>
              <option value="transferencia">Transferencia</option>
              <option value="cuenta_corriente" disabled={carrito.length === 0 || !carrito.every((linea) => tieneCuenta(linea.tenantId))}>
                Cuenta corriente
              </option>
            </select>
          </label>
          <p className="text-xs text-muted">
            {medioPago === "efectivo"
              ? "El retiro queda cerrado hasta que pagues en caja."
              : medioPago === "transferencia"
                ? "El comprobante se carga al pagar. Cuando caja o el puesto cobren, podés elegir el cargador."
                : "La cuenta ya habilita el cargador. Elegilo en Pedidos."}
          </p>
          <label className="block text-sm">
            Nota para el puesto
            <textarea
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
              maxLength={500}
              rows={3}
              value={nota}
              disabled={ocupado}
              onChange={(ev) => cambiarNota(ev.target.value)}
            />
            <span className="text-xs text-muted">{nota.length}/500</span>
          </label>
          {medioPago === "transferencia" ? (
            <label className="block text-sm">
              Comprobante
              <input
                type="file"
                accept="image/*,.pdf"
                className="mt-1 block w-full text-sm"
                disabled={ocupado}
                onChange={(ev) => setComprobante(ev.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}
          <p className="text-xs text-muted">El importe y el stock los confirma el puesto al crear el pedido. Cada puesto genera el suyo.</p>
          <Button className="w-full" disabled={ocupado || carrito.length === 0} onClick={() => void confirmar()}>
            {ocupado ? "Enviando…" : reintentoMismo ? "Reintentar el mismo pago" : "Pagar"}
          </Button>
        </div>
      ) : null}
      {panel === "pedidos" ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">{elegidos.length ? `${bultosElegidos} bultos en los pedidos elegidos.` : "Cuando el pago está habilitado, elegí el pedido y un cargador de la lista."}</p>
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void cargarPedidos().catch((e: Error) => setError(e.message))}>
              Actualizar
            </Button>
          </div>
          {pedidos.map((pedido) => {
            const visto = detalle?.id === pedido.id ? detalle : pedido;
            return (
            <article key={pedido.id} className="rounded-md border border-line px-3 py-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  disabled={pedido.estado === "cancelado" || pedido.estado === "entregado" || !habilitaCargador(visto.formaPago ?? null, visto.pagoEstado ?? null)}
                  checked={elegidos.includes(pedido.id)}
                  onChange={(ev) =>
                    setElegidos((actual) =>
                      ev.target.checked ? [...actual, pedido.id] : actual.filter((id) => id !== pedido.id),
                    )
                  }
                />
                <span>
                  {visto.tenantNombre}
                  <span className="block text-sm text-muted">
                    {visto.bultos} bultos · {etiqueta(visto.estado)} · {money(visto.total)}
                    {pagoLegible(visto.formaPago) ? ` · ${pagoLegible(visto.formaPago)}` : ""}
                    {visto.pagoEstado ? ` · pago ${visto.pagoEstado}` : ""}
                  </span>
                  {hora(visto.creadoEn) ? <span className="block text-xs text-muted">Pedido {hora(visto.creadoEn)}</span> : null}
                  {motivoCargador(visto) ? <span className="block text-xs text-muted">{motivoCargador(visto)}</span> : null}
                </span>
              </label>
              <PasosPedido pedido={visto} />
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => void verPedido(pedido.id)}>
                {abierto === pedido.id ? "Actualizar detalle" : "Ver detalle"}
              </Button>
              {abierto === pedido.id ? <DetallePedido pedido={visto} /> : null}
              {pedido.estado === "confirmado" ? (
                <Button size="sm" variant="secondary" className="mt-2" disabled={ocupado} onClick={() => void cancelar(pedido.id)}>
                  Cancelar
                </Button>
              ) : null}
              {visto.tieneCargador ? <p className="mt-2 text-sm">Cargador asignado.</p> : habilitaCargador(visto.formaPago ?? null, visto.pagoEstado ?? null) ? (
                <label className="mt-2 block text-sm">
                  Asignar cargador
                  <select
                    className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
                    defaultValue=""
                    disabled={ocupado || cargadores.length === 0}
                    onChange={(ev) => {
                      const id = ev.target.value;
                      ev.target.value = "";
                      if (id) void asignarUno(pedido.id, id);
                    }}
                  >
                    <option value="">{cargadores.length ? "Elegí de la lista" : "No hay cargadores disponibles"}</option>
                    {cargadores.map((cargador) => (
                      <option key={cargador.id} value={cargador.id}>
                        {cargador.nombre} · {cargador.nivel}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="mt-2 text-xs text-muted">{motivoCargador(visto)}</p>
              )}
              {visto.formaPago === "transferencia" && !visto.tieneComprobante ? (
                <label className="mt-2 block text-sm">
                  Comprobante
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="mt-1 block w-full text-sm"
                    onChange={(ev) => {
                      const archivo = ev.target.files?.[0];
                      if (archivo) void subirComprobante(pedido.id, archivo);
                    }}
                  />
                </label>
              ) : null}
              {visto.tieneComprobante ? <p className="mt-1 text-xs text-muted">Comprobante cargado.</p> : null}
            </article>
            );
          })}
          {cargadores.map((cargador) => (
            <Button key={cargador.id} variant="secondary" className="w-full" disabled={ocupado || elegidos.length === 0} onClick={() => void elegir(cargador.id)}>
              Elegir a {cargador.nombre} · {cargador.nivel}
              {cargador.calificacion != null ? ` · ${cargador.calificacion}` : ""}
              {cargador.recorridosCompletados != null ? ` · ${cargador.recorridosCompletados} recorridos` : ""}
            </Button>
          ))}
          <ListaRecorridos
            recorridos={recorridos}
            ocupado={ocupado}
            calificados={calificados}
            onAccion={accion}
            onCalificar={calificar}
            onCalificarPuesto={calificarPuesto}
          />
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
      {panel === "perfil" && ficha ? (
        <section className="mt-4 space-y-1 text-sm">
          <p className="font-medium">{ficha.nombre}</p>
          <p className="text-muted">{ficha.telefono || "Sin teléfono"}</p>
          <p className="text-muted">
            {ficha.pais === "PY" ? "Paraguay" : "Argentina"}
            {ficha.numeroDocumento ? ` · ${ficha.tipoDocumento === "CI_PY" ? "CI" : "DNI"} ${ficha.numeroDocumento}` : ""}
          </p>
          <p className="text-muted">Documentación: {identidad.replaceAll("_", " ")}</p>
        </section>
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
  calificados = {},
  onAccion,
  onCalificar,
  onCalificarComprador,
  onCalificarPuesto,
}: {
  recorridos: Recorrido[];
  cargador?: boolean;
  ocupado: boolean;
  calificados?: Record<string, number>;
  onAccion: (id: string, accion: string, pedidoId?: string) => Promise<void>;
  onCalificar: (id: string, estrellas: number, comentario: string) => Promise<void>;
  onCalificarComprador?: (id: string, estrellas: number, comentario: string) => Promise<void>;
  onCalificarPuesto?: (pedidoId: string, estrellas: number, comentario: string) => Promise<void>;
}) {
  if (recorridos.length === 0) return null;
  return (
    <div className="space-y-3">
      {recorridos.map((recorrido) => (
        <section key={recorrido.id} className="rounded-md border border-line p-3">
          <p className="font-medium">{recorrido.bultos} bultos · {etiqueta(recorrido.estado)}</p>
          <p className="text-sm text-muted">
            {cargador ? recorrido.comprador : recorrido.cargador}
            {cargador && recorrido.telefono ? ` · ${recorrido.telefono}` : ""}
            {hora(recorrido.creadoEn) ? ` · ${hora(recorrido.creadoEn)}` : ""}
          </p>
          {(recorrido.paradas ?? []).map((parada) => (
            <div key={parada.pedidoId} className="mt-2 border-t border-line pt-2">
              <p>
                {parada.puesto}: {parada.bultos} bultos · {etiqueta(parada.estado)}
              </p>
              {(parada.items ?? []).map((item) => (
                <p key={item.nombre} className="text-sm text-muted">
                  {item.cantidad} {item.unidad} · {item.nombre}
                </p>
              ))}
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
              {!cargador && parada.estado === "entregado" && onCalificarPuesto ? (
                <CalificarEntrega
                  titulo="Calificar al puesto"
                  ocupado={ocupado}
                  onCalificar={(estrellas, comentario) => onCalificarPuesto(parada.pedidoId, estrellas, comentario)}
                />
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
          {cargador && recorrido.estado === "entregado" && onCalificarComprador ? (
            <CalificarEntrega
              titulo="Calificar al comprador"
              ocupado={ocupado}
              onCalificar={(estrellas, comentario) => onCalificarComprador(recorrido.id, estrellas, comentario)}
            />
          ) : null}
          {!cargador && recorrido.estado === "entregado" ? (
            <CalificarEntrega
              titulo="Calificar al cargador"
              ocupado={ocupado}
              ya={calificados[recorrido.id]}
              onCalificar={(estrellas, comentario) => onCalificar(recorrido.id, estrellas, comentario)}
            />
          ) : null}
        </section>
      ))}
    </div>
  );
}

function CalificarEntrega({
  titulo = "Calificar",
  ocupado,
  ya,
  onCalificar,
}: {
  titulo?: string;
  ocupado: boolean;
  ya?: number;
  onCalificar: (estrellas: number, comentario: string) => Promise<void>;
}) {
  const [estrellas, setEstrellas] = useState(ya && ya > 0 ? ya : 0);
  const [comentario, setComentario] = useState("");
  if (ya != null) {
    return <p className="mt-2 text-sm text-muted">{ya > 0 ? `Calificaste con ${ya} de 5.` : "Ya calificaste esta entrega."}</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm font-medium">{titulo}</p>
      <div className="flex gap-1" role="group" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((estrella) => (
          <Button key={estrella} size="sm" variant={estrellas >= estrella ? "primary" : "secondary"} disabled={ocupado} onClick={() => setEstrellas(estrella)}>
            {estrella}
          </Button>
        ))}
      </div>
      <textarea
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        rows={2}
        placeholder="Comentario, si querés"
        value={comentario}
        disabled={ocupado}
        onChange={(ev) => setComentario(ev.target.value)}
      />
      <Button size="sm" disabled={ocupado || estrellas < 1} onClick={() => void onCalificar(estrellas, comentario)}>
        Enviar calificación
      </Button>
    </div>
  );
}

function PasosPedido({ pedido }: { pedido: Pedido }) {
  if (pedido.estado === "cancelado") return <p className="mt-2 text-sm text-terra">Cancelado</p>;
  const pasos = [
    { nombre: "Preparación", listo: ["preparado", "retirado", "entregado"].includes(pedido.estado) || Boolean(pedido.hitos?.preparado), ahora: pedido.estado === "confirmado" || pedido.estado === "en_preparacion" },
    { nombre: "Retiro", listo: pedido.estado === "entregado" || Boolean(pedido.hitos?.retirado), ahora: pedido.estado === "preparado" || pedido.estado === "retirado" },
    { nombre: "Entrega", listo: pedido.estado === "entregado" || Boolean(pedido.hitos?.entregado), ahora: pedido.estado === "retirado" || pedido.estado === "entregado" },
  ];
  return (
    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
      {pasos.map((paso) => {
        const hecho = paso.listo;
        const actual = paso.ahora && !paso.listo;
        return (
          <p key={paso.nombre} className={hecho ? "rounded-md border border-leaf px-1 py-1 text-leaf" : actual ? "rounded-md border border-leaf px-1 py-1" : "rounded-md border border-line px-1 py-1 text-muted"}>
            {paso.nombre}
          </p>
        );
      })}
    </div>
  );
}

function DetallePedido({ pedido }: { pedido: Pedido }) {
  const hitos = [
    ["Confirmado", pedido.hitos?.confirmado],
    ["Preparación", pedido.hitos?.preparacion],
    ["Preparado", pedido.hitos?.preparado],
    ["Retirado", pedido.hitos?.retirado],
    ["Entregado", pedido.hitos?.entregado],
  ].filter((par) => par[1]);
  const tiempos = [
    ["Preparación", pedido.tiempos?.preparacion],
    ["Espera de retiro", pedido.tiempos?.espera],
    ["Entrega", pedido.tiempos?.entrega],
  ].filter((par) => typeof par[1] === "number");
  return (
    <div className="mt-2 space-y-1 text-sm">
      {pedido.nota ? <p>Nota: {pedido.nota}</p> : <p className="text-muted">Sin nota.</p>}
      <p className="text-muted">
        {pagoLegible(pedido.formaPago) ?? "Pago sin informar"}
        {pedido.pagoEstado ? ` · ${pedido.pagoEstado}` : ""}
      </p>
      {(pedido.items ?? []).map((item) => (
        <p key={`${item.nombre}-${item.unidad}`} className="text-muted">
          {item.cantidad} {item.unidad} · {item.nombre} · {money(item.precio)} c/u
        </p>
      ))}
      <p>Importe del pedido {money(pedido.total)}</p>
      {hitos.length > 0 ? <p className="text-xs text-muted">{hitos.map((par) => `${par[0]} ${hora(String(par[1]))}`).join(" · ")}</p> : null}
      {tiempos.length > 0 ? <p className="text-xs text-muted">{tiempos.map((par) => `${par[0]} ${par[1]} min`).join(" · ")}</p> : null}
    </div>
  );
}

function EnlacePuesto({ id, nombre }: { id: string; nombre: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/mercado?puesto=${id}`;
  useEffect(() => {
    if (!url) return;
    void import("qrcode")
      .then((mod) => mod.default.toDataURL(url, { margin: 1, width: 160 }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);
  return (
    <section className="rounded-md border border-line px-3 py-3 text-sm">
      <p className="font-medium">Entrada a {nombre}</p>
      <p className="break-all text-muted">{url}</p>
      {qr ? <img src={qr} alt="" className="mt-2 size-40" /> : null}
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() => void navigator.clipboard?.writeText(url)}
      >
        Copiar enlace
      </Button>
    </section>
  );
}

function archivoADataUrl(archivo: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
    reader.readAsDataURL(archivo);
  });
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
