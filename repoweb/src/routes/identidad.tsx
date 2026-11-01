import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMarca, guardarMarca, quienSoy } from "@/lib/fn";
import { fotoParaMovil } from "@/lib/foto-movil";

export const Route = createFileRoute("/identidad")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["quien"], queryFn: () => quienSoy() });
  const marca = useQuery({ queryKey: ["marca"], queryFn: () => getMarca() });
  const [nombre, setNombre] = useState("");
  const [bajada, setBajada] = useState("");
  const [membrete, setMembrete] = useState("");
  const [pie, setPie] = useState("");
  const [direccion, setDireccion] = useState("");
  const [fondo, setFondo] = useState<string | null>(null);

  useEffect(() => {
    if (!marca.data) return;
    setNombre(marca.data.nombre);
    setBajada(marca.data.bajada);
    setMembrete(marca.data.membrete);
    setPie(marca.data.pieTicket);
    setDireccion(marca.data.direccion);
    setFondo(marca.data.fondo);
  }, [marca.data]);

  const guardar = useMutation({
    mutationFn: () => guardarMarca({ data: { nombre, bajada, membrete, pieTicket: pie, fondo, direccion } }),
    onSuccess: () => {
      toast.success("Identidad del puesto guardada");
      void qc.invalidateQueries({ queryKey: ["marca"] });
      void qc.invalidateQueries({ queryKey: ["quien"] });
      void navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (me.data && (me.data.tipo !== "staff" || me.data.staff.rol !== "admin")) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <AppShell title="Identidad">
      <form
        className="mx-auto grid w-full max-w-lg grid-cols-1 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <p className="text-sm text-pretty text-muted">
          El nombre y la dirección son de este puesto. No salen de una lista. Con la dirección se arma el QR de Mercado.
        </p>
        <label className="block min-w-0 text-sm font-medium">
          Nombre
          <Input className="mt-1" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="block min-w-0 text-sm font-medium">
          Dirección o mercado
          <Input className="mt-1" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Nave 4, Mercado de Garupá" />
        </label>
        <label className="block min-w-0 text-sm font-medium">
          Bajada
          <Input className="mt-1" value={bajada} onChange={(e) => setBajada(e.target.value)} placeholder="Frutas y verdura" />
        </label>
        <label className="block min-w-0 text-sm font-medium">
          Membrete
          <textarea
            className="mt-1 min-h-16 w-full rounded-md border border-line bg-surface px-3 py-2 text-base"
            value={membrete}
            onChange={(e) => setMembrete(e.target.value)}
            placeholder="Nave, puesto, teléfono"
          />
        </label>
        <label className="block min-w-0 text-sm font-medium">
          Pie del ticket
          <textarea
            className="mt-1 min-h-16 w-full rounded-md border border-line bg-surface px-3 py-2 text-base"
            value={pie}
            onChange={(e) => setPie(e.target.value)}
          />
        </label>
        <div className="min-w-0">
          <p className="text-sm font-medium">Fondo de la pantalla inactiva</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {fondo ? <img src={fondo} alt="" className="h-20 w-full max-w-40 rounded-md object-cover" /> : <span className="text-sm text-muted">Sin fondo</span>}
            <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-md border border-line px-3 text-sm">
              Elegir imagen
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void fotoParaMovil(file).then(setFondo).catch((err: Error) => toast.error(err.message));
                }}
              />
            </label>
            {fondo ? (
              <button type="button" className="h-9 rounded-md border border-line px-3 text-sm" onClick={() => setFondo(null)}>
                Quitar
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={guardar.isPending}>Guardar</Button>
          <Button type="button" variant="secondary" onClick={() => void navigate({ to: "/dashboard" })}>Cancelar</Button>
        </div>
      </form>
    </AppShell>
  );
}
