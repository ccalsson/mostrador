import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { biResultados } from "@/lib/torre/bi-fn";
import { TorreShell } from "@/components/torre-shell";
import { BIForecast } from "@/components/bi-forecast";

export const Route = createFileRoute("/torre/bi-forecast")({
  component: Page,
});

function Page() {
  const query = useQuery({
    queryKey: ["torre-bi-forecast"],
    queryFn: () => biResultados({ data: { diasForecast: 30, mesesProyeccion: 3 } }),
  });

  return (
    <TorreShell title="BI & Forecasting">
      <BIForecast data={query.data} isLoading={query.isPending} />
    </TorreShell>
  );
}
