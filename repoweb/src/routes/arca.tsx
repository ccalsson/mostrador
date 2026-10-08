import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/arca")({ component: ArcaPage });

function ArcaPage() {
  return (
    <AppShell title="ARCA">
      <section className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <p className="font-display text-2xl font-semibold">Próximamente</p>
        <p className="mt-2 text-sm text-muted">Solicítelo al desarrollador.</p>
      </section>
    </AppShell>
  );
}
