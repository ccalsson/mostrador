import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIAS_EGRESO, anularEgreso, crearEgreso, listEgresosTurno } from "@/lib/fn";
import { clock, money } from "@/lib/money";

export function CajaEgresos({ verMontos }: { verMontos: boolean }) {
  const qc = useQueryClient();
  const lista = useQuery({
    queryKey: ["caja-egresos"],
    queryFn: () => listEgresosTurno(),
    refetchInterval: 4000,
  });
  const [categoria, setCategoria] = useState("servicios");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");

  const cargar = useMutation({
    mutationFn: () =>
      crearEgreso({
        data: {
          categoria,
          concepto,
          monto: Math.round(Number(monto) * 100) / 100,
        },
      }),
    onSuccess: async () => {
      toast.success("Egreso anotado.");
      setConcepto("");
      setMonto("");
      await qc.invalidateQueries({ queryKey: ["caja-egresos"] });
      await qc.invalidateQueries({ queryKey: ["caja"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const anular = useMutation({
    mutationFn: (id: string) => anularEgreso({ data: id }),
    onSuccess: async () => {
      toast.message("Egreso anulado.");
      await qc.invalidateQueries({ queryKey: ["caja-egresos"] });
      await qc.invalidateQueries({ queryKey: ["caja"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = lista.data?.items ?? [];
  const total = items.reduce((acc, i) => acc + i.monto, 0);

  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h2 className="text-sm font-medium text-muted">Egresos del turno</h2>
      <form
        className="mt-2 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!monto.trim()) return;
          cargar.mutate();
        }}
      >
        <select
          className="h-9 rounded-md border border-line bg-paper px-2 text-sm"
          value={categoria}
          onChange={(event) => setCategoria(event.target.value)}
        >
          {CATEGORIAS_EGRESO.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <Input
          className="h-9"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Concepto (alquiler, flete...)"
        />
        <div className="flex gap-2">
          <Input
            className="h-9 flex-1"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Monto"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={cargar.isPending || !monto.trim()}>
            Anotar
          </Button>
        </div>
      </form>

      {items.length > 0 ? (
        <div className="mt-3 border-t border-line pt-2">
          <div className="flex justify-between text-xs font-medium text-terra">
            <span>Total egresos</span>
            <span className="tabular-nums">{verMontos ? money(total) : "····"}</span>
          </div>
          <ul className="mt-1 max-h-48 space-y-1 overflow-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.concepto}</span>
                  <span className="text-muted">
                    {item.categoria} · {clock(item.creadoAt)}
                  </span>
                </div>
                <span className="shrink-0 tabular-nums">{verMontos ? money(item.monto) : "····"}</span>
                <button
                  type="button"
                  className="shrink-0 text-terra hover:text-terra/80"
                  disabled={anular.isPending}
                  onClick={() => anular.mutate(item.id)}
                  aria-label="Anular egreso"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Sin egresos en este turno.</p>
      )}
    </section>
  );
}
