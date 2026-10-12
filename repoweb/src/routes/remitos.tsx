import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearRemito, listRemitos } from "@/lib/fn";
import { listarProveedores } from "@/lib/portal-fn";
import { dayLabel } from "@/lib/money";

export const Route = createFileRoute("/remitos")({ component: FacturarPage });

function FacturarPage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path !== "/remitos") return <Outlet />;
  return (
    <AppShell title="Remitos">
      <Ingreso />
    </AppShell>
  );
}

function parseRemito(text: string) {
  const skip = /cuit|fecha|remito|total|iva|subtotal|cliente|direcci[oó]n|domicilio|tel[eé]fono/i;
  return text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 2 && !skip.test(l))
    .map((l) => {
      const fin = l.match(/^(.{3,}?)\s+(\d+(?:[.,]\d+)?)$/);
      if (fin) return { descripcion: fin[1].replace(/[|$]/g, "").trim(), cantidad: fin[2].replace(",", ".") };
      const inicio = l.match(/^(\d+(?:[.,]\d+)?)\s+(.{3,})$/);
      if (inicio) return { descripcion: inicio[2].replace(/[|$]/g, "").trim(), cantidad: inicio[1].replace(",", ".") };
      return { descripcion: l, cantidad: "1" };
    })
    .filter((l) => l.descripcion.length > 1)
    .slice(0, 30);
}

async function leerFoto(
  file: File,
  setLineas: (v: { descripcion: string; cantidad: string }[]) => void,
  setFoto: (v: string) => void,
  setArchivo: (v: string) => void,
  setFuente: (v: "foto") => void,
  setLeyendo: (v: boolean) => void,
) {
  setLeyendo(true);
  setFoto(URL.createObjectURL(file));
  setArchivo(file.name);
  setFuente("foto");
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("spa");
    const { data } = await worker.recognize(file);
    await worker.terminate();
    const parsed = parseRemito(data.text);
    if (parsed.length) {
      setLineas(parsed);
      toast.success(`Leí ${parsed.length} líneas. Revisalas antes de cargar.`);
    } else {
      toast.message("La foto está. No distinguí líneas: completalas abajo.");
    }
  } catch {
    toast.error("No pude leer el texto. La foto queda y cargás las líneas a mano.");
  } finally {
    setLeyendo(false);
  }
}

function Ingreso() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const proveedores = useQuery({ queryKey: ["proveedores"], queryFn: () => listarProveedores() });
  const remitos = useQuery({ queryKey: ["remitos"], queryFn: () => listRemitos() });
  const [proveedorId, setProveedorId] = useState("");
  const [lineas, setLineas] = useState([{ descripcion: "", cantidad: "1" }]);
  const [fuente, setFuente] = useState<"manual" | "foto">("manual");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const crear = useMutation({
    mutationFn: () =>
      crearRemito({
        data: {
          proveedorId,
          fuente,
          archivoNombre: archivo ?? undefined,
          lineas: lineas
            .filter((l) => l.descripcion.trim() && Number(l.cantidad) > 0)
            .map((l) => ({ descripcion: l.descripcion.trim(), cantidad: Number(l.cantidad) })),
        },
      }),
    onSuccess: (res) => {
      toast.success("Remito cargado. Confirmá el match.");
      void qc.invalidateQueries({ queryKey: ["remitos"] });
      nav({ to: "/remitos/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const activos = (proveedores.data ?? []).filter((p) => p.activo);

  return (
    <section className="max-w-xl rounded-lg border border-line border-t-2 border-t-naranja bg-surface p-4">
      <h2 className="font-display text-lg font-semibold">Ingreso de mercadería</h2>
      <p className="mt-1 text-sm text-muted">
        Sacale una foto al remito o cargá las líneas a mano. El texto se lee en el celular y después confirmás el match.
      </p>
      <label className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-md border border-line px-3 text-sm font-medium">
        {leyendo ? "Leyendo foto…" : "Foto del remito"}
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={leyendo}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void leerFoto(file, setLineas, setFoto, setArchivo, setFuente, setLeyendo);
          }}
        />
      </label>
      {foto ? <img src={foto} alt="Remito" className="mt-3 max-h-56 w-full rounded-md object-contain bg-paper" /> : null}
      <label className="mt-3 block text-sm font-medium">
        Proveedor
        <select
          className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
          value={proveedorId}
          onChange={(e) => setProveedorId(e.target.value)}
        >
          <option value="">Elegir…</option>
          {activos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      {activos.length === 0 ? <p className="mt-1 text-xs text-muted">El dueño carga el directorio en Proveedores.</p> : null}
      <div className="mt-3 space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input
              className="min-w-0 flex-1"
              placeholder="Producto del papel"
              value={l.descripcion}
              onChange={(e) => setLineas((xs) => xs.map((x, n) => (n === i ? { ...x, descripcion: e.target.value } : x)))}
            />
            <Input
              className="w-24 shrink-0"
              inputMode="decimal"
              value={l.cantidad}
              onChange={(e) => setLineas((xs) => xs.map((x, n) => (n === i ? { ...x, cantidad: e.target.value } : x)))}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <Button
          variant="secondary"
          type="button"
          className="w-full"
          onClick={() => setLineas((xs) => [...xs, { descripcion: "", cantidad: "1" }])}
        >
          Otra línea
        </Button>
        <Button className="w-full" disabled={!proveedorId || crear.isPending} onClick={() => crear.mutate()}>
          Cargar remito
        </Button>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
        {(remitos.data ?? []).slice(0, 8).map((r) => (
          <li key={r.id}>
            <Link to="/remitos/$id" params={{ id: r.id }} className="flex justify-between gap-2 py-2">
              <span className="truncate">{r.proveedor ?? "Sin proveedor"}</span>
              <span className="shrink-0 text-xs text-muted">
                {r.estado} · {dayLabel(r.created_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
