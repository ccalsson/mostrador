import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { registrarCliente } from "@/lib/portal-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/registro")({ component: RegistroPage });

function RegistroPage() {
  const nav = useNavigate();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cuit, setCuit] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Misma higiene que /login: el bearer de una sesión previa no debe
      // sobrevivir al alta ni filtrarse en los pedidos posteriores.
      try {
        sessionStorage.removeItem("grok-auth.bearer-token");
      } catch {
        /* el navegador puede bloquear el almacenamiento */
      }
      await registrarCliente({
        data: { nombre, email, password, telefono, cuit, direccion },
      });
      const { data, error: err } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      if (err) throw new Error(err.message ?? "La cuenta quedó creada, pero no pude entrar.");
      const token = (data as { token?: string } | null)?.token;
      if (token) {
        try {
          sessionStorage.setItem("grok-auth.bearer-token", token);
        } catch {
          /* ignore */
        }
      }
      await authClient.getSession();
      nav({ to: "/portal" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-md rounded-xl border border-line border-t-4 border-t-leaf bg-surface p-4">
        <p className="text-xs font-medium tracking-wide text-terra uppercase">Cliente</p>
        <h1 className="font-display text-2xl font-semibold text-leaf-2">Crear cuenta</h1>
        <p className="mt-1 text-sm text-muted">Solo los clientes se anotan solos. El puesto no usa este formulario.</p>
        <div className="mt-4 space-y-3">
          <Campo label="Nombre" value={nombre} onChange={setNombre} />
          <Campo label="Email" type="email" value={email} onChange={setEmail} />
          <Campo label="Contraseña" type="password" value={password} onChange={setPassword} />
          <Campo label="Teléfono" value={telefono} onChange={setTelefono} />
          <Campo label="CUIT o DNI" value={cuit} onChange={setCuit} />
          <Campo label="Dirección" value={direccion} onChange={setDireccion} />
        </div>
        {error ? <p className="mt-3 text-sm text-terra">{error}</p> : null}
        <Button type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? "Creando…" : "Crear cuenta"}
        </Button>
        <Link to="/login" className="mt-3 block text-center text-sm text-leaf">
          Ya tengo cuenta
        </Link>
      </form>
    </main>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <Input className="mt-1" type={type} value={value} required onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
