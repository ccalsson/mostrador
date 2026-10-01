import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient, setBearerToken } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/catalog";
import { prepareDemo } from "@/lib/fn";
import { ROL_LABEL } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemaBoton } from "@/components/tema-boton";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const nav = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      const { data, error: err } = await authClient.signIn.email({
        email: nextEmail,
        password: nextPassword,
      });
      if (err) throw new Error(err.message ?? "No se pudo entrar.");
      const token = (data as { token?: string } | null)?.token;
      if (token) setBearerToken(token);
      await authClient.getSession();
      nav({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo entrar.");
    } finally {
      setBusy(null);
    }
  }

  if (isPending) {
    return (
      <div className="relative grid min-h-dvh place-items-center bg-paper md:bg-[#16241a]">
        <img
          src="/puesto.jpg"
          alt=""
          className="absolute inset-0 hidden h-full w-full object-cover object-top md:block"
        />
        <p className="relative rounded-md bg-paper/90 px-3 py-1.5 text-sm text-muted md:bg-[#16241a]/80 md:text-leaf-fg">
          Cargando…
        </p>
      </div>
    );
  }

  return (
    <main className="relative min-h-dvh bg-paper md:overflow-hidden md:bg-[#16241a]">
      <img
        src="/puesto.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover object-top md:block"
      />
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-b from-transparent from-40% via-[#16241a]/70 to-[#16241a] md:block" />
      <div className="fixed top-3 right-3 z-10">
        <TemaBoton tono="pagina" />
      </div>
      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-5 px-4 py-5 sm:px-5 md:justify-end md:pt-[42vh] md:pb-6 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pt-10 lg:pb-10">
        <section className="rounded-xl bg-paper/90 p-4 backdrop-blur-[2px] sm:p-5 dark:bg-surface/90">
          <p className="text-xs font-medium tracking-wide text-terra uppercase sm:text-sm">Mostrador</p>
          <h1 className="mt-1 font-display text-[1.65rem] leading-[1.05] font-semibold tracking-tight text-leaf sm:mt-2 sm:text-5xl">
            Frutas Román, el Jujeño
          </h1>
          <p className="mt-2 max-w-md text-base leading-snug text-ink-soft sm:mt-4 sm:text-lg">
            Pedidos en tablet, cobro en caja, stock por remito. Mercado Central.
          </p>
          {import.meta.env.DEV ? (
            <>
              <p className="mt-4 text-xs text-muted sm:mt-8 sm:text-sm">Cuentas de prueba · contraseña {DEMO_PASSWORD}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {DEMO_USERS.map((u, i) => (
                  <button
                    key={u.email}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void withEmail(u.email, u.password, u.email)}
                    className={cn(
                      "min-w-0 rounded-lg border border-line border-t-2 bg-surface p-2.5 text-left transition-colors hover:bg-ok-bg/40 sm:p-4",
                      ["border-t-leaf", "border-t-terra", "border-t-naranja"][i] ?? "border-t-leaf",
                    )}
                  >
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-muted sm:text-xs">
                      {ROL_LABEL[u.rol]}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium sm:mt-1 sm:text-base">{u.nombre}</span>
                    <span className="mt-1 hidden truncate text-xs text-muted sm:block">
                      {busy === u.email ? "Entrando…" : u.email}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted sm:hidden">
                      {busy === u.email ? "Entrando…" : "Entrar"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
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
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <Link to="/registro" className="font-medium text-leaf">
              Crear cuenta de cliente
            </Link>
            <Link to="/recuperar" className="text-muted">
              Olvidé usuario o clave
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
