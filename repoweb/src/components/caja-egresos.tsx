import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CATEGORIAS_EGRESO, cargarEgreso, egresosDelTurno } from "@/lib/caja-egresos";
import { money } from "@/lib/money";

export function CajaEgresos({ verMontos }: { verMontos: boolean }) {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["caja-egresos"], queryFn: () => egresosDelTurno(), refetchInterval: 4000 });
  const [categoria, setCategoria] = useState("servicios");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState("efectivo");
  const cargar = useMutation({
    mutationFn: () => cargarEgreso({ data: { categoria, concepto, monto: Number(monto), medio } }),
    onSuccess: async () => {
      toast.success("Egreso anotado.");
      setConcepto("");
      setMonto("");
      await qc.invalidateQueries({ queryKey: ["caja-egresos"] });
      await qc.invalidateQueries({ queryKey: ["caja"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h2 className="text-sm font-medium">Egresos del turno</h2>
      <p className="mt-1 text-xs text-muted">
        En efectivo sale de la caja. Transferencia u otro queda en el negocio y no mueve el efectivo.
      </p>
      <form
        className="mt-2 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          cargar.mutate();
        }}
      >
        <select className="h-10 rounded-md border border-line bg-paper px-2 text-sm" value={categoria} onChange={(event) => setCategoria(event.target.value)}>
          {CATEGORIAS_EGRESO.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <input className="h-10 rounded-md border border-line bg-paper px-3 text-sm" value={concepto} onChange={(event) => setConcepto(event.target.value)} placeholder="Alquiler, combustible, flete" />
        <div className="grid grid-cols-2 gap-2">
          <input className="h-10 rounded-md border border-line bg-paper px-3 text-sm" inputMode="decimal" value={monto} onChange={(event) => setMonto(event.target.value)} placeholder="Monto" />
          <select className="h-10 rounded-md border border-line bg-paper px-2 text-sm" value={medio} onChange={(event) => setMedio(event.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <Button type="submit" disabled={cargar.isPending}>Anotar egreso</Button>
      </form>
      <ul className="mt-2 space-y-1">
        {(lista.data?.items ?? []).map((item) => (
          <li key={item.id} className="flex justify-between gap-2 text-xs">
            <span className="truncate">{item.concepto}</span>
            <span className="tabular-nums">{verMontos ? money(item.monto) : "····"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
