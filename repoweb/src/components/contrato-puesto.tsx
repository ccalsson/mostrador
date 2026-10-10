import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  aceptarContratoPuesto,
  leerCapacidadesPuesto,
  leerHistorialContratoPuesto,
  leerContratoPuesto,
  leerResumenSuscripcionPuesto,
  type CapacidadesPuesto,
  type ContratoPuesto as ContratoPuestoData,
  type HistorialContratoPuesto,
  type ResumenSuscripcionPuesto,
} from "@/lib/central/suscripcion-fn";
import { textoCondicion } from "@/lib/torre/condiciones";

function codigo(err: unknown) {
  if (typeof err === "object" && err !== null && "code" in err && typeof err.code === "string") return err.code;
  return "";
}

function fecha(iso: string | null | undefined) {
  if (!iso) return "";
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : iso;
}

function importe(currency: string, amount: number) {
  const texto = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${currency} ${texto}`;
}

function avisoPlan(err: unknown) {
  if (["sin_suscripcion", "tenant_not_linked", "subscription_not_found"].includes(codigo(err))) {
    return "Todavía no hay un plan asignado a este puesto.";
  }
  return "No se pudo leer el plan. Probá de nuevo en un momento.";
}

function etiquetaEstado(estado: string) {
  const estados: Record<string, string> = {
    activa: "Activa",
    cancelada: "Cancelada",
    prueba: "Prueba",
    vencida: "Vencida",
  };
  return estados[estado] ?? estado;
}

function etiquetaTier(tier: string | null) {
  if (tier === "pro") return "Pro";
  if (tier === "presencia") return "Presencia";
  return "";
}

export function ContratoPuesto() {
  const [online, setOnline] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [resumen, setResumen] = useState<ResumenSuscripcionPuesto | null>(null);
  const [avisoSuscripcion, setAvisoSuscripcion] = useState<string | null>(null);
  const [contrato, setContrato] = useState<ContratoPuestoData | null>(null);
  const [historial, setHistorial] = useState<HistorialContratoPuesto["entradas"]>([]);
  const [capacidades, setCapacidades] = useState<CapacidadesPuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisoContrato, setAvisoContrato] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [sub, legal, historialResult, caps] = await Promise.allSettled([
      leerResumenSuscripcionPuesto(),
      leerContratoPuesto(),
      leerHistorialContratoPuesto(),
      leerCapacidadesPuesto(),
    ]);

    if (sub.status === "fulfilled") {
      setResumen(sub.value);
      setAvisoSuscripcion(null);
    } else {
      setResumen(null);
      setAvisoSuscripcion(avisoPlan(sub.reason));
    }

    if (legal.status === "fulfilled") {
      setContrato(legal.value);
      setAvisoContrato(null);
    } else if (codigo(legal.reason) === "contrato_no_encontrado") {
      setContrato(null);
      setAvisoContrato(null);
    } else {
      setContrato(null);
      setAvisoContrato("No se pudo leer el texto del contrato.");
    }

    setHistorial(historialResult.status === "fulfilled" ? historialResult.value.entradas : []);
    setCapacidades(caps.status === "fulfilled" ? caps.value : null);

    const fallos = [sub, legal, historialResult, caps]
      .filter((item): item is PromiseRejectedResult => item.status === "rejected");
    if (fallos.some(({ reason }) => ["unauthorized", "unauthenticated"].includes(codigo(reason)))) {
      setError("La sesión venció. Salí y volvé a entrar.");
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    const marcar = () => setOnline(navigator.onLine);
    marcar();
    window.addEventListener("online", marcar);
    window.addEventListener("offline", marcar);
    return () => {
      window.removeEventListener("online", marcar);
      window.removeEventListener("offline", marcar);
    };
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function aceptar() {
    if (!contrato || !resumen?.pendiente.hayPendiente) return;
    setOcupado(true);
    setError(null);
    try {
      await aceptarContratoPuesto({
        data: {
          documentoId: contrato.documentoId,
          version: contrato.version,
          hash: contrato.hash,
        },
      });
      await cargar();
    } catch (err) {
      const code = codigo(err);
      setError(code === "offline"
        ? "Sin conexión no se puede aceptar."
        : code === "version_obsoleta" || code === "hash_mismatch"
          ? "El contrato cambió. Actualizá la página y revisá la nueva versión."
          : "No se pudo aceptar. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted">Cargando el contrato…</p>;

  const suscripcion = resumen?.suscripcion;
  const pendiente = Boolean(
    resumen?.pendiente.hayPendiente &&
    contrato &&
    contrato.documentoId === resumen.pendiente.documentoId &&
    contrato.version === resumen.pendiente.version &&
    contrato.hash === resumen.pendiente.hash,
  );
  const comision = textoCondicion(capacidades?.comision);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {error ? <p className="text-sm text-terra">{error}</p> : null}
      {!online ? <p className="text-sm text-terra">Sin conexión no se puede aceptar.</p> : null}

      <section className="rounded-lg border border-line border-t-2 border-t-leaf bg-surface p-4">
        <h2 className="font-display text-xl font-semibold">Tu plan</h2>
        {avisoSuscripcion ? <p className="mt-2 text-sm text-muted">{avisoSuscripcion}</p> : null}
        {suscripcion ? (
          <div className="mt-3">
            <p className="text-sm">
              <span className="font-medium">{suscripcion.plan.nombre}</span>
              <Badge className="ml-2" tone={suscripcion.estado === "activa" ? "ok" : "muted"}>
                {etiquetaEstado(suscripcion.estado)}
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted">
              Desde {fecha(suscripcion.inicio)}
              {suscripcion.proximaRenovacion ? ` · próximo pago ${fecha(suscripcion.proximaRenovacion)}` : ""}
            </p>
            <p className="mt-2 text-sm">
              {importe(resumen.precioVigente.moneda, resumen.precioVigente.monto)} · {resumen.precioVigente.periodo}
            </p>
            {resumen.condicionesComerciales ? (
              <p className="mt-2 text-sm text-muted">{resumen.condicionesComerciales.resumen}</p>
            ) : null}
          </div>
        ) : null}
        {resumen?.addons.some((addon) => addon.activo) ? (
          <>
            <h3 className="mt-4 font-medium">Servicios extra</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {resumen.addons.filter((addon) => addon.activo).map((addon) => (
                <li key={addon.codigo}>
                  {addon.nombre}{addon.detalle ? ` · ${addon.detalle}` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="font-display text-xl font-semibold">Qué incluye</h2>
        {capacidades ? (
          <ul className="mt-3 space-y-2 text-sm">
            <li>{capacidades.presencia ? `Mercado al Toque: ${etiquetaTier(capacidades.tier)}.` : "Mercado al Toque no está incluido."}</li>
            <li>{capacidades.cuentaCorriente ? "Cuenta corriente incluida." : "Cuenta corriente no incluida."}</li>
            {capacidades.packs.map((pack) => (
              <li key={pack.product}>{pack.product}: {pack.remaining} envíos de {pack.quantity}.</li>
            ))}
            {capacidades.avisos.map((aviso) => (
              <li key={aviso.id}>
                Aviso {aviso.placement} · {fecha(aviso.startsOn)} a {fecha(aviso.endsOn)} · {importe(aviso.currency, aviso.price)}
              </li>
            ))}
            {capacidades.packs.length === 0 && capacidades.avisos.length === 0 ? (
              <li className="text-muted">Sin packs ni avisos vigentes.</li>
            ) : null}
            {comision ? <li className="text-muted">{comision}</li> : null}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No se pudo leer qué incluye el plan.</p>
        )}
      </section>

      {contrato ? (
        <section className={`rounded-lg border border-line bg-surface p-4${pendiente ? " border-t-2 border-t-naranja" : ""}`}>
          <h2 className="font-display text-xl font-semibold">{pendiente ? "Para aceptar" : "Contrato vigente"}</h2>
          <p className="mt-3 font-medium">{contrato.titulo}</p>
          <p className="text-xs text-muted">Versión {contrato.version}</p>
          {contrato.contenido.valor ? (
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-paper p-3 font-sans text-sm leading-relaxed">
              {contrato.contenido.valor}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-terra">El texto no está disponible. No se puede aceptar.</p>
          )}
          {pendiente ? (
            <Button
              className="mt-3"
              disabled={!online || !contrato.contenido.valor || ocupado}
              onClick={() => void aceptar()}
            >
              {ocupado ? "Aceptando…" : "Aceptar"}
            </Button>
          ) : null}
        </section>
      ) : avisoContrato ? (
        <p className="text-sm text-terra">{avisoContrato}</p>
      ) : null}

      {historial.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="font-display text-xl font-semibold">Historial de contratos</h2>
          <ul className="mt-3 space-y-3">
            {historial.map((item) => (
              <li key={`${item.documentoId}-${item.version}`}>
                <p className="font-medium">Contrato · versión {item.version}</p>
                <p className="text-xs text-muted">
                  {item.estado} · vigente desde {fecha(item.fechaDesde)}
                  {item.aceptacion ? ` · aceptado ${fecha(item.aceptacion.fecha)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!pendiente && !avisoContrato ? (
        <p className="text-sm text-muted">No hay un contrato pendiente de aceptación.</p>
      ) : null}
    </div>
  );
}
