import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ReputacionPuesto } from "@/components/reputacion-puesto";

export const Route = createFileRoute("/reputacion")({ component: Page });

function Page() {
  return (
    <AppShell title="Reputación">
      <p className="mb-4 max-w-lg text-sm text-muted">
        Lo que dejan los clientes. Las estrellas del tablero abren lo mismo, sin ocupar la pantalla.
      </p>
      <ReputacionPuesto modo="pagina" />
    </AppShell>
  );
}
