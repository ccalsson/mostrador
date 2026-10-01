import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CONDICION_LABEL, esCondicion, numeroFiscal } from "@/lib/afip-calc";
import { getFactura } from "@/lib/afip-fn";
import { money } from "@/lib/money";

export const Route = createFileRoute("/factura/$id")({ component: FacturaPage });

function fecha(iso: string | null) {
  if (!iso) return "";
  if (/^\d{8}$/.test(iso)) return `${iso.slice(6, 8)}/${iso.slice(4, 6)}/${iso.slice(0, 4)}`;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function FacturaPage() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["factura", id], queryFn: () => getFactura({ data: id }) });
  const f = q.data;
  if (q.error) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center text-ink">
        {(q.error as Error).message}
      </main>
    );
  }
  if (!f) {
    return <main className="grid min-h-dvh place-items-center bg-paper text-muted">Buscando el comprobante…</main>;
  }
  const emisor = f.emisorCondicion ?? "";
  const receptorRaw = f.receptorCondicion ?? "";
  const condicion = esCondicion(emisor) ? CONDICION_LABEL[emisor] : f.emisorCondicion;
  const receptor = esCondicion(receptorRaw) ? CONDICION_LABEL[receptorRaw] : f.receptorCondicion;
  return (
    <main className="min-h-dvh bg-paper px-4 py-6 text-ink">
      <div className="mx-auto mb-4 flex max-w-3xl gap-2 print:hidden">
        <Button onClick={() => window.print()}>Imprimir</Button>
        <Link to="/remitos" className="inline-flex h-11 items-center rounded-md border border-line px-4 text-sm">
          Volver
        </Link>
      </div>
      <article id="factura-print" className="mx-auto max-w-3xl bg-white p-6 text-black">
        {f.ambiente === "homo" ? (
          <p className="mb-3 border border-black px-2 py-1 text-center text-sm font-medium">
            HOMOLOGACIÓN — sin validez fiscal
          </p>
        ) : null}
        <header className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 border border-black">
          <div className="p-3 text-sm">
            <p className="text-lg font-semibold">{f.emisorRazon}</p>
            <p>{condicion}</p>
            <p>{f.emisorDomicilio}</p>
          </div>
          <div className="border-x border-black px-4 py-3 text-center">
            <p className="font-display text-3xl font-semibold">{f.nombre.split(" ").pop()}</p>
            <p className="text-xs">Código {String(f.cbteTipo).padStart(3, "0")}</p>
          </div>
          <div className="p-3 text-sm">
            <p className="font-medium">{f.nombre}</p>
            <p>Nº {f.numero ? numeroFiscal(f.puntoVenta, f.numero) : "—"}</p>
            <p>Fecha {fecha(f.fecha)}</p>
            <p>CUIT {f.emisorCuit}</p>
            <p>IIBB {f.emisorIibb || "—"}</p>
            <p>Inicio {fecha(f.emisorInicio)}</p>
          </div>
        </header>
        <p className="mt-3 text-sm">
          Cliente: {f.receptorNombre} · {receptor}
          {f.docNro && f.docNro !== "0" ? ` · Doc ${f.docNro}` : ""}
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 font-medium">Cant.</th>
              <th className="font-medium">Detalle</th>
              <th className="text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {f.lineas.map((l, i) => (
              <tr key={i} className="border-b border-black/20">
                <td className="py-1">
                  {l.cantidad} {l.unidad}
                </td>
                <td>{l.nombre}</td>
                <td className="text-right tabular-nums">{money(l.neto, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 ml-auto w-56 text-sm">
          <p className="flex justify-between">
            <span>Neto gravado</span>
            <span className="tabular-nums">{money(f.neto, true)}</span>
          </p>
          <p className="flex justify-between">
            <span>IVA {f.alicuota}%</span>
            <span className="tabular-nums">{money(f.iva, true)}</span>
          </p>
          <p className="mt-1 flex justify-between border-t border-black pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(f.total, true)}</span>
          </p>
        </div>
        <p className="mt-2 text-xs">El precio del puesto incluye IVA. El total coincide con lo cobrado.</p>
        <footer className="mt-4 flex items-end justify-between gap-4 border-t border-black pt-3 text-sm">
          <div>
            <p>CAE {f.cae}</p>
            <p>Vencimiento {fecha(f.caeVto)}</p>
            <p className="text-xs">Comprobante autorizado por ARCA</p>
          </div>
          {f.qr ? <img src={f.qr} alt="QR ARCA" className="size-28" /> : null}
        </footer>
      </article>
    </main>
  );
}
