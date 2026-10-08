import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMarca, guardarMarca, quienSoy } from "@/lib/fn";

export function IdentidadPuesto() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["quien"], queryFn: () => quienSoy() });
  const marca = useQuery({ queryKey: ["marca"], queryFn: () => getMarca() });
  const [nombre, setNombre] = useState("");
  const [bajada, setBajada] = useState("");
  const [membrete, setMembrete] = useState("");
  const [pie, setPie] = useState("");
  const [fondo, setFondo] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!marca.data || listo) return;
    setNombre(marca.data.nombre);
    setBajada(marca.data.bajada);
    setMembrete(marca.data.membrete);
    setPie(marca.data.pieTicket);
    setFondo(marca.data.fondo);
    setListo(true);
  }, [marca.data, listo]);

  const guardar = useMutation({
    mutationFn: () => guardarMarca({ data: { nombre, bajada, membrete, pieTicket: pie, fondo } }),
    onSuccess: () => {
      toast.success("Identidad del puesto guardada");
      void qc.invalidateQueries({ queryKey: ["marca"] });
      void qc.invalidateQueries({ queryKey: ["quien"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (me.data?.tipo !== "staff" || me.data.staff.rol !== "admin") return null;

  return (
    <section className="mb-4 max-w-3xl rounded-lg border border-line border-t-2 border-t-leaf bg-surface p-4">
      <h2 className="font-display text-lg font-semibold">Identidad del puesto</h2>
      <p className="mt-1 text-sm text-muted">
        Cada puesto edita su nombre, el membrete y el fondo de la pantalla inactiva. No se comparte con otro puesto.
      </p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <label className="block text-sm font-medium">
          Nombre
          <Input className="mt-1" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Bajada
          <Input className="mt-1" value={bajada} onChange={(e) => setBajada(e.target.value)} placeholder="Mercado Central" />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Membrete
          <textarea
            className="mt-1 min-h-16 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            value={membrete}
            onChange={(e) => setMembrete(e.target.value)}
            placeholder="Nave, puesto, teléfono"
          />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Pie del ticket
          <textarea
            className="mt-1 min-h-16 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            value={pie}
            onChange={(e) => setPie(e.target.value)}
          />
        </label>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium">Fondo de la pantalla inactiva</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {fondo ? <img src={fondo} alt="" className="h-16 w-28 rounded-md object-cover" /> : <span className="text-sm text-muted">Sin fondo</span>}
            <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-line px-3 text-sm">
              Elegir imagen
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void achicar(file).then(setFondo).catch((err: Error) => toast.error(err.message));
                }}
              />
            </label>
            {fondo ? (
              <button type="button" className="text-sm text-terra" onClick={() => setFondo(null)}>
                Quitar
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <Button type="submit" disabled={guardar.isPending || !nombre.trim()}>
            Guardar identidad
          </Button>
        </div>
      </form>
    </section>
  );
}

function achicar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("No pude preparar la imagen."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.72);
      URL.revokeObjectURL(url);
      if (data.length > 450_000) reject(new Error("La imagen sigue siendo muy pesada. Probá otra más chica."));
      else resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No pude leer la imagen."));
    };
    img.src = url;
  });
}
