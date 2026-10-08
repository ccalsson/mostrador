import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TermicaBoton } from "@/components/termica-boton";
import { TicketSlip } from "@/components/ticket-slip";
import { Button } from "@/components/ui/button";
import { getTicket } from "@/lib/fn";
import { imprimirEnTermica, type TicketContenido } from "@/lib/termica";

export const Route = createFileRoute("/ticket/$cobroId")({ component: TicketPage });

function TicketPage() {
  const { cobroId } = Route.useParams();
  const ticket = useQuery({ queryKey: ["ticket", cobroId], queryFn: () => getTicket({ data: cobroId }) });
  const c = ticket.data?.contenido as TicketContenido | null | undefined;

  if (!c) {
    return (
      <AppShell>
        <p className="text-muted">Buscando ticket…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button
          onClick={() => {
            void imprimirEnTermica(c)
              .then((mando) => {
                if (mando) toast.success("Ticket en la térmica");
                else window.print();
              })
              .catch((e: Error) => {
                toast.error(e.message);
                window.print();
              });
          }}
        >
          <Printer className="size-4" />
          Imprimir ticket
        </Button>
        <TermicaBoton />
      </div>
      <TicketSlip c={c} preview />
    </AppShell>
  );
}
