import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajustarStock, borrarFotoProducto, canalMercado, guardarCanalMercado, historialProducto, listProductos, reposicionSugerencia, resumenVentasProductos, saveProducto, subirFotoProducto } from "@/lib/fn";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import type { Moneda, Producto, Unidad } from "@/lib/types";

export const Route = createFileRoute("/productos")({ component: ProductosPage });

function empty(): Omit<Producto, "id" | "stock" | "stockBajo" | "orden"> {
  return {
    nombre: "",
    unidad: "bulto",
    unidadLabel: "cajón",
    precio: 0,
    moneda: "USD",
    stockMinimo: 5,
    alias: [],
    activo: true,
    publicadoOnline: false,
    fotoUrl: null,
  };
}

function ProductosPage() {
  const qc = useQueryClient();
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => listProductos() });
  const canal = useQuery({ queryKey: ["canal-mercado"], queryFn: () => canalMercado() });
  const ventas = useQuery({ queryKey: ["ventas-productos"], queryFn: () => resumenVentasProductos() });
  const publicarPuesto = useMutation({
    mutationFn: (activo: boolean) => guardarCanalMercado({ data: activo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["canal-mercado"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<(ReturnType<typeof empty> & { id?: string }) | null>(null);
  const [ajuste, setAjuste] = useState<{ id: string; cantidad: string; tipo: "ajuste" | "merma"; motivo: string } | null>(null);
  const [reposicionDias, setReposicionDias] = useState(7);
  const [reposicionVisible, setReposicionVisible] = useState(false);
  const reposicion = useQuery({
    queryKey: ["reposicion", reposicionDias],
    queryFn: () => reposicionSugerencia({ data: { dias: reposicionDias } }),
    enabled: reposicionVisible,
  });

  const save = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error("sin datos");
      return saveProducto({
        data: {
          id: edit.id,
          nombre: edit.nombre,
          unidad: edit.unidad,
          unidadLabel: edit.unidadLabel,
          precio: Number(edit.precio),
          moneda: edit.moneda ?? "USD",
          stockMinimo: Number(edit.stockMinimo),
          alias: edit.alias,
          activo: edit.activo,
          publicadoOnline: edit.publicadoOnline,
        },
      });
    },
    onSuccess: () => {
      toast.success("Producto guardado");
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stock = useMutation({
    mutationFn: () => {
      if (!ajuste) throw new Error("sin datos");
      return ajustarStock({
        data: {
          productoId: ajuste.id,
          cantidad: Number(ajuste.cantidad),
          tipo: ajuste.tipo,
          motivo: ajuste.motivo,
        },
      });
    },
    onSuccess: () => {
      toast.success("Stock actualizado");
      setAjuste(null);
      void qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fotoInputRef = useRef<HTMLInputElement>(null);
  const subirFoto = useMutation({
    mutationFn: async (file: File) => {
      if (!edit?.id) throw new Error("Guardá el producto antes de subir una foto.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return subirFotoProducto({
        data: {
          productoId: edit.id,
          fileBase64: base64,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      });
    },
    onSuccess: (data) => {
      if (edit) setEdit({ ...edit, fotoUrl: data.foto_url });
      void qc.invalidateQueries({ queryKey: ["productos"] });
      toast.success("Foto subida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const borrarFoto = useMutation({
    mutationFn: () => {
      if (!edit?.id) throw new Error("sin datos");
      return borrarFotoProducto({ data: edit.id });
    },
    onSuccess: () => {
      if (edit) setEdit({ ...edit, fotoUrl: null });
      void qc.invalidateQueries({ queryKey: ["productos"] });
      toast.success("Foto eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (productos.data ?? []).filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()));
  const elegido = rows.find((p) => p.id === sel) ?? (productos.data ?? []).find((p) => p.id === sel) ?? null;
  const historial = useQuery({
    queryKey: ["historial-producto", elegido?.id],
    queryFn: () => historialProducto({ data: elegido!.id }),
    enabled: Boolean(elegido),
  });

  function elegir(id: string) {
    setSel((actual) => (actual === id ? null : id));
  }

  return (
    <AppShell title="Productos">
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-sm" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => setEdit(empty())}>Nuevo producto</Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={canal.data?.activo === true}
            disabled={!canal.data?.presencia}
            onChange={(e) => publicarPuesto.mutate(e.target.checked)}
          />
          Este puesto aparece en Mercado al Toque
        </label>
      </div>
      {canal.data && !canal.data.presencia ? (
        <p className="mb-3 text-sm text-muted">Este puesto no tiene Presencia ni Pro. Publicar no alcanza para aparecer en Mercado.</p>
      ) : null}
      {canal.data?.presencia ? (
        <p className="mb-3 text-sm text-muted">
          Plan: {canal.data.tier === "pro" ? "Pro" : "Presencia"}.
          {canal.data.cuentaCorriente ? " Cuenta corriente habilitada." : " Cuenta corriente no incluida."}
          {canal.data.packs.map((pack) => ` ${pack.product}: ${pack.remaining} envíos.`)}
        </p>
      ) : null}
      <div className="mx-auto grid w-full max-w-6xl items-start gap-4 xl:grid-cols-[minmax(14rem,17rem)_minmax(0,40rem)_minmax(14rem,18rem)]">
        <RankingPanel
          titulo="Más vendidos · 7 días"
          filas={ventas.data?.semana ?? []}
          activo={sel}
          onElegir={elegir}
          className="order-2 xl:order-1"
        />
        <div className="order-1 min-w-0 xl:order-2">
          <div className="overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <div className="hidden bg-paper-2 font-medium text-muted sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_6.5rem_9.5rem]">
              <div className="px-2 py-2" />
              <div className="px-3 py-2">Nombre</div>
              <div className="px-3 py-2">Precio</div>
              <div className="px-3 py-2">Stock</div>
              <div className="px-3 py-2" />
            </div>
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-muted">Ningún producto con ese nombre.</p>
            ) : (
              rows.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => elegir(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      elegir(p.id);
                    }
                  }}
                  className={cn(
                    "grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-2 border-t border-line px-2 py-2 first:border-t-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_6.5rem_9.5rem] sm:px-0 sm:py-0",
                    sel === p.id ? "bg-ok-bg" : "hover:bg-paper",
                  )}
                >
                  <div className="flex items-center justify-center sm:py-2">
                    {p.fotoUrl ? (
                      <img
                        src={p.fotoUrl}
                        alt={p.nombre}
                        className="h-9 w-9 rounded object-cover"
                        loading="lazy"
                        style={{ maxWidth: 800 }}
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-paper-2 text-xs text-muted">
                        --
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 sm:px-3 sm:py-2">
                    <span className="font-medium">{p.nombre}</span>
                    {p.stockBajo ? (
                      <Badge tone="terra" className="ml-2">
                        Bajo
                      </Badge>
                    ) : null}
                    {!p.activo ? <span className="ml-2 text-xs text-muted">Baja</span> : null}
                  </div>
                  <div className="tabular-nums sm:px-3">{money(p.precio)}</div>
                  <div className="col-span-2 text-muted sm:col-span-1 sm:px-3">
                    <span className="tabular-nums text-ink">{p.stock}</span> {p.unidadLabel}
                  </div>
                  <div className="col-span-2 flex justify-end gap-1 pt-1 sm:col-span-1 sm:px-2 sm:py-1.5 sm:pt-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEdit(p);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAjuste({ id: p.id, cantidad: "1", tipo: "ajuste", motivo: "" });
                      }}
                    >
                      Stock
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="order-3 space-y-4">
          <section className="rounded-lg border border-line bg-surface p-3 text-sm">
            <h2 className="font-display text-base font-semibold">
              {elegido ? `Ventas · ${elegido.nombre}` : "Historial"}
            </h2>
            <p className="mt-1 text-xs text-muted">Últimos 7 días, pedidos cobrados o entregados. Tocá un producto.</p>
            {!elegido ? (
              <p className="mt-3 text-muted">Todavía no elegiste ninguno.</p>
            ) : historial.isPending ? (
              <p className="mt-3 text-muted">Cargando…</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {(historial.data?.dias ?? []).map((dia) => (
                  <li key={dia.dia} className="flex items-baseline justify-between gap-2 py-1.5">
                    <span className="text-muted">{dia.dia.slice(8, 10)}/{dia.dia.slice(5, 7)}</span>
                    <span className="tabular-nums">
                      {dia.cantidad} · {money(dia.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <RankingPanel titulo="Más vendidos · 30 días" filas={ventas.data?.mes ?? []} activo={sel} onElegir={elegir} />
        </div>
      </div>

      <ReposicionPanel
        visible={reposicionVisible}
        onToggle={() => setReposicionVisible((v) => !v)}
        dias={reposicionDias}
        onDiasChange={setReposicionDias}
        sugerencias={reposicion.data?.sugerencias ?? []}
        cargando={reposicion.isPending}
        onRefrescar={() => void reposicion.refetch()}
      />

      {edit ? (
        <Modal title={edit.id ? "Editar producto" : "Nuevo producto"} onClose={() => setEdit(null)}>
          <Field label="Nombre" value={edit.nombre} onChange={(v) => setEdit({ ...edit, nombre: v })} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm font-medium">
              Unidad
              <select
                className="mt-1 h-11 w-full rounded-md border border-line px-3"
                value={edit.unidad}
                onChange={(e) => setEdit({ ...edit, unidad: e.target.value as Unidad })}
              >
                <option value="bulto">Bulto</option>
                <option value="kg">Kg</option>
              </select>
            </label>
            <Field label="Etiqueta" value={edit.unidadLabel} onChange={(v) => setEdit({ ...edit, unidadLabel: v })} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm font-medium">
              Precio de lista
              <div className="mt-1 flex gap-2">
                <input
                  className="h-11 w-full rounded-md border border-line px-3 tabular-nums"
                  inputMode="decimal"
                  value={String(edit.precio)}
                  onChange={(e) => setEdit({ ...edit, precio: Number(e.target.value) || 0 })}
                />
                <select
                  className="h-11 rounded-md border border-line px-2"
                  value={edit.moneda ?? "USD"}
                  onChange={(e) => setEdit({ ...edit, moneda: e.target.value as Moneda })}
                >
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </div>
            </label>
            <Field
              label="Stock mínimo"
              value={String(edit.stockMinimo)}
              onChange={(v) => setEdit({ ...edit, stockMinimo: Number(v) || 0 })}
            />
          </div>
          <Field
            label="Alias (coma)"
            value={edit.alias.join(", ")}
            onChange={(v) => setEdit({ ...edit, alias: v.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={edit.activo} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} />
            Activo
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(edit.publicadoOnline)}
              disabled={!canal.data?.presencia}
              onChange={(e) => setEdit({ ...edit, publicadoOnline: e.target.checked })}
            />
            Publicado en Mercado al Toque
          </label>
          {!canal.data?.presencia ? <p className="mt-1 text-xs text-muted">Hace falta Presencia o Pro para publicar en Mercado.</p> : null}
          {edit.id ? (
            <div className="mt-3">
              <span className="block text-sm font-medium">Foto del producto</span>
              <div className="mt-1.5 flex items-center gap-3">
                {edit.fotoUrl ? (
                  <img
                    src={edit.fotoUrl}
                    alt={edit.nombre}
                    className="h-16 w-16 rounded-md border border-line object-cover"
                    loading="lazy"
                    style={{ maxWidth: 800 }}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-line bg-paper-2 text-xs text-muted">
                    Sin foto
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void subirFoto.mutate(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={subirFoto.isPending}
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    {subirFoto.isPending ? "Subiendo..." : edit.fotoUrl ? "Cambiar foto" : "Subir foto"}
                  </Button>
                  {edit.fotoUrl ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={borrarFoto.isPending}
                      onClick={() => borrarFoto.mutate()}
                    >
                      Borrar foto
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <Button className="mt-4 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            Guardar
          </Button>
        </Modal>
      ) : null}

      {ajuste ? (
        <Modal title="Movimiento de stock" onClose={() => setAjuste(null)}>
          <select
            className="h-11 w-full rounded-md border border-line px-3"
            value={ajuste.tipo}
            onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value as "ajuste" | "merma" })}
          >
            <option value="ajuste">Ajuste (+/-)</option>
            <option value="merma">Merma (resta)</option>
          </select>
          <Field label="Cantidad" value={ajuste.cantidad} onChange={(v) => setAjuste({ ...ajuste, cantidad: v })} />
          <Field label="Motivo" value={ajuste.motivo} onChange={(v) => setAjuste({ ...ajuste, motivo: v })} />
          <Button className="mt-4 w-full" disabled={!ajuste.motivo || stock.isPending} onClick={() => stock.mutate()}>
            Confirmar
          </Button>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function RankingPanel({
  titulo,
  filas,
  activo,
  onElegir,
  className,
}: {
  titulo: string;
  filas: { productoId: string; nombre: string; cantidad: number; total: number }[];
  activo: string | null;
  onElegir: (id: string) => void;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface p-3 text-sm", className)}>
      <h2 className="font-display text-base font-semibold">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="mt-2 text-muted">Sin ventas cobradas en este período.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {filas.map((fila, index) => (
            <li key={fila.productoId}>
              <button
                type="button"
                onClick={() => onElegir(fila.productoId)}
                className={cn("flex w-full items-baseline gap-2 py-2 text-left", activo === fila.productoId && "text-leaf")}
              >
                <span className="w-5 shrink-0 tabular-nums text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{fila.nombre}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {fila.cantidad} · {money(fila.total)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-3 block text-sm font-medium">
      {label}
      <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

type SugerenciaRepo = {
  productoId: string;
  nombre: string;
  cantidadSugerida: number;
  stockActual: number;
  promedioDiario: number;
  diasHastaAgotar: number | null;
};

function ReposicionPanel({
  visible,
  onToggle,
  dias,
  onDiasChange,
  sugerencias,
  cargando,
  onRefrescar,
}: {
  visible: boolean;
  onToggle: () => void;
  dias: number;
  onDiasChange: (d: number) => void;
  sugerencias: SugerenciaRepo[];
  cargando: boolean;
  onRefrescar: () => void;
}) {
  return (
    <section className={cn("mt-4 rounded-lg border border-line bg-surface", visible && "border-t-2 border-t-terra")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-semibold">Reposición según historial</h2>
          {sugerencias.length > 0 && visible ? (
            <Badge tone="terra">{sugerencias.length} productos</Badge>
          ) : null}
        </div>
        <span className="text-sm text-muted">{visible ? "Cerrar" : "Ver sugerencias"}</span>
      </button>
      {visible ? (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted">Período de análisis:</span>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDiasChange(d)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  dias === d ? "bg-terra text-white" : "bg-paper-2 text-muted hover:text-ink",
                )}
              >
                {d} días
              </button>
            ))}
            <button
              type="button"
              onClick={onRefrescar}
              disabled={cargando}
              className="ml-auto rounded-md bg-paper-2 px-2.5 py-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
            >
              {cargando ? "Calculando..." : "Refrescar"}
            </button>
          </div>
          {cargando ? (
            <p className="py-6 text-center text-sm text-muted">Calculando sugerencias de reposición...</p>
          ) : sugerencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No hay productos que necesiten reposición en los últimos {dias} días.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Producto</th>
                    <th className="pb-2 pr-3 text-right tabular-nums">Stock actual</th>
                    <th className="pb-2 pr-3 text-right tabular-nums">Venta/día</th>
                    <th className="pb-2 pr-3 text-right tabular-nums">Días hasta agotar</th>
                    <th className="pb-2 text-right tabular-nums">Sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {sugerencias.map((s) => (
                    <tr key={s.productoId} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3 font-medium">{s.nombre}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.stockActual}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted">{s.promedioDiario}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {s.diasHastaAgotar === null ? (
                          <span className="text-muted">—</span>
                        ) : s.diasHastaAgotar <= 1 ? (
                          <span className="font-medium text-alerta">{s.diasHastaAgotar} d</span>
                        ) : s.diasHastaAgotar <= 3 ? (
                          <span className="font-medium text-terra">{s.diasHastaAgotar} d</span>
                        ) : (
                          <span className="text-muted">{s.diasHastaAgotar} d</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium text-terra">
                        +{s.cantidadSugerida}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
