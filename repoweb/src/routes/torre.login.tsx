import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { torreYo } from "@/lib/torre-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/torre/login")({ component: TorreLogin });

const TORRE_EMAIL = "calssonclaudio@gmail.com";
const BEARER_KEY = "grok-auth.bearer-token";

function clearBearer() {
  try {
    sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* el navegador puede bloquear el almacenamiento */
  }
}

function mensajeDeEntrada(raw: string) {
  if (/invalid email or password/i.test(raw)) {
    return "Esa clave no es la de este sitio. En mostrador.grok.me la cuenta ya existía con otra.";
  }
  return raw || "No se pudo entrar.";
}

function TorreLogin() {
  const nav = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const yo = useQuery({
    queryKey: ["torre-yo"],
    queryFn: () => torreYo(),
    enabled: Boolean(user),
    retry: false,
  });
  const [email, setEmail] = useState(TORRE_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (yo.data) nav({ to: "/torre" });
  }, [yo.data, nav]);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Una sesión del puesto deja el token colgado y el cierre de sesión
      // puede no responder. Se descarta y se entra igual.
      clearBearer();
      await Promise.race([
        authClient.signOut().then(() => undefined).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
      clearBearer();
      let headerToken: string | null = null;
      const first = await authClient.signIn.email({
        email: email.trim(),
        password,
        fetchOptions: {
          onSuccess(ctx) {
            headerToken = ctx.response.headers.get("set-auth-token");
            const bodyToken = (ctx.data as { token?: string } | null)?.token;
            const token = headerToken || bodyToken;
            if (token) {
              try {
                sessionStorage.setItem(BEARER_KEY, token);
              } catch {
                /* se reintenta abajo */
              }
            }
          },
        },
      });
      if (first.error) throw new Error(mensajeDeEntrada(first.error.message ?? ""));
      const token = headerToken || (first.data as { token?: string } | null)?.token || null;
      if (!token) throw new Error("La sesión no se guardó. Probá de nuevo.");
      sessionStorage.setItem(BEARER_KEY, token);
      window.location.assign("/torre");
    } catch (err) {
      setError(err instanceof Error ? mensajeDeEntrada(err.message) : "No se pudo entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 text-leaf-fg">
      <form onSubmit={(e) => void entrar(e)} className="w-full max-w-sm rounded-xl bg-paper p-5 text-ink">
        <p className="text-xs tracking-wide text-terra uppercase">Interna</p>
        <h1 className="font-display text-2xl font-semibold">Torre de Control</h1>
        <p className="mt-1 text-sm text-muted">Solo entra quien está autorizado.</p>
        {isPending ? null : user && yo.isError ? (
          <p className="mt-2 text-sm text-terra">Estás en una cuenta del puesto. Entrá con el correo de la Torre.</p>
        ) : null}
        <label className="mt-4 block text-sm font-medium">
          Email
          <Input className="mt-1" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Clave
          <Input className="mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
        <Button type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
