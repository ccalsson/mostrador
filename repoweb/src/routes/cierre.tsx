import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cerrarCaja, estadoCaja } from "@/lib/fn";
import { money } from "@/lib/money";
import { PAGO_LABEL, type FormaPago } from "@/lib/types";

export const Route = createFileRoute("/cierre")({ component: CierrePage });

function CierrePage() {
  const nav = useNavigate();
  const caja = useQuery({ queryKey: ["caja"], queryFn: () => estadoCaja() });
  const [real, setReal] = useState("");
  const [notas, setNotas] = useState("");
  const d = caja.data;
  const close = useMutation({
    mutationFn: () => cerrarCaja({ data: { id: d!.id, real: Number(real || 0), notas } }),
    onSuccess: (res) => {
      toast.success(`Caja cerrada. Diferencia ${money(res.diferencia)}`);
      nav({ to: "/caja" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Cierre de caja">
      <section className="max-w-lg rounded-lg border border-line bg-surface p-5">
        <p className="text-sm text-muted">Turno abierto {d ? new Date(d.abiertoAt).toLocaleString("es-AR") : "…"}</p>
        <ul className="mt-4 space-y-2">
          {(d?.totales ?? []).map((t) => (
            <li key={t.formaPago} className="flex justify-between text-sm">
              <span>
                {PAGO_LABEL[t.formaPago as FormaPago] ?? t.formaPago} ({t.n})
              </span>
              <span className="tabular-nums">{money(t.total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between font-medium">
          <span>Esperado</span>
          <span className="tabular-nums">{money(d?.esperado ?? 0)}</span>
        </div>
        <label className="mt-4 block text-sm font-medium">
          Monto real en caja
          <Input className="mt-1" inputMode="numeric" value={real} onChange={(e) => setReal(e.target.value)} />
        </label>
        <Input className="mt-2" placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        <Button className="mt-4 w-full" disabled={!d || close.isPending} onClick={() => close.mutate()}>
          Cerrar turno
        </Button>
      </section>
    </AppShell>
  );
}
