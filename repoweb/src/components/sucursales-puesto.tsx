import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/money";
import {
  crearSucursalPuesto,
  importarClientesSucursal,
  sucursalesDelPuesto,
  transferirStockSucursal,
  usarSucursal,
} from "@/lib/sucursales-puesto";

export function SucursalesPuesto() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["sucursales-puesto"], queryFn: () => sucursalesDelPuesto() });
  const data = lista.data;
  const [nombre, setNombre] = useState("");
  const [referencia, setReferencia] = useState("");
  const [destino, setDestino] = useState("");
  const [producto, setProducto] = useState("");
  const [cantidad, setCantidad] = useState("");
  const refrescar = async () => {
    await qc.invalidateQueries();
  };
  const crear = useMutation({
    mutationFn: () => crearSucursalPuesto({ data: { nombre, referencia } }),
    onSuccess: async (res) => {
      toast.success(`Sucursal lista. Copió ${res.productos} productos, con stock en cero.`);
      setNombre("");
      setReferencia("");
      await refrescar();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const entrar = useMutation({
    mutationFn: (id: string) => usarSucursal({ data: id }),
    onSuccess: async () => {
      toast.success("Estás en esa sucursal.");
      await refrescar();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const pasar = useMutation({
    mutationFn: () => transferirStockSucursal({ data: { destinoId: destino, productoId: producto, cantidad: Number(cantidad) } }),
    onSuccess: async () => {
      toast.success("Stock transferido.");
      setCantidad("");
      await refrescar();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const importar = useMutation({
    mutationFn: (id: string) => importarClientesSucursal({ data: id }),
    onSuccess: (res) => toast.success(res.copiados ? `Entraron ${res.copiados} fichas, sin saldo.` : "Esas fichas ya estaban."),
    onError: (error: Error) => toast.error(error.message),
  });
  if (lista.isPending || !data) return null;
  const otras = data.sucursales.filter((item) => !item.esMatriz);
  const totalVentas = data.cruce.reduce((suma, item) => suma + item.ventas, 0);
  return (
    <section className="rounded-[10px] border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Sucursales</h2>
        <p className="text-xs text-muted">
          {data.usadas} de {data.cupo} · {data.incluidas} en el plan{data.extras > 0 ? ` · ${data.extras} extra` : ""}
        </p>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.sucursales.map((item) => (
          <li key={item.id} className="rounded-md border border-line bg-paper px-3 py-3">
            <p className="font-medium">{item.nombre}</p>
            <p className="text-sm text-muted">{item.esMatriz ? "Casa matriz" : item.referencia || "Sin referencia"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant={item.esActual ? "secondary" : "primary"} disabled={item.esActual || entrar.isPending} onClick={() => entrar.mutate(item.id)}>
                {item.esActual ? "Estás acá" : "Entrar"}
              </Button>
              {!item.esMatriz && data.esDueno ? (
                <Button size="sm" variant="secondary" disabled={importar.isPending} onClick={() => importar.mutate(item.id)}>
                  Importar fichas
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {data.puedeCrear ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            crear.mutate();
          }}
        >
          <input className="h-11 rounded-md border border-line bg-paper px-3 text-sm" value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre de la sucursal" />
          <input className="h-11 rounded-md border border-line bg-paper px-3 text-sm" value={referencia} onChange={(event) => setReferencia(event.target.value)} placeholder="Nave, puesto, calle" />
          <Button type="submit" disabled={crear.isPending}>Crear</Button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted">Para otra sucursal, Torre tiene que habilitar el lugar.</p>
      )}
      {data.cruce.length > 1 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm font-medium">Todo el negocio · 7 días · {money(totalVentas)}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {data.cruce.map((item) => (
              <li key={item.id} className="text-sm">
                <span className="font-medium">{item.nombre}</span>
                <span className="text-muted"> · {money(item.ventas)} · {item.tickets} tickets · {item.stockBajo} con stock bajo</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.esDueno && otras.length > 0 && data.productos.length > 0 ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            pasar.mutate();
          }}
        >
          <select className="h-11 rounded-md border border-line bg-paper px-2 text-sm" value={destino} onChange={(event) => setDestino(event.target.value)}>
            <option value="">Sucursal que recibe</option>
            {otras.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
          <select className="h-11 rounded-md border border-line bg-paper px-2 text-sm" value={producto} onChange={(event) => setProducto(event.target.value)}>
            <option value="">Producto de la matriz</option>
            {data.productos.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre} · {item.stock}</option>
            ))}
          </select>
          <input className="h-11 rounded-md border border-line bg-paper px-3 text-sm" inputMode="decimal" value={cantidad} onChange={(event) => setCantidad(event.target.value)} placeholder="Cantidad" />
          <Button type="submit" disabled={pasar.isPending}>Transferir</Button>
        </form>
      ) : null}
    </section>
  );
}
