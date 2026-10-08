import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { confirmarRecuperacion, pedirRecuperacion, recordarUsuario } from "@/lib/portal-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/recuperar")({ component: RecuperarPage });

function tokenDeLaUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

function RecuperarPage() {
  const [dato, setDato] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enlace, setEnlace] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = tokenDeLaUrl();

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <section className="rounded-xl border border-line bg-surface p-4">
          <h1 className="font-display text-2xl font-semibold text-leaf-2">Recuperar acceso</h1>
          <p className="mt-1 text-sm text-muted">El usuario se busca con CUIT o teléfono. La clave llega por correo.</p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              void recordarUsuario({ data: { dato } })
                .then((r) => setAviso(`Tu usuario es ${r.email}`))
                .catch((err: Error) => setError(err.message));
            }}
          >
            <label className="block text-sm font-medium">
              Olvidé el usuario
              <Input className="mt-1" placeholder="CUIT o teléfono" value={dato} onChange={(e) => setDato(e.target.value)} required />
            </label>
            <Button type="submit" variant="secondary" className="w-full">
              Buscar usuario
            </Button>
          </form>
        </section>
        <section className="rounded-xl border border-line bg-surface p-4">
          {token ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                void confirmarRecuperacion({ data: { token, password } })
                  .then(() => setAviso("Listo. Entrá con la clave nueva."))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              <p className="text-sm text-muted">Elegí la clave nueva. El enlace vence a los 30 minutos.</p>
              <label className="block text-sm font-medium">
                Contraseña nueva
                <Input className="mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </label>
              <Button type="submit" className="w-full">
                Guardar clave
              </Button>
            </form>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setEnlace(null);
                void pedirRecuperacion({ data: { email } })
                  .then((r) => {
                    setAviso(r.aviso);
                    setEnlace(r.enlace);
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              <label className="block text-sm font-medium">
                Olvidé la clave
                <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <Button type="submit" className="w-full">
                Enviar enlace
              </Button>
            </form>
          )}
          {enlace ? (
            <p className="mt-3 text-sm">
              En esta vista previa el correo no está conectado.{" "}
              <a className="text-leaf underline" href={enlace}>
                Abrir el enlace
              </a>
            </p>
          ) : null}
          {aviso ? <p className="mt-3 text-sm text-ok">{aviso}</p> : null}
          {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
          <Link to="/login" className="mt-3 block text-center text-sm text-leaf">
            Volver a entrar
          </Link>
        </section>
      </div>
    </main>
  );
}
