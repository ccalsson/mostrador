import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => {
    const token = typeof search.token === "string" ? search.token : "";
    const mercado = typeof search.mercado === "string" ? search.mercado : "";
    return {
      ...(token ? { token } : {}),
      ...(mercado ? { mercado } : {}),
    };
  },
  component: ResetPasswordPage,
});

type Flanco = "staff" | "mercado";

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!response.ok) throw new Error(data.message ?? data.error ?? "No se pudo completar la operación.");
  return data;
}

function ResetPasswordPage() {
  const { token = "", mercado = "" } = Route.useSearch();
  const flanco: Flanco | null = token ? "staff" : mercado ? "mercado" : null;

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <p className="text-xs font-medium tracking-wide text-terra uppercase">Mostrador</p>
        <h1 className="font-display text-2xl font-semibold text-leaf-2">Recuperar contraseña</h1>
        {flanco === "staff" ? <FormularioResetStaff token={token} /> : null}
        {flanco === "mercado" ? <FormularioResetMercado token={mercado} /> : null}
        {flanco === null ? <SolicitarEnlace /> : null}
        <Link to="/login" className="block text-center text-sm text-leaf">
          Volver a entrar
        </Link>
      </div>
    </main>
  );
}

function FormularioResetStaff({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-line border-t-4 border-t-leaf bg-surface p-4">
      <p className="text-sm text-muted">Cuenta del puesto. Elegí una contraseña nueva.</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void postJson("/api/auth/reset-password", { newPassword: password, token })
            .then(() => setAviso("Listo. Entrá con la clave nueva."))
            .catch((err: Error) => setError(err.message));
        }}
      >
        <label className="block text-sm font-medium">
          Contraseña nueva
          <Input
            className="mt-1"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button type="submit" className="w-full">
          Cambiar contraseña
        </Button>
      </form>
      {aviso ? <p className="mt-3 text-sm text-ok">{aviso}</p> : null}
      {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
    </section>
  );
}

function FormularioResetMercado({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-line border-t-4 border-t-leaf bg-surface p-4">
      <p className="text-sm text-muted">Cuenta de Mercado al Toque. Elegí una contraseña nueva.</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void postJson("/api/mercado/v1/auth/restablecer", { token, password })
            .then(() => setAviso("Listo. Entrá con la clave nueva desde la app."))
            .catch((err: Error) => setError(err.message));
        }}
      >
        <label className="block text-sm font-medium">
          Contraseña nueva
          <Input
            className="mt-1"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button type="submit" className="w-full">
          Cambiar contraseña
        </Button>
      </form>
      {aviso ? <p className="mt-3 text-sm text-ok">{aviso}</p> : null}
      {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
    </section>
  );
}

function SolicitarEnlace() {
  const [flanco, setFlanco] = useState<Flanco>("staff");
  const [email, setEmail] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pedir() {
    setError(null);
    setAviso(null);
    if (flanco === "staff") {
      const redirectTo = `${window.location.origin}/reset-password`;
      void postJson("/api/auth/request-password-reset", { email, redirectTo })
        .then(() => setAviso("Enlace generado. En esta etapa (sin email) lo ves en la consola del servidor."))
        .catch((err: Error) => setError(err.message));
      return;
    }
    void postJson("/api/mercado/v1/auth/recuperar", { email })
      .then(() => setAviso("Enlace generado. En esta etapa (sin email) lo ves en la consola del servidor."))
      .catch((err: Error) => setError(err.message));
  }

  return (
    <section className="rounded-xl border border-line border-t-4 border-t-leaf bg-surface p-4">
      <p className="text-sm text-muted">
        Pedí un enlace de recuperación. En DEV (sin correo saliente) el enlace queda en la consola del
        servidor; abrilo en este navegador.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(
          [
            ["staff", "Puesto"],
            ["mercado", "Mercado al Toque"],
          ] as const
        ).map(([valor, label]) => (
          <button
            key={valor}
            type="button"
            onClick={() => {
              setFlanco(valor);
              setAviso(null);
              setError(null);
            }}
            className={
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
              (flanco === valor
                ? "border-leaf bg-ok-bg text-leaf-2"
                : "border-line bg-surface text-muted hover:bg-ok-bg/40")
            }
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          pedir();
        }}
      >
        <label className="block text-sm font-medium">
          Email de la cuenta
          <Input
            className="mt-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <Button type="submit" className="w-full">
          Generar enlace
        </Button>
      </form>
      {aviso ? <p className="mt-3 text-sm text-ok">{aviso}</p> : null}
      {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
    </section>
  );
}
