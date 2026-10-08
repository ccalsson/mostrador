import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TorreShell } from "@/components/torre-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addAccess, listAccess, removeAccess } from "@/lib/torre-fn";
import { listFx, saveFx } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/configuracion")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["torre-acceso"], queryFn: () => listAccess() });
  const cambios = useQuery({ queryKey: ["torre-fx"], queryFn: () => listFx() });
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("soporte");
  const [fuente, setFuente] = useState("dólar oficial vendedor Banco Nación");
  const [fecha, setFecha] = useState("2026-10-07");
  const [valor, setValor] = useState("");
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
