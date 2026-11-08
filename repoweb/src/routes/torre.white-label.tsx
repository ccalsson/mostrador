import { createFileRoute } from "@tanstack/react-router";
import { TorreShell } from "@/components/torre-shell";
import { WhiteLabel } from "@/components/white-label";

export const Route = createFileRoute("/torre/white-label")({
  component: Page,
});

function Page() {
  return (
    <TorreShell title="White-Label">
      <WhiteLabel />
    </TorreShell>
  );
}
