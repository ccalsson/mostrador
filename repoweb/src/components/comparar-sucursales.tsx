import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compararEconomia } from "@/lib/sucursales-puesto";
import { money } from "@/lib/money";

const COLORES = ["var(--color-leaf)", "var(--color-terra)", "#5c6b3a"];

type Campo = "ventas" | "tickets" | "stock";

export function CompararSucursales() {
  const [dias, setDias] = useState<7 | 30>(7);
  const [campo, setCampo] = useState<Campo>("ventas");
  const [elegidas, setElegidas] = useState<string[] | null>(null);
  const datos = useQuery({
    queryKey: ["comparar-sucursales", dias],
    queryFn: () => compararEconomia({ data: dias }),
  });
  const localidades = datos.data?.localidades ?? [];
  const activas = elegidas ?? localidades.filter((item) => item.esMatriz).map((item) => item.id);
  const visibles = localidades.filter((item) => activas.includes(item.id));

  function alternar(id: string) {
    const base = elegidas ?? localidades.filter((item) => item.esMatriz).map((item) => item.id);
    setElegidas(base.includes(id) ? base.filter((item) => item !== id) : [...base, id]);
  }

  const filas = (datos.data?.serie ?? []).map((punto) => {
    const fila: Record<string, string | number> = { dia: punto.dia.slice(5) };
    for (const localidad of visibles) {
      const valor = punto.valores[localidad.id];
      fila[localidad.id] = campo === "tickets" ? (valor?.n ?? 0) : (valor?.total ?? 0);
    }
    return fila;
  });

  return (
    <section className="rounded-[10px] border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Economía de los puestos</h2>
        <p className="text-xs text-muted">La matriz entra sola. Sumá la sucursal para comparar.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {localidades.map((item) => {
          const activo = activas.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => alternar(item.id)}
              className={activo ? "h-8 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-8 rounded-md border border-line px-3 text-sm"}
            >
              {item.esMatriz ? "Matriz" : item.nombre}
            </button>
          );
        })}
        <span className="mx-1 w-px bg-line" />
        {([7, 30] as const).map((valor) => (
          <button key={valor} type="button" onClick={() => setDias(valor)} className={dias === valor ? "h-8 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-8 rounded-md border border-line px-3 text-sm"}>
            {valor} días
          </button>
        ))}
        {(["ventas", "tickets", "stock"] as const).map((valor) => (
          <button key={valor} type="button" onClick={() => setCampo(valor)} className={campo === valor ? "h-8 rounded-md bg-btn px-3 text-sm text-btn-fg" : "h-8 rounded-md border border-line px-3 text-sm"}>
            {valor === "ventas" ? "Ventas" : valor === "tickets" ? "Tickets" : "Stock"}
          </button>
        ))}
      </div>
      {visibles.length === 0 ? <p className="mt-3 text-sm text-muted">Elegí al menos un puesto.</p> : null}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {visibles.map((item) => (
          <li key={item.id} className="rounded-md border border-line bg-paper px-3 py-2 text-sm">
            <p className="font-medium">{item.nombre}</p>
            <p className="text-muted">
              {campo === "stock"
                ? `${item.stock} en stock · ${item.stockBajo} bajo mínimo`
                : campo === "tickets"
                  ? `${item.tickets} tickets`
                  : money(item.ventas)}
            </p>
          </li>
        ))}
      </ul>
      {campo === "stock" ? (
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibles.map((item) => ({ nombre: item.nombre, stock: item.stock }))}>
              <XAxis dataKey="nombre" stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted)" fontSize={11} width={36} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="stock" fill="var(--color-leaf)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filas}>
              <XAxis dataKey="dia" stroke="var(--color-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(valor: number) => (campo === "ventas" ? `${Math.round(valor / 1000)}k` : String(valor))} stroke="var(--color-muted)" fontSize={11} width={32} tickLine={false} axisLine={false} />
              <Tooltip formatter={(valor) => (campo === "ventas" ? money(Number(valor)) : String(valor))} />
              {visibles.map((item, indice) => (
                <Line key={item.id} type="monotone" dataKey={item.id} name={item.nombre} stroke={COLORES[indice % COLORES.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
