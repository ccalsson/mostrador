import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CentralClientError,
  aceptarContrato,
  etiquetaCargo,
  etiquetaEstado,
  leerAddons,
  leerCapacidades,
  leerPendientes,
  leerSuscripcion,
  leerVigentes,
  textoImporte,
  type LineaCentral,
  type PendienteCentral,
  type SuscripcionCentral,
  type VigenteCentral,
} from "@/lib/central/cliente";
import { textoCondicion } from "@/lib/torre/condiciones";

function codigo(err: unknown) {
  return err instanceof CentralClientError ? err.code : "";
}

function fecha(iso: string | null | undefined) {
  if (!iso) return "";
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : iso;
}

function avisoPlan(code: string) {
  if (code === "subscription_not_found" || code === "tenant_not_linked") return "Todavía no hay un plan asignado a este puesto.";
  return "No se pudo leer el plan. Probá de nuevo en un momento.";
}

function etiquetaTier(tier: string | null | undefined) {
  if (tier === "pro") return "Pro";
  if (tier === "presencia") return "Presencia";
  return "";
}

export function ContratoPuesto() {
  const [online, setOnline] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [suscripcion, setSuscripcion] = useState<SuscripcionCentral | null>(null);
  const [addons, setAddons] = useState<LineaCentral[]>([]);
  const [avisoSuscripcion, setAvisoSuscripcion] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<PendienteCentral[]>([]);
  const [vigentes, setVigentes] = useState<VigenteCentral[]>([]);
  const [capacidades, setCapacidades] = useState<Awaited<ReturnType<typeof leerCapacidades>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [sub, extra, pending, current, caps] = await Promise.allSettled([
      leerSuscripcion(),
      leerAddons(),
      leerPendientes("mostrador"),
      leerVigentes("mostrador"),
      leerCapacidades(),
    ]);
    if (sub.status === "fulfilled") {
      setSuscripcion(sub.value.subscription);
      setAvisoSuscripcion(null);
    } else {
      setSuscripcion(null);
      setAvisoSuscripcion(avisoPlan(codigo(sub.reason)));
    }
    setAddons(extra.status === "fulfilled" ? extra.value.addons : []);
    setPendientes(pending.status === "fulfilled" ? pending.value.pending : []);
    setVigentes(current.status === "fulfilled" ? current.value.current : []);
    setCapacidades(caps.status === "fulfilled" ? caps.value : null);
    const falloSesion = [pending, current].find((item) => item.status === "rejected" && codigo(item.reason) === "unauthenticated");
    if (falloSesion && falloSesion.status === "rejected") setError("La sesión venció. Salí y volvé a entrar.");
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

  async function aceptar(id: string) {
    setOcupado(id);
    setError(null);
    try {
      await aceptarContrato("mostrador", id);
      await cargar();
    } catch (err) {
      setError(codigo(err) === "offline" ? "Sin conexión no se puede aceptar." : "No se pudo aceptar. Probá de nuevo.");
    } finally {
      setOcupado(null);
    }
  }

  if (cargando) return <p className="text-sm text-muted">Cargando el contrato…</p>;

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
              <span className="font-medium">{suscripcion.plan.name}</span>
              <Badge className="ml-2" tone={suscripcion.status === "active" ? "ok" : "muted"}>
                {etiquetaEstado(suscripcion.status)}
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted">
              Desde {fecha(suscripcion.startDate)}
              {suscripcion.nextPaymentDate ? ` · próximo pago ${fecha(suscripcion.nextPaymentDate)}` : ""}
            </p>
            <ul className="mt-3 divide-y divide-line">
              {suscripcion.lines.map((linea) => (
                <Linea key={linea.id} linea={linea} />
              ))}
            </ul>
            {suscripcion.grants.some((grant) => grant.conditions) ? (
              <ul className="mt-3 space-y-1 text-sm text-muted">
                {suscripcion.grants
                  .filter((grant) => grant.conditions)
                  .map((grant) => (
                    <li key={`${grant.startsOn}-${grant.conditions}`}>
                      Beneficio{grant.endsOn ? ` hasta ${fecha(grant.endsOn)}` : ""}: {grant.conditions}
                    </li>
                  ))}
              </ul>
            ) : null}
            {comision ? <p className="mt-3 text-sm text-muted">{comision}</p> : null}
          </div>
        ) : null}
      </section>

      {addons.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="font-display text-xl font-semibold">Servicios extra</h2>
          <ul className="mt-2 divide-y divide-line">
            {addons.map((linea) => (
              <Linea key={linea.id} linea={linea} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="font-display text-xl font-semibold">Qué incluye</h2>
        {capacidades ? (
          <ul className="mt-3 space-y-2 text-sm">
            <li>{capacidades.presencia ? `Mercado al Toque: ${etiquetaTier(capacidades.tier)}.` : "Mercado al Toque no está incluido."}</li>
            <li>{capacidades.cuentaCorriente ? "Cuenta corriente incluida." : "Cuenta corriente no incluida."}</li>
            {capacidades.packs.map((pack) => (
              <li key={pack.product}>
                {pack.product}: {pack.remaining} envíos de {pack.quantity}.
              </li>
            ))}
            {capacidades.avisos.map((aviso) => (
              <li key={aviso.id}>
                Aviso {aviso.placement} · {fecha(aviso.startsOn)} a {fecha(aviso.endsOn)} · {textoImporte(aviso.currency, aviso.price)}
              </li>
            ))}
            {capacidades.packs.length === 0 && capacidades.avisos.length === 0 ? (
              <li className="text-muted">Sin packs ni avisos vigentes.</li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No se pudo leer qué incluye el plan.</p>
        )}
      </section>

      {pendientes.length > 0 ? (
        <section className="rounded-lg border border-line border-t-2 border-t-naranja bg-surface p-4">
          <h2 className="font-display text-xl font-semibold">Para aceptar</h2>
          <ul className="mt-3 space-y-4">
            {pendientes.map((item) => (
              <li key={item.id}>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted">Versión {item.version}</p>
                {item.body ? (
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-paper p-3 font-sans text-sm leading-relaxed">
                    {item.body}
                  </pre>
                ) : (
                  <p className="mt-2 text-sm text-terra">El texto no está disponible. No se puede aceptar.</p>
                )}
                <Button className="mt-3" disabled={!online || !item.body || ocupado === item.id} onClick={() => void aceptar(item.id)}>
                  {ocupado === item.id ? "Aceptando…" : "Aceptar"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {vigentes.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="font-display text-xl font-semibold">Ya aceptado</h2>
          <ul className="mt-3 space-y-3">
            {vigentes.map((item) => (
              <li key={`${item.title}-${item.version}`}>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted">Versión {item.version}</p>
                {item.body ? (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-paper p-3 font-sans text-sm leading-relaxed">
                    {item.body}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pendientes.length === 0 && vigentes.length === 0 ? (
        <p className="text-sm text-muted">No hay un contrato pendiente de aceptación.</p>
      ) : null}
    </div>
  );
}

function Linea({ linea }: { linea: LineaCentral }) {
  return (
    <li className="py-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-medium">
          {linea.product}
          <span className="ml-2 text-xs font-normal text-muted">{etiquetaCargo(linea.charge, linea.frequency)}</span>
        </p>
        <p className="shrink-0 tabular-nums">{textoImporte(linea.currency, linea.amountDue)}</p>
      </div>
      {linea.frozen ? <p className="text-xs text-muted">Precio fijo</p> : null}
      {linea.quantity !== 1 ? <p className="text-xs text-muted">Cantidad {linea.quantity}</p> : null}
    </li>
  );
}
