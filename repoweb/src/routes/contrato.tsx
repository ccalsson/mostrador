import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ContratoPuesto } from "@/components/contrato-puesto";

export const Route = createFileRoute("/contrato")({ component: Page });

function Page() {
  return (
    <AppShell title="Contrato">
      <ContratoPuesto />
    </AppShell>
  );
}
