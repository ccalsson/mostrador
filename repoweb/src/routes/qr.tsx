import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { qrsDelPuesto } from "@/lib/sucursales-puesto";

export const Route = createFileRoute("/qr")({ component: Page });

function Page() {
  const datos = useQuery({ queryKey: ["qrs-puesto"], queryFn: () => qrsDelPuesto() });
  const localidades = datos.data?.localidades ?? [];
  const [elegida, setElegida] = useState<string | null>(null);
  const actual = localidades.find((item) => item.id === elegida) ?? localidades.find((item) => item.publicado) ?? null;

  function imprimir(id: string) {
    setElegida(id);
    window.setTimeout(() => window.print(), 60);
  }

  return (
    <AppShell title="QR">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .hoja-qr, .hoja-qr * { visibility: visible; }
          .hoja-qr { position: absolute; inset: 0; margin: 0; }
        }
      `}</style>
      <div className="print:hidden mx-auto max-w-3xl">
        <p className="text-sm text-muted">
          Un cartel por puesto. La dirección es la que escribiste al configurarlo. Quien escanea se registra y queda en ese mostrador.
        </p>
        {datos.isPending ? <p className="mt-4 text-sm text-muted">Leyendo los puestos…</p> : null}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {localidades.map((item) => (
            <li key={item.id} className="rounded-lg border border-line bg-surface p-4">
              <p className="font-medium">{item.nombre}</p>
              <p className="text-sm text-muted">{item.direccion || "Sin dirección"}</p>
              {item.publicado && item.direccion ? (
                <Button className="mt-3" onClick={() => imprimir(item.id)}>Imprimir</Button>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  {!item.direccion
                    ? "Primero escribí la dirección en la identidad de este puesto."
                    : item.prendido
                      ? "El Mercado contratado está en otro puesto."
                      : "Prendé Mercado en Productos, parado en este puesto."}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
      {actual?.publicado && actual.direccion ? (
        <Hoja casa={datos.data?.casa ?? "Puesto"} nombre={actual.nombre} direccion={actual.direccion} puestoId={actual.puestoId} />
      ) : null}
    </AppShell>
  );
}

function Hoja({ casa, nombre, direccion, puestoId }: { casa: string; nombre: string; direccion: string; puestoId: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/mercado?puesto=${puestoId}`;
  useEffect(() => {
    if (!url) return;
    void import("qrcode")
      .then((mod) => mod.default.toDataURL(url, { margin: 1, width: 640 }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);
  return (
    <article className="hoja-qr mx-auto mt-8 w-[180mm] bg-white p-10 text-center text-[#14281c] print:mt-0">
      <p className="text-sm tracking-[0.18em] uppercase">Mercado al Toque</p>
      <h2 className="mt-3 font-display text-4xl font-semibold">{nombre}</h2>
      <p className="mt-1 text-lg">{direccion}</p>
      <p className="text-sm">{casa}</p>
      {qr ? <img src={qr} alt="" className="mx-auto mt-8 size-[78mm]" /> : <div className="mx-auto mt-8 size-[78mm]" />}
      <p className="mt-8 text-2xl font-medium">Escaneá y pedí en este puesto</p>
      <p className="mt-2 text-base">Abrí la cámara. El pedido queda en este puesto.</p>
    </article>
  );
}
