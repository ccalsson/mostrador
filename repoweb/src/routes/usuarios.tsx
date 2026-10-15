import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cambiarClaveUsuario, createUsuario, listUsuarios, quienSoy, toggleUsuario } from "@/lib/fn";
import { habilitarCambioSucursal } from "@/lib/sucursales-puesto";
import { ROL_LABEL, type Rol } from "@/lib/types";

export const Route = createFileRoute("/usuarios")({ component: UsuariosPage });

function UsuariosPage() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["usuarios"], queryFn: () => listUsuarios() });
  const yo = useQuery({ queryKey: ["quien"], queryFn: () => quienSoy() });
  const miId = yo.data?.tipo === "staff" ? yo.data.staff.id : null;
  const [form, setForm] = useState({ nombre: "", email: "", password: "", rol: "vendedor" as Rol });
  const [clave, setClave] = useState<{ id: string; password: string } | null>(null);
  const crear = useMutation({
    mutationFn: () => createUsuario({ data: form }),
    onSuccess: () => {
      toast.success("Usuario creado");
      setForm({ nombre: "", email: "", password: "", rol: "vendedor" });
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const claveNueva = useMutation({
    mutationFn: (input: { id: string; password: string }) => cambiarClaveUsuario({ data: input }),
    onSuccess: () => {
      toast.success("Contraseña actualizada");
      setClave(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pasar = useMutation({
    mutationFn: (input: { staffId: string; puedeCambiar: boolean }) => habilitarCambioSucursal({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const tog = useMutation({
    mutationFn: (input: { id: string; activo: boolean }) => toggleUsuario({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Usuarios">
      <div className="grid items-start justify-start gap-4 lg:grid-cols-[minmax(0,36rem)_18rem]">
        <div className="overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <p className="border-b border-line px-3 py-2 text-xs text-muted">
            Eliminar da de baja el acceso. Los pedidos que ya cargó quedan. No se borra el historial.
          </p>
          <div className="hidden bg-paper-2 font-medium text-muted md:grid md:grid-cols-[minmax(0,1.4fr)_6.5rem_5.5rem_7.5rem]">
            <div className="px-3 py-2">Nombre</div>
            <div className="px-3 py-2">Rol</div>
            <div className="px-3 py-2">Estado</div>
            <div />
          </div>
          {(users.data ?? []).map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,1.4fr)_6.5rem_5.5rem_7.5rem] md:px-0 md:py-0"
            >
              <div className="min-w-0 md:px-3 md:py-2">
                <div className="truncate font-medium">{u.nombre}</div>
                <div className="truncate text-xs text-muted">{u.email}</div>
              </div>
              <div className="md:px-3">{ROL_LABEL[u.rol]}</div>
              <div className="md:px-3">
                <Badge tone={u.activo ? "ok" : "muted"}>{u.activo ? "Activo" : "Baja"}</Badge>
              </div>
              <div className="text-right md:px-2 md:py-1.5">
                {u.rol !== "admin" ? (
                  <button type="button" className="mr-2 text-xs text-leaf" onClick={() => pasar.mutate({ staffId: u.id, puedeCambiar: !u.puede_cambiar })}>
                    {u.puede_cambiar ? "Puede cambiar" : "Fijo en una"}
                  </button>
                ) : null}
                {clave?.id === u.id ? (
                  <form
                    className="flex items-center justify-end gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      claveNueva.mutate(clave);
                    }}
                  >
                    <Input className="h-9 w-28" type="password" autoComplete="new-password" value={clave.password} onChange={(e) => setClave({ id: u.id, password: e.target.value })} required minLength={8} />
                    <Button size="sm" type="submit" disabled={claveNueva.isPending}>Guardar</Button>
                  </form>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setClave({ id: u.id, password: "" })}>Contraseña</Button>
                )}
                {u.id === miId ? (
                  <span className="px-1 text-xs text-muted">Tu cuenta</span>
                ) : (
                  <Button
                    variant={u.activo ? "danger" : "secondary"}
                    size="sm"
                    disabled={tog.isPending}
                    onClick={() => {
                      if (u.activo && !window.confirm(`¿Eliminar a ${u.nombre}? Deja de entrar. Los pedidos quedan.`)) return;
                      tog.mutate({ id: u.id, activo: !u.activo });
                    }}
                  >
                    {u.activo ? "Eliminar" : "Reactivar"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          className="h-fit w-full max-w-sm rounded-lg border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <h2 className="font-display text-xl font-semibold">Alta</h2>
          <label className="mt-3 block text-sm font-medium">
            Nombre
            <Input className="mt-1" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Email
            <Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Contraseña
            <Input className="mt-1" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Rol
            <select
              className="mt-1 h-11 w-full rounded-md border border-line px-3"
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}
            >
              <option value="vendedor">Vendedor</option>
              <option value="cajero">Cajero</option>
              <option value="admin">Dueño</option>
            </select>
          </label>
          <Button className="mt-4 w-full" type="submit" disabled={crear.isPending}>
            Crear usuario
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
