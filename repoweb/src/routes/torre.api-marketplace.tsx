import { createFileRoute } from "@tanstack/react-router";
import { TorreShell } from "@/components/torre-shell";
import { ApiMarketplace } from "@/components/api-marketplace";

export const Route = createFileRoute("/torre/api-marketplace")({
  component: Page,
});

function Page() {
  return (
    <TorreShell title="API Marketplace">
      <ApiMarketplace />
    </TorreShell>
  );
}
