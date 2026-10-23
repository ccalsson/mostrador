import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/confirmar-mercado")({
  validateSearch: (search) => ({
    token: typeof search.token === "string" ? search.token : "",
    perfil: search.perfil === "comprador" || search.perfil === "cargador" ? search.perfil : "",
  }),
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }, { name: "robots", content: "noindex" }] }),
  component: ConfirmarMercado,
});

function ConfirmarMercado() {
  const { token, perfil } = Route.useSearch();
  const [estado, setEstado] = useState<"listo" | "enviando" | "ok" | "error">("listo");
  const [mensaje, setMensaje] = useState("");
  const valido = token.length >= 20 && perfil !== "";

  async function confirmar() {
    if (!valido || estado === "enviando" || estado === "ok") return;
    setEstado("enviando");
    try {
      const response = await fetch("/api/mercado/v1/auth/confirmar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, perfil }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      if (!response.ok || body.ok !== true) throw new Error(body.message || "No se pudo confirmar el correo.");
      setEstado("ok");
      setMensaje("Correo confirmado. Volvé a Mercado al Toque e ingresá con tu correo y contraseña.");
    } catch (error) {
      setEstado("error");
      setMensaje(error instanceof Error ? error.message : "No se pudo conectar. Probá de nuevo.");
    }
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-12">
      <section className="mx-auto max-w-md rounded-xl border border-line bg-surface p-6">
        <p className="text-sm text-muted">Mercado al Toque</p>
        <h1 className="mt-2 font-display text-2xl text-leaf-2">Confirmar tu correo</h1>
        <p className="mt-4 text-sm" role="status" aria-live="polite">
          {!valido ? "El enlace no es válido. Pedí uno nuevo desde la página de registro." : mensaje || "Confirmá para habilitar el ingreso a tu cuenta."}
        </p>
        {valido && estado !== "ok" && (
          <button className="mt-6 w-full rounded-md bg-leaf px-4 py-3 text-white disabled:opacity-50" disabled={estado === "enviando"} onClick={confirmar}>
            {estado === "enviando" ? "Confirmando…" : "Confirmar correo"}
          </button>
        )}
        <a className="mt-6 block text-sm underline" href="/registro-mercado.html">Volver al registro</a>
      </section>
    </main>
  );
}
