import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { canalMercado, catalogoAddons, confirmarAddon, cotizarAddon, listProductos, publicarBanner } from "@/lib/fn";
import { estadoCreativos, editarTextosCreativos, pedirCreativos } from "@/lib/creativos-fn";
import { textoArs } from "@/lib/torre/reglas";
import { ChecksContrato } from "@/components/checks-contrato";
import { escenaDe, medidaDe, MuestraTelefono } from "@/components/muestra-telefono";
import { PLANTILLAS } from "@/lib/mercado/plantillas";

export const Route = createFileRoute("/marketing")({ component: Page });

type Producto = {
  id: string;
  name: string;
  description: string;
  kind: string;
  billing: string;
  frequency: string;
  unitLabel: string;
  setupUsd: number | null;
  setupArs: number | null;
  recurringUsd: number | null;
  recurringArs: number | null;
  onceUsd: number | null;
  onceArs: number | null;
};

function etiquetaPrecio(producto: Producto, venta: number | null) {
  const unaVez = producto.billing === "once" || producto.frequency === "once";
  const linea = (usd: number | null, sufijo: string) => {
    if (usd == null) return null;
    const pesos = textoArs(usd, venta);
    return `USD ${usd}${pesos ? ` · ${pesos}` : ""}${sufijo}`;
  };
  const partes = unaVez
    ? [linea(producto.onceUsd, producto.unitLabel ? ` / ${producto.unitLabel}` : "")]
    : [linea(producto.recurringUsd, " / mes")];
  if (!unaVez && producto.setupUsd != null) partes.push(linea(producto.setupUsd, " instalación, una vez"));
  return partes.filter(Boolean).join(" · ") || "Sin precio en el catálogo";
}

function Page() {
  return (
    <AppShell title="Marketing">
      <Pantalla />
    </AppShell>
  );
}

function Pantalla() {
  const catalogo = useQuery({ queryKey: ["addons"], queryFn: () => catalogoAddons() });
  const canal = useQuery({ queryKey: ["canal-mercado"], queryFn: () => canalMercado() });
  const [elegido, setElegido] = useState<string | null>(null);
  const productos = catalogo.data?.productos ?? [];
  const venta = catalogo.data?.dolar?.venta ?? null;
  const contratados = new Set(catalogo.data?.contratados ?? []);
  const pendientes = new Set(catalogo.data?.pendientes ?? []);
  const producto = (catalogo.data?.productos ?? []).find((item) => item.id === elegido) ?? null;

  if (producto) return <Checkout producto={producto} onVolver={() => setElegido(null)} />;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-xl font-semibold">Contratar</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          El catálogo de Torre, cada uno en el teléfono donde se usa. La verdura es de ejemplo.
        </p>
        {catalogo.isPending ? <p className="mt-3 text-sm text-muted">Leyendo el catálogo…</p> : null}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {productos.length === 0 && !catalogo.isPending ? <li className="px-3 py-3 text-sm text-muted">No hay productos en el catálogo.</li> : null}
          {productos.map((item) => {
            const escena = escenaDe(item.id, item.kind);
            const ya = item.billing === "recurring" && contratados.has(item.id);
            const espera = pendientes.has(item.id);
            return (
              <li key={item.id} className="flex flex-col rounded-lg border border-line bg-surface p-3">
                <div className="flex justify-center rounded-lg bg-paper py-4">
                  <MuestraTelefono escena={escena} />
                </div>
                <p className="mt-3 text-[11px] font-medium tracking-[0.08em] text-terra uppercase">{medidaDe(escena)}</p>
                <p className="mt-1 font-medium">{item.name}</p>
                <p className="text-sm text-muted">{item.description}</p>
                <p className="mt-1 text-sm tabular-nums">{etiquetaPrecio(item, venta)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {ya ? <span className="text-sm text-leaf">Contratado</span> : espera ? <span className="text-sm text-muted">Esperando habilitación</span> : <Button onClick={() => setElegido(item.id)}>Contratar</Button>}
                  {item.kind === "advertising" ? <a href="#banners" className="text-sm text-leaf">Editar aviso</a> : null}
                  {item.id.includes("credito") ? <a href="#creativos" className="text-sm text-leaf">Usar créditos</a> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section id="banners" className="rounded-lg border border-line bg-surface p-4">
        <h2 className="font-display text-xl font-semibold">Banners</h2>
        {canal.isPending ? <p className="mt-3 text-sm text-muted">Leyendo los espacios…</p> : null}
        {canal.data ? (
          <div className="mt-3 space-y-2 text-sm">
            {canal.data.packs.map((pack) => (
              <p key={pack.product}>
                {pack.product}: {pack.remaining} envíos restantes de {pack.quantity}.
              </p>
            ))}
            <Banners avisos={canal.data.avisos} banners={canal.data.banners} puedePublicar={canal.data.puedePublicar} />
          </div>
        ) : null}
      </section>
      <Creativos onComprar={(id) => setElegido(id)} />
    </div>
  );
}

function Creativos({ onComprar }: { onComprar: (id: string) => void }) {
  const qc = useQueryClient();
  const estado = useQuery({ queryKey: ["creativos"], queryFn: () => estadoCreativos() });
  const [formato, setFormato] = useState<"banner" | "push">("banner");
  const [brief, setBrief] = useState("");
  const pedir = useMutation({
    mutationFn: () => pedirCreativos({ data: { formato, brief } }),
    onSuccess: async () => {
      toast.success("Foto lista, con los textos.");
      setBrief("");
      await qc.invalidateQueries({ queryKey: ["creativos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const data = estado.data;
  const costo = data?.costo ?? 4;
  return (
    <section id="creativos" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Creativos</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Una foto y cuatro textos. Los créditos alcanzan para pedirla aunque el banner ya esté ocupado. Editar los textos no gasta créditos. Si la imagen no sale, no se cobra.
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold tabular-nums">{data?.creditos ?? 0}</p>
          <p className="text-xs text-muted">créditos</p>
          <div className="mt-2 flex gap-2">
            {(data?.paquetes ?? [{ id: "prod_creditos_50", creditos: 50, usd: 5.99 }, { id: "prod_creditos_100", creditos: 100, usd: 9.99 }]).map((pack) => (
              <Button key={pack.id} onClick={() => onComprar(pack.id)}>{pack.creditos} · USD {pack.usd.toFixed(2).replace(".", ",")}</Button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        Una foto sale {costo} créditos y trae {data?.textos ?? 4} textos. Editarlos después no se cobra.
      </p>
      {estado.isPending ? <p className="mt-3 text-sm text-muted">Leyendo el saldo…</p> : null}
      {estado.isError ? <p className="mt-3 text-sm text-terra">{(estado.error as Error).message}</p> : null}
      {!estado.isPending && !estado.isError ? (
        <p className="mt-3 text-sm">
          {(data?.creditos ?? 0) < costo
            ? `Tenés ${data?.creditos ?? 0} créditos y la foto sale ${costo}. No es que el producto esté ocupado: faltan créditos.`
            : `Tenés ${data?.creditos ?? 0} créditos. Alcanzan para ${Math.floor((data?.creditos ?? 0) / costo)} fotos. Un banner ya publicado no las bloquea.`}
        </p>
      ) : null}
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          pedir.mutate();
        }}
      >
        <label className="block text-sm">
          Pieza
          <select className="mt-1 h-11 w-full rounded-md border border-line bg-paper px-3" value={formato} onChange={(event) => setFormato(event.target.value as "banner" | "push")}>
            <option value="banner">Banner</option>
            <option value="push">Push</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          Qué tiene que decir
          <textarea className="mt-1 min-h-24 w-full rounded-md border border-line bg-paper px-3 py-2" value={brief} maxLength={400} onChange={(event) => setBrief(event.target.value)} placeholder="Tomate perita, cajón de hoy, precio de puesto." />
        </label>
        <Button type="submit" disabled={pedir.isPending || (data?.creditos ?? 0) < costo || brief.trim().length < 8}>
          {pedir.isPending ? "Armando…" : `Pedir la foto · ${costo} créditos`}
        </Button>
        {brief.trim().length > 0 && brief.trim().length < 8 ? <p className="text-xs text-muted sm:col-span-2">Contá un poco más, aunque sea una frase.</p> : null}
      </form>
      <ul className="mt-4 space-y-4">
        {data?.pedidos.map((pedido) => (
          <li key={pedido.id} className="border-t border-line pt-3">
            <p className="text-sm text-muted">{pedido.formato} · 1 foto · {pedido.variantes.length} textos · {pedido.creditos} créditos</p>
            <p className="text-sm">{pedido.brief}</p>
            {pedido.variantes[0] ? (
              <Pieza pedidoId={pedido.id} imagen={pedido.variantes[0].imagen} variantes={pedido.variantes} onHecho={() => void qc.invalidateQueries({ queryKey: ["creativos"] })} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pieza({
  pedidoId,
  imagen,
  variantes,
  onHecho,
}: {
  pedidoId: string;
  imagen: string;
  variantes: { id: string; titulo: string; texto: string }[];
  onHecho: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [textos, setTextos] = useState(variantes);
  const guardar = useMutation({
    mutationFn: () => editarTextosCreativos({ data: { pedidoId, textos } }),
    onSuccess: () => {
      toast.success("Textos guardados");
      setAbierto(false);
      onHecho();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
      <img src={imagen} alt="" className="aspect-square w-full rounded-md border border-line object-cover" />
      <div>
        <ul className="space-y-2 text-sm">
          {textos.map((variante, index) => (
            <li key={variante.id}>
              {abierto ? (
                <div className="space-y-1">
                  <input className="h-10 w-full rounded-md border border-line bg-paper px-2" value={variante.titulo} onChange={(event) => setTextos((prev) => prev.map((item, i) => i === index ? { ...item, titulo: event.target.value } : item))} />
                  <textarea className="min-h-16 w-full rounded-md border border-line bg-paper px-2 py-1" value={variante.texto} onChange={(event) => setTextos((prev) => prev.map((item, i) => i === index ? { ...item, texto: event.target.value } : item))} />
                </div>
              ) : (
                <>
                  <p className="font-medium">{variante.titulo}</p>
                  <p className="text-muted">{variante.texto}</p>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          {abierto ? (
            <Button size="sm" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar textos</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>Editar</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Checkout({ producto, onVolver }: { producto: Producto; onVolver: () => void }) {
  const qc = useQueryClient();
  const cotizacion = useQuery({
    queryKey: ["addon-cotizacion", producto.id],
    queryFn: () => cotizarAddon({ data: producto.id }),
  });
  const quote = cotizacion.data;
  const [medio, setMedio] = useState<"transferencia" | "cuenta">("transferencia");
  const [archivo, setArchivo] = useState<{ nombre: string; data: string } | null>(null);
  const [precioOk, setPrecioOk] = useState(false);
  const [usoOk, setUsoOk] = useState(false);
  const confirmar = useMutation({
    mutationFn: () =>
      confirmarAddon({
        data: { productId: producto.id, medio, comprobanteNombre: archivo?.nombre, comprobanteData: archivo?.data, precio: precioOk, uso: usoOk },
      }),
    onSuccess: async (res) => {
      toast.success(res.medio === "cuenta" ? "Pedido enviado. Torre lo habilita." : `Pedido de transferencia por ${res.currency} ${res.amount}. Torre lo habilita.`);
      await qc.invalidateQueries({ queryKey: ["addons"] });
      await qc.invalidateQueries({ queryKey: ["canal-mercado"] });
      onVolver();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface p-4">
      <button type="button" className="text-sm text-leaf" onClick={onVolver}>Volver</button>
      <h2 className="mt-3 font-display text-2xl font-semibold">Checkout</h2>
      <p className="mt-1 font-medium">{producto.name}</p>
      <p className="text-sm text-muted">{producto.description}</p>
      {quote ? (
        <div className="mt-4 space-y-1 text-sm">
          <p className="tabular-nums">Catálogo USD {quote.usd.total} {quote.frequency}</p>
          {quote.ars ? (
            <p className="tabular-nums">Dólar {quote.ars.source} {quote.ars.venta} · a transferir {textoArs(quote.usd.total, quote.ars.venta)}</p>
          ) : (
            <p className="text-terra">No hay dólar para pasar a pesos. Podés dejarlo a cargo en cuenta.</p>
          )}
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className={medio === "transferencia" ? "h-11 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-11 rounded-md border border-line px-3 text-sm"} onClick={() => setMedio("transferencia")}>Transferencia</button>
        <button type="button" className={medio === "cuenta" ? "h-11 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-11 rounded-md border border-line px-3 text-sm"} onClick={() => setMedio("cuenta")}>A cargo en cuenta</button>
      </div>
      {medio === "transferencia" ? (
        <div className="mt-3 space-y-2 text-sm">
          <Destino alias={quote?.medio?.alias} cbu={quote?.medio?.cbu} />
          <label className="block text-xs text-muted">
          Comprobante
          <input className="mt-1 block w-full text-sm" type="file" accept="image/*,.pdf" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 700_000) {
              toast.error("El archivo tiene que pesar menos de 700 KB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setArchivo({ nombre: file.name, data: String(reader.result) });
            reader.readAsDataURL(file);
          }} />
          {archivo ? <span className="mt-1 block">{archivo.nombre}</span> : null}
          </label>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Queda pendiente en dólares, al precio del catálogo. No se convierte ni pide comprobante.</p>
      )}
      <ChecksContrato precio={precioOk} uso={usoOk} onPrecio={setPrecioOk} onUso={setUsoOk} />
      <Button className="mt-4 w-full" disabled={!quote || (medio === "transferencia" && (!quote.ars || !archivo)) || !precioOk || !usoOk || confirmar.isPending} onClick={() => confirmar.mutate()}>
        Confirmar contratación
      </Button>
    </div>
  );
}

function Destino({ alias, cbu }: { alias?: string; cbu?: string }) {
  if (!alias && !cbu) return <p className="text-terra">Torre todavía no cargó el alias ni el CBU.</p>;
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2">
      <p className="text-xs text-muted">Transferí a</p>
      {alias ? <p>Alias {alias}</p> : null}
      {cbu ? <p className="tabular-nums">CBU {cbu}</p> : null}
    </div>
  );
}

function Banners({
  avisos,
  banners,
  puedePublicar,
}: {
  avisos: { id: string; placement: string; startsOn: string; endsOn: string }[];
  banners: { adId: string; plantilla: string; productoId?: string | null; frase: string }[];
  puedePublicar: boolean;
}) {
  const qc = useQueryClient();
  const libres = avisos.filter((aviso) => !banners.some((item) => item.adId === aviso.id));
  const conProducto = banners.some((item) => PLANTILLAS.find((plantilla) => plantilla.id === item.plantilla)?.pideProducto);
  const productos = useQuery({
    queryKey: ["productos-banner"],
    queryFn: () => listProductos(),
    enabled: puedePublicar && (libres.length > 0 || conProducto),
  });
  const publicados = (productos.data ?? []).filter((item) => item.publicadoOnline && item.activo);
  const nombreDe = (id: string | null | undefined) => publicados.find((item) => item.id === id)?.nombre;
  if (avisos.length === 0) return <p className="text-muted">Torre no habilitó un espacio de banner.</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {avisos.map((aviso) => {
          const hecho = banners.find((item) => item.adId === aviso.id);
          const plantilla = PLANTILLAS.find((item) => item.id === hecho?.plantilla);
          return (
            <li key={aviso.id}>
              <p>
                {aviso.placement} · {aviso.startsOn} → {aviso.endsOn}
                {plantilla ? ` · ${plantilla.nombre}` : " · sin banner"}
                {hecho?.frase ? `: ${hecho.frase}` : ""}
                {hecho?.productoId && nombreDe(hecho.productoId) ? ` · ${nombreDe(hecho.productoId)}` : ""}
              </p>
              {puedePublicar && hecho ? (
                <EditarBanner
                  adId={aviso.id}
                  plantilla={hecho.plantilla}
                  productoId={hecho.productoId ?? ""}
                  frase={hecho.frase}
                  productos={publicados.map((item) => ({ id: item.id, nombre: item.nombre }))}
                  onHecho={() => void qc.invalidateQueries({ queryKey: ["canal-mercado"] })}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {puedePublicar && libres.length > 0 ? (
        <Creador key={libres.map((aviso) => aviso.id).join(",")} avisos={libres} productos={publicados} onHecho={() => void qc.invalidateQueries({ queryKey: ["canal-mercado"] })} />
      ) : (
        <p className="text-xs text-muted">
          {libres.length === 0
            ? "Este espacio ya tiene banner. Editalo acá. Una foto nueva no lo pisa: queda en Creativos."
            : "Solo el dueño publica el banner."}
        </p>
      )}
    </div>
  );
}

function Creador({
  avisos,
  productos,
  onHecho,
}: {
  avisos: { id: string; placement: string }[];
  productos: { id: string; nombre: string }[];
  onHecho: () => void;
}) {
  const [adId, setAdId] = useState(avisos[0]?.id ?? "");
  const [plantilla, setPlantilla] = useState<(typeof PLANTILLAS)[number]["id"]>("oferta");
  const [productoId, setProductoId] = useState("");
  const [frase, setFrase] = useState("");
  const elegida = PLANTILLAS.find((item) => item.id === plantilla) ?? PLANTILLAS[0];
  const publicar = useMutation({
    mutationFn: () => publicarBanner({ data: { adId, plantilla, productoId, frase } }),
    onSuccess: () => {
      toast.success("Banner publicado");
      onHecho();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); publicar.mutate(); }}>
      <label className="text-xs text-muted">
        Espacio
        <select className="mt-1 h-11 w-full rounded-md border border-line bg-paper px-2 text-sm text-ink" value={adId} onChange={(event) => setAdId(event.target.value)}>
          {avisos.map((aviso) => <option key={aviso.id} value={aviso.id}>{aviso.placement}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">
        Plantilla
        <select className="mt-1 h-11 w-full rounded-md border border-line bg-paper px-2 text-sm text-ink" value={plantilla} onChange={(event) => setPlantilla(event.target.value as (typeof PLANTILLAS)[number]["id"])}>
          {PLANTILLAS.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
      </label>
      {elegida.pideProducto ? (
        <label className="text-xs text-muted sm:col-span-2">
          Producto publicado
          <select className="mt-1 h-11 w-full rounded-md border border-line bg-paper px-2 text-sm text-ink" value={productoId} onChange={(event) => setProductoId(event.target.value)}>
            <option value="">Elegir</option>
            {productos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select>
        </label>
      ) : (
        <label className="text-xs text-muted sm:col-span-2">
          Texto
          <input className="mt-1 h-11 w-full rounded-md border border-line bg-paper px-2 text-sm text-ink" maxLength={80} value={frase} onChange={(event) => setFrase(event.target.value)} />
        </label>
      )}
      <button type="submit" className="h-11 rounded-md bg-btn px-3 text-sm font-medium text-btn-fg disabled:opacity-50 sm:col-span-2" disabled={publicar.isPending}>Publicar banner</button>
    </form>
  );
}

function EditarBanner({
  adId,
  plantilla,
  productoId,
  frase,
  productos,
  onHecho,
}: {
  adId: string;
  plantilla: string;
  productoId: string;
  frase: string;
  productos: { id: string; nombre: string }[];
  onHecho: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [siguientePlantilla, setSiguientePlantilla] = useState(plantilla);
  const [siguiente, setSiguiente] = useState(productoId);
  const [texto, setTexto] = useState(frase);
  const elegida = PLANTILLAS.find((item) => item.id === siguientePlantilla) ?? PLANTILLAS[0];
  const cambiar = useMutation({
    mutationFn: () => publicarBanner({ data: { adId, plantilla: siguientePlantilla, productoId: siguiente, frase: texto } }),
    onSuccess: () => {
      toast.success("Banner actualizado");
      setAbierto(false);
      onHecho();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!abierto) return <Button size="sm" variant="secondary" className="mt-1" onClick={() => setAbierto(true)}>Editar</Button>;
  return (
    <form className="mt-2 grid gap-2" onSubmit={(event) => { event.preventDefault(); cambiar.mutate(); }}>
      <select className="h-11 rounded-md border border-line bg-paper px-2 text-sm" value={siguientePlantilla} onChange={(event) => setSiguientePlantilla(event.target.value)}>
        {PLANTILLAS.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
      </select>
      {elegida.pideProducto ? (
        <select className="h-11 rounded-md border border-line bg-paper px-2 text-sm" value={siguiente} onChange={(event) => setSiguiente(event.target.value)}>
          <option value="">Elegir producto</option>
          {productos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
      ) : (
        <input className="h-11 rounded-md border border-line bg-paper px-2 text-sm" maxLength={80} value={texto} onChange={(event) => setTexto(event.target.value)} />
      )}
      <Button type="submit" size="sm" disabled={cambiar.isPending}>Guardar</Button>
    </form>
  );
}

