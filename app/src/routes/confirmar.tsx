import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/confirmar")({
  validateSearch: (search) => ({ token: typeof search.token === "string" ? search.token : "" }),
  component: ConfirmarPage,
});

function ConfirmarPage() {
  const { token } = Route.useSearch();
  const nav = useNavigate();
  const [estado, setEstado] = useState<"confirmando" | "ok" | "error">("confirmando");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!token) {
      setEstado("error");
      setMensaje("El enlace no tiene token.");
      return;
    }
    let cancelado = false;
    fetch("/api/v1/portal/confirmar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelado) return;
        if (r.ok && body.data?.ok) {
          setEstado("ok");
          setMensaje("Correo confirmado. Ya podés entrar.");
        } else {
          setEstado("error");
          setMensaje(body.message ?? "No se pudo confirmar el correo.");
        }
      })
      .catch(() => {
        if (cancelado) return;
        setEstado("error");
        setMensaje("No se pudo conectar. Probá de nuevo.");
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md rounded-xl border border-line border-t-4 border-t-leaf bg-surface p-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-leaf-2">Confirmar correo</h1>
        <p className={`mt-3 text-sm ${estado === "error" ? "text-terra" : estado === "ok" ? "text-ok" : "text-muted"}`}>
          {estado === "confirmando" ? "Confirmando tu correo…" : mensaje}
        </p>
        {estado !== "confirmando" ? (
          <div className="mt-4 space-y-2">
            <Button onClick={() => nav({ to: "/login" })} className="w-full">
              Ir al ingreso
            </Button>
            {estado === "error" ? (
              <Link to="/login" className="block text-sm text-leaf">
                Volver
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
