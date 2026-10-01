import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { quienSoy } from "@/lib/fn";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({
    queryKey: ["quien"],
    queryFn: () => quienSoy(),
    enabled: Boolean(user),
  });

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper">
        <div className="text-center">
          <p className="font-display text-3xl font-semibold">Frutas Román, el Jujeño</p>
          <p className="mt-1 text-sm text-muted">Mostrador</p>
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn to="/login" />;
  if (me.isPending) {
    return <div className="grid min-h-dvh place-items-center bg-paper text-muted">Preparando el puesto…</div>;
  }
  if (me.data?.tipo === "cliente") return <Navigate to="/portal" />;
  const rol = me.data?.tipo === "staff" ? me.data.staff.rol : undefined;
  if (rol === "vendedor") return <Navigate to="/vendedor" />;
  if (rol === "cajero") return <Navigate to="/caja" />;
  return <Navigate to="/dashboard" />;
}
