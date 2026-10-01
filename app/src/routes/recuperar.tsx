import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { recordarUsuario, recuperarClave } from "@/lib/portal-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/recuperar")({ component: RecuperarPage });

function RecuperarPage() {
  const [dato, setDato] = useState("");
  const [email, setEmail] = useState("");
  const [cuit, setCuit] = useState("");
  const [password, setPassword] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <section className="rounded-xl border border-line bg-surface p-4">
          <h1 className="font-display text-2xl font-semibold text-leaf-2">Recuperar acceso</h1>
          <p className="mt-1 text-sm text-muted">Solo para cuentas de cliente. El correo del puesto no se blanquea acá.</p>
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
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              void recuperarClave({ data: { email, cuit, password } })
                .then(() => setAviso("Listo. Entrá con la clave nueva."))
                .catch((err: Error) => setError(err.message));
            }}
          >
            <label className="block text-sm font-medium">
              Email
              <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium">
              CUIT o DNI
              <Input className="mt-1" value={cuit} onChange={(e) => setCuit(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium">
              Contraseña nueva
              <Input className="mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <Button type="submit" className="w-full">
              Cambiar contraseña
            </Button>
          </form>
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
