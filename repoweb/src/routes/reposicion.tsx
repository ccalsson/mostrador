import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { planDelPuesto } from "@/lib/plan-puesto";
import { guardarDiasReposicion, leerReposicion } from "@/lib/reposicion-fn";
import { nombreDia } from "@/lib/reposicion-calculo";

export const Route = createFileRoute("/reposicion")({ component: Page });

const ORDEN = [1, 2, 3, 4, 5, 6, 0];

function Page() {
  return (
    <AppShell title="Reposición">
      <Pantalla />
    </AppShell>
  );
}

function Pantalla() {
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ["plan-puesto"], queryFn: () => planDelPuesto() });
  const datos = useQuery({
    queryKey: ["reposicion"],
    queryFn: () => leerReposicion(),
    enabled: plan.data?.premium === true,
  });
  const [dias, setDias] = useState<number[]>([]);
  useEffect(() => {
    if (datos.data) setDias(datos.data.dias);
  }, [datos.data]);
  const guardar = useMutation({
    mutationFn: () => guardarDiasReposicion({ data: dias }),
    onSuccess: async () => {
      toast.success("Días guardados");
      await qc.invalidateQueries({ queryKey: ["reposicion"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (plan.isPending) return <p className="text-sm text-muted">Leyendo el plan…</p>;
  if (!plan.data?.premium) {
    return (
      <p className="max-w-lg rounded-lg border border-line bg-surface px-4 py-6 text-sm text-muted">
        La reposición es del plan Premium. Caja, puesto y stock siguen disponibles.
      </p>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">Días de recepción</h2>
        <p className="mt-1 text-sm text-muted">El puesto los carga. No hay un día fijo. La cuenta usa lo vendido en esas mismas franjas.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ORDEN.map((dia) => {
            const activo = dias.includes(dia);
            return (
              <button
                key={dia}
                type="button"
                onClick={() => setDias(activo ? dias.filter((item) => item !== dia) : [...dias, dia])}
                className={activo ? "h-9 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-9 rounded-md border border-line px-3 text-sm"}
              >
                {nombreDia(dia)}
              </button>
            );
          })}
        </div>
        <Button className="mt-3" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar días</Button>
      </section>
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">Qué reponer</h2>
        {datos.data?.hasta ? <p className="mt-1 text-sm text-muted">Cubre {datos.data.hasta}, hasta la próxima recepción.</p> : <p className="mt-1 text-sm text-muted">Primero elegí los días.</p>}
        <ul className="mt-3 divide-y divide-line">
          {(datos.data?.filas ?? []).map((fila) => (
            <li key={fila.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span>{fila.nombre}</span>
              <span className="tabular-nums">{fila.cantidad} {fila.unidad}</span>
            </li>
          ))}
          {datos.data && datos.data.dias.length > 0 && datos.data.filas.length === 0 ? (
            <li className="py-2 text-sm text-muted">Con el stock de hoy no hace falta reponer.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
