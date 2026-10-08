import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMarca, prepareDemo } from "@/lib/fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemaBoton } from "@/components/tema-boton";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const nav = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const marca = useQuery({ queryKey: ["marca"], queryFn: () => getMarca(), staleTime: 60_000 });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const nombre = marca.data?.nombre ?? "Mostrador";
  const bajada = marca.data?.bajada ?? "";
  const membrete = marca.data?.membrete ?? "";
  const fondo = marca.data?.fondo ?? null;

  useEffect(() => {
    void prepareDemo();
  }, []);

  useEffect(() => {
    if (!isPending && user) nav({ to: "/" });
  }, [isPending, user, nav]);

  async function withEmail(nextEmail: string, nextPassword: string, key: string) {
    setError(null);
    setBusy(key);
    try {
      await prepareDemo();
      try {
        sessionStorage.removeItem("grok-auth.bearer-token");
      } catch {
        /* el navegador puede bloquear el almacenamiento */
      }
      const { data, error: err } = await authClient.signIn.email({
        email: nextEmail,
        password: nextPassword,
      });
      if (err) throw new Error(err.message ?? "No se pudo entrar.");
      const token = (data as { token?: string } | null)?.token;
      if (token) {
        try {
          sessionStorage.setItem("grok-auth.bearer-token", token);
        } catch {
          /* ignore */
        }
      }
      await authClient.getSession();
      nav({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo entrar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main
      className="relative min-h-dvh bg-paper bg-cover bg-center"
      style={fondo ? { backgroundImage: `url(${fondo})` } : undefined}
    >
      {fondo ? <div className="pointer-events-none absolute inset-0 bg-paper/90" /> : null}
      <div className="fixed top-3 right-3 z-10">
        <TemaBoton tono="pagina" />
      </div>
      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-5 px-4 py-8 sm:px-5 lg:grid lg:grid-cols-2 lg:items-center lg:gap-8">
        <section className="rounded-xl border border-line bg-paper/95 p-4 sm:p-5">
          <p className="text-xs font-medium tracking-wide text-terra uppercase sm:text-sm">Mostrador</p>
          <h1 className="mt-1 font-display text-[1.65rem] leading-[1.05] font-semibold tracking-tight text-leaf sm:mt-2 sm:text-4xl">
            {isPending ? "Cargando…" : nombre}
          </h1>
          {bajada ? <p className="mt-2 text-base leading-snug text-ink-soft sm:text-lg">{bajada}</p> : null}
          {membrete ? <p className="mt-2 whitespace-pre-line text-sm text-muted">{membrete}</p> : null}
        </section>

        <section className="rounded-xl border border-line border-t-4 border-t-leaf bg-surface p-4 shadow-[0_12px_40px_rgba(15,61,38,0.08)] sm:p-6">
          <h2 className="font-display text-2xl font-semibold">Entrar</h2>
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void withEmail(email, password, "form");
            }}
          >
            <label className="block text-sm font-medium">
              Email
              <Input
                className="mt-1"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Contraseña
              <Input
                className="mt-1"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
              />
            </label>
            {error ? <p className="text-sm text-terra">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "form" ? "Entrando…" : "Ingresar"}
            </Button>
          </form>
          <div className="mt-3 text-right text-sm">
            <Link to="/recuperar" className="text-muted">
              Olvidé usuario o clave
            </Link>
          </div>
          <p className="mt-4 text-center text-sm">
            <a href="/mercado" className="text-leaf">
              Mercado al Toque
            </a>
          </p>
          {authEnabled ? (
            <div className="mt-5 space-y-2 border-t border-line pt-5">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  variant="secondary"
                  className="w-full"
                  onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                >
                  Continuar con {p.label}
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}