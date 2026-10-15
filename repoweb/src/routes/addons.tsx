import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { catalogoAddons, confirmarAddon, cotizarAddon } from "@/lib/fn";
import { textoArs } from "@/lib/torre/reglas";
import { ChecksContrato } from "@/components/checks-contrato";

export const Route = createFileRoute("/addons")({ component: Page });

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
    : [linea(producto.recurringUsd, " / mes"), linea(producto.setupUsd, " de alta")];
  return partes.filter(Boolean).join(" · ") || "Sin precio en el catálogo";
}

function Page() {
  return (
    <AppShell title="Add-ons">
      <Lista />
    </AppShell>
  );
}

function Lista() {
  const catalogo = useQuery({ queryKey: ["addons"], queryFn: () => catalogoAddons() });
  const [elegido, setElegido] = useState<string | null>(null);
  const venta = catalogo.data?.dolar?.venta ?? null;
  const productos = (catalogo.data?.productos ?? []).filter((item) => item.kind === "addon");
  const contratados = new Set(catalogo.data?.contratados ?? []);
  const pendientes = new Set(catalogo.data?.pendientes ?? []);
  const producto = productos.find((item) => item.id === elegido) ?? null;

  if (producto) {
    return <Checkout producto={producto} onVolver={() => setElegido(null)} />;
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted">
        La lista y los precios salen del catálogo. Contratar abre el checkout. El importe lo fija el servidor.
      </p>
      {catalogo.isPending ? <p className="text-sm text-muted">Leyendo el catálogo…</p> : null}
      {catalogo.isError ? <p className="text-sm text-terra">No se pudo leer el catálogo.</p> : null}
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {productos.length === 0 && !catalogo.isPending ? <li className="px-3 py-3 text-sm text-muted">No hay add-ons en el catálogo.</li> : null}
        {productos.map((item) => {
          const ya = item.billing === "recurring" && contratados.has(item.id);
          const espera = pendientes.has(item.id);
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted">{item.description}</p>
                <p className="text-sm tabular-nums">{etiquetaPrecio(item, venta)}</p>
              </div>
              {ya ? (
                <span className="text-sm text-leaf">Contratado</span>
              ) : espera ? (
                <span className="text-sm text-muted">Esperando habilitación</span>
              ) : (
                <Button onClick={() => setElegido(item.id)}>Contratar</Button>
              )}
            </li>
          );
        })}
      </ul>
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
        data: {
          productId: producto.id,
          medio,
          comprobanteNombre: archivo?.nombre,
          comprobanteData: archivo?.data,
          precio: precioOk,
          uso: usoOk,
        },
      }),
    onSuccess: async (res) => {
      toast.success(res.medio === "cuenta" ? "Pedido enviado. Torre lo habilita." : `Pedido de transferencia por ${res.currency} ${res.amount}. Torre lo habilita.`);
      await qc.invalidateQueries({ queryKey: ["addons"] });
      await qc.invalidateQueries({ queryKey: ["canal-mercado"] });
      onVolver();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const faltaComprobante = medio === "transferencia" && !archivo;

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface p-4">
      <button type="button" className="text-sm text-leaf" onClick={onVolver}>
        Volver a la lista
      </button>
      <h2 className="mt-3 font-display text-2xl font-semibold">Checkout</h2>
      <p className="mt-1 font-medium">{producto.name}</p>
      <p className="text-sm text-muted">{producto.description}</p>
      {cotizacion.isPending ? <p className="mt-4 text-sm text-muted">Cotizando…</p> : null}
      {cotizacion.isError ? <p className="mt-4 text-sm text-terra">No se pudo cotizar.</p> : null}
      {quote ? (
        <div className="mt-4 space-y-1 text-sm">
          <p className="tabular-nums">
            Catálogo USD {quote.usd.total} {quote.frequency}
          </p>
          {quote.ars ? (
            <p className="tabular-nums">
              Dólar {quote.ars.source} {quote.ars.venta} · a transferir {textoArs(quote.usd.total, quote.ars.venta)}
            </p>
          ) : (
            <p className="text-terra">No hay dólar para pasar a pesos. Podés dejarlo a cargo en cuenta.</p>
          )}
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={medio === "transferencia" ? "h-11 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-11 rounded-md border border-line px-3 text-sm"}
          onClick={() => setMedio("transferencia")}
        >
          Transferencia
        </button>
        <button
          type="button"
          className={medio === "cuenta" ? "h-11 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-11 rounded-md border border-line px-3 text-sm"}
          onClick={() => setMedio("cuenta")}
        >
          A cargo en cuenta
        </button>
      </div>
      {medio === "transferencia" ? (
        <div className="mt-3 space-y-2 text-sm">
          <Destino alias={quote?.medio?.alias} cbu={quote?.medio?.cbu} />
          <label className="block text-xs text-muted">
          Comprobante
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 700_000) {
                toast.error("El archivo tiene que pesar menos de 700 KB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setArchivo({ nombre: file.name, data: String(reader.result) });
              reader.readAsDataURL(file);
            }}
          />
          {archivo ? <span className="mt-1 block">{archivo.nombre}</span> : null}
        </label>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Queda pendiente en dólares, al precio del catálogo. No se convierte ni pide comprobante.</p>
      )}
      <ChecksContrato precio={precioOk} uso={usoOk} onPrecio={setPrecioOk} onUso={setUsoOk} />
      <Button className="mt-4 w-full" disabled={!quote || (medio === "transferencia" && !quote.ars) || faltaComprobante || !precioOk || !usoOk || confirmar.isPending} onClick={() => confirmar.mutate()}>
        Confirmar contratación
      </Button>
      <p className="mt-2 text-xs text-muted">El pedido llega a Torre. El servicio no se prende hasta que lo habiliten. El cobro no se marca como pagado.</p>
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
