import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TorreShell } from "@/components/torre-shell";
import { EjecutivoDashboard } from "@/components/ejecutivo-dashboard";
import { dashboardEjecutivo } from "@/lib/torre/ejecutivo-fn";
import { INTERVALO_TABLERO } from "@/lib/query-frescura";

export const Route = createFileRoute("/torre/ejecutivo")({
  component: Page,
});

type Rango = 1 | 7 | 30;

function Page() {
  const [dias, setDias] = useState<Rango>(1);
  const query = useQuery({
    queryKey: ["dashboard-ejecutivo", dias],
    queryFn: () => dashboardEjecutivo({ data: { dias } }),
    refetchInterval: INTERVALO_TABLERO,
  });

  return (
    <TorreShell title="Dashboard Ejecutivo">
      <EjecutivoDashboard
        data={query.data}
        dias={dias}
        onDiasChange={setDias}
        isPending={query.isPending}
        error={query.error}
      />
    </TorreShell>
  );
}
