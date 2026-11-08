import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { plConsolidado, flujoCaja, conciliacion } from "@/lib/torre/financiero-fn";
import { TorreShell } from "@/components/torre-shell";
import { FinancieroConsolidado } from "@/components/financiero-consolidado";

export const Route = createFileRoute("/torre/financiero-consolidado")({
  component: Page,
  validateSearch: (search: { mes?: string; anio?: string }) => ({
    mes: search.mes ?? String(new Date().getMonth() + 1),
    anio: search.anio ?? String(new Date().getFullYear()),
  }),
});

function Page() {
  const { mes, anio } = Route.useSearch();
  const [tab, setTab] = useState<"pl" | "flujo" | "conciliacion">("pl");
  const [dias, setDias] = useState<7 | 15 | 30>(7);

  const mesNum = Number(mes);
  const anioNum = Number(anio);

  const plQuery = useQuery({
    queryKey: ["pl-consolidado", mes, anio],
    queryFn: () => plConsolidado({ data: { mes: mesNum, anio: anioNum } }),
    enabled: tab === "pl",
  });

  const flujoQuery = useQuery({
    queryKey: ["flujo-caja", dias],
    queryFn: () => flujoCaja({ data: { dias } }),
    enabled: tab === "flujo",
  });

  const concQuery = useQuery({
    queryKey: ["conciliacion", mes, anio],
    queryFn: () => conciliacion({ data: { mes: mesNum, anio: anioNum } }),
    enabled: tab === "conciliacion",
  });

  return (
    <TorreShell title="Control Financiero Consolidado">
      <FinancieroConsolidado
        tab={tab}
        onTabChange={setTab}
        mes={mesNum}
        anio={anioNum}
        dias={dias}
        onDiasChange={setDias}
        plData={plQuery.data}
        flujoData={flujoQuery.data}
        concData={concQuery.data}
        isLoading={plQuery.isPending || flujoQuery.isPending || concQuery.isPending}
      />
    </TorreShell>
  );
}
