import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { confirmarCorreo } from "@/lib/portal-fn";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/confirmar")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: ConfirmarPage,
});

function ConfirmarPage() {
  const { token } = Route.useSearch();
  const [estado, setEstado] = useState<"listo" | "ok" | "error">("listo");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function confirmar() {
    setMensaje(null);
    try {
      await confirmarCorreo({ data: { token } });
      setEstado("ok");
    } catch (error) {
      setEstado("error");
      setMensaje(error instanceof Error ? error.message : "No se pudo confirmar.");
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <section className="w-full max-w-md rounded-xl border border-line bg-surface p-5">
        <h1 className="font-display text-2xl font-semibold">Confirmar correo</h1>
        {estado === "ok" ? (
          <p className="mt-3 text-sm">El correo quedó confirmado. Ya podés entrar.</p>
        ) : (
          <p className="mt-3 text-sm text-muted">Este enlace habilita la cuenta. Sin esto no entra.</p>
        )}
        {mensaje ? <p className="mt-3 text-sm text-terra">{mensaje}</p> : null}
        {estado !== "ok" ? (
          <Button className="mt-4" disabled={!token} onClick={() => void confirmar()}>
            Confirmar
          </Button>
        ) : null}
        <Link to="/login" className="mt-4 block text-sm text-leaf">
          Ir a entrar
        </Link>
      </section>
    </main>
  );
}
