import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TorreShell } from "@/components/torre-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addAccess, borrarDatosDemo, listAccess, removeAccess, vistaDatosDemo } from "@/lib/torre-fn";
import type { VistaDemoLimpieza } from "@/lib/torre/demo-limpieza";
import { TENANT_ID } from "@/lib/catalog";
import { listFx, saveFx, leerMedioPago, guardarMedioPago } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/configuracion")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-acceso"], queryFn: () => listAccess() });
  const cambios = useQuery({ queryKey: ["torre-fx"], queryFn: () => listFx() });
  const medio = useQuery({ queryKey: ["torre-medio"], queryFn: () => leerMedioPago() });
  const [alias, setAlias] = useState("");
  const [cbu, setCbu] = useState("");
  const [medioCargado, setMedioCargado] = useState(false);
  useEffect(() => {
    if (!medio.data || medioCargado) return;
    setAlias(medio.data.medio.alias);
    setCbu(medio.data.medio.cbu);
    setMedioCargado(true);
  }, [medio.data, medioCargado]);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("soporte");
  const [fuente, setFuente] = useState("dólar oficial vendedor Banco Nación");
  const [fecha, setFecha] = useState("2026-10-07");
  const [valor, setValor] = useState("");
  const [vista, setVista] = useState<VistaDemoLimpieza | null>(null);
  const [palabra, setPalabra] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const verDemo = async () => {
    setOcupado(true);
    try {
      setVista(await vistaDatosDemo({ data: { tenantId: TENANT_ID } }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const borrarDemo = async () => {
    setOcupado(true);
    try {
      const r = await borrarDatosDemo({ data: { tenantId: TENANT_ID, confirmacion: palabra } });
      toast.success(`Se llevaron ${r.borrado} filas. Stock restaurado en ${r.stockRestaurado} productos.`);
      setPalabra("");
      setVista(await vistaDatosDemo({ data: { tenantId: TENANT_ID } }));
      await qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const vigente = cambios.data?.[0];
  return (
    <TorreShell title="Configuración">
      <section className="mb-6">
        <h2 className="font-medium">Tipo de cambio de referencia</h2>
        <p className="mt-1 text-sm text-muted">
          {vigente ? `${vigente.source}: ${vigente.usdArs} ARS por USD al ${vigente.asOf}. No reescribe contratos.` : "Sin cotización."}
        </p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_8rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void saveFx({ data: { source: fuente, asOf: fecha, usdArs: Number(valor) } })
              .then(async () => {
                setValor("");
                toast.success("Cotización guardada");
                await qc.invalidateQueries({ queryKey: ["torre-fx"] });
              })
              .catch((err: Error) => toast.error(err.message));
          }}
        >
          <Input value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="Fuente" required />
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ARS por USD" required />
          <Button type="submit">Guardar</Button>
        </form>
      </section>
      <section className="mb-6">
        <h2 className="font-medium">Medios de pago</h2>
        <p className="mt-1 text-sm text-muted">
          {medio.data?.medio?.alias || medio.data?.medio?.cbu
            ? `Transferencia: ${[medio.data.medio.alias ? `alias ${medio.data.medio.alias}` : "", medio.data.medio.cbu ? `CBU ${medio.data.medio.cbu}` : ""].filter(Boolean).join(" · ")}. El puesto lo ve al contratar.`
            : "Todavía no hay alias ni CBU. Sin eso el puesto no sabe a dónde transferir."}
        </p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void guardarMedioPago({ data: { alias, cbu } })
              .then(async () => {
                toast.success("Medio de pago guardado");
                await qc.invalidateQueries({ queryKey: ["torre-medio"] });
              })
              .catch((err: Error) => toast.error(err.message));
          }}
        >
          <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias" />
          <Input value={cbu} onChange={(e) => setCbu(e.target.value)} placeholder="CBU, 22 números" inputMode="numeric" />
          <Button type="submit">Guardar</Button>
        </form>
        <p className="mt-2 text-xs text-muted">La tarjeta queda para más adelante.</p>
      </section>
      <section className="mb-6 rounded-lg border border-terra p-4">
        <h2 className="font-medium">Borrar datos de prueba del puesto demo</h2>
        <p className="mt-1 text-sm text-muted">
          Vacía las operaciones y los clientes de <span className="font-medium">{TENANT_ID}</span> y deja el
          catálogo, los usuarios del puesto y la config intactos. No se puede deshacer.
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => void verDemo()} disabled={ocupado}>
            Ver qué se borraría
          </Button>
          {vista ? (
            <Button
              variant="secondary"
              onClick={() => void borrarDemo()}
              disabled={ocupado || vista.total === 0 || palabra.trim().toUpperCase() !== "BORRAR"}
            >
              Borrar {vista.total} filas
            </Button>
          ) : null}
        </div>
        {vista ? (
          <div className="mt-3 text-sm">
            <p className="text-muted">
              Se borran {vista.total} filas. El catálogo ({vista.catalogo} productos) no se toca.
            </p>
            {vista.clientesConCuenta > 0 ? (
              <p className="mt-1 text-terra">
                {vista.clientesConCuenta} de esos clientes tienen cuenta del portal: se quedan sin ficha y el
                login del portal queda cojo.
              </p>
            ) : null}
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {vista.detalle.map((f) => (
                <li key={f.tabla} className="flex justify-between gap-3 border-b border-line">
                  <span className="text-muted">{f.tabla}</span>
                  <span className="tabular-nums">{f.filas}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Input
                value={palabra}
                onChange={(e) => setPalabra(e.target.value)}
                placeholder="Escribí BORRAR"
                className="max-w-40"
              />
            </div>
          </div>
        ) : null}
      </section>
      <p className="mb-3 text-sm text-muted">Solo estas cuentas pueden abrir la Torre. El puesto no entra.</p>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addAccess({ data: { email, role: rol } })
            .then(async () => {
              setEmail("");
              toast.success("Acceso agregado");
              await qc.invalidateQueries({ queryKey: ["torre-acceso"] });
            })
            .catch((err: Error) => toast.error(err.message));
        }}
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo autorizado" required />
        <select className="rounded-md border border-line bg-surface px-2 text-sm" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="administracion">Administración</option>
          <option value="comercial">Comercial</option>
          <option value="legal">Legal</option>
          <option value="soporte">Soporte</option>
          <option value="auditoria">Auditoría</option>
        </select>
        <Button type="submit">Agregar</Button>
      </form>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(lista.data?.accounts ?? []).map((item) => (
          <li key={item.email} className="flex items-center justify-between px-3 py-2">
            <span>{item.email} · {item.role}{item.email === lista.data?.me ? " · vos" : ""}</span>
            {item.email === lista.data?.me ? null : (
              <button
                type="button"
                className="text-xs text-terra"
                onClick={() => void removeAccess({ data: item.email }).then(() => qc.invalidateQueries({ queryKey: ["torre-acceso"] })).catch((err: Error) => toast.error(err.message))}
              >
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>
    </TorreShell>
  );
}
