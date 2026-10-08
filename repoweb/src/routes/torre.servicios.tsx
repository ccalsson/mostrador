import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, SelectField, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listTenants } from "@/lib/torre-fn";
import { contratarProducto, listProducts, reemplazarProducto, serviciosDeTenant } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/servicios")({ component: Page });

function catalogo(p: {
  setupUsd: number | null;
  setupArs: number | null;
  recurringUsd: number | null;
  recurringArs: number | null;
  onceUsd: number | null;
  onceArs: number | null;
}) {
  const bits: string[] = [];
  const put = (label: string, usd: number | null, ars: number | null) => {
    const partes = [usd == null ? "" : `USD ${usd}`, ars == null ? "" : `ARS ${ars}`].filter(Boolean);
    if (partes.length) bits.push(`${label} ${partes.join(" / ")}`);
  };
  put("implementación", p.setupUsd, p.setupArs);
  put("recurrente", p.recurringUsd, p.recurringArs);
  put("único", p.onceUsd, p.onceArs);
  return bits.join(" · ") || "sin precio en el catálogo";
}

function monto(total: Record<string, number>) {
  const keys = Object.keys(total);
  if (keys.length === 0) return "0";
  return keys.map((key) => `${key} ${total[key]}`).join(" · ");
}

function Page() {
  const qc = useQueryClient();
  const tenants = useQuery({ queryKey: ["torre-tenants"], queryFn: () => listTenants() });
  const products = useQuery({ queryKey: ["torre-productos"], queryFn: () => listProducts() });
  const [tenantId, setTenantId] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [contentRef, setContentRef] = useState("");
  const chosen = tenantId || tenants.data?.[0]?.id || "";
  const servicios = useQuery({
    queryKey: ["torre-servicios", chosen],
    queryFn: () => serviciosDeTenant({ data: chosen }),
    enabled: Boolean(chosen),
  });
  const recargar = () => qc.invalidateQueries({ queryKey: ["torre-servicios", chosen] });
  return (
    <TorreShell title="Servicios">
      <SelectField
        label="Tenant"
        value={chosen}
        onChange={setTenantId}
        options={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
      />
      <p className="mt-3 text-sm">Mensual contratado: <span className="font-medium">{monto(servicios.data?.monthly ?? {})}</span></p>
      <p className="text-sm">A cobrar ahora: <span className="font-medium">{monto(servicios.data?.monthlyDue ?? {})}</span></p>
      <h2 className="mt-4 font-medium">Contratado</h2>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(servicios.data?.lines ?? []).map((line) => (
          <li key={line.id} className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{line.productName}{line.charge === "setup" ? " · implementación" : ""}</span>
              <Badge tone={line.status === "active" ? "ok" : "muted"}>{line.status}</Badge>
            </div>
            <p className="text-xs text-muted">
              {line.quantity} × {line.currency} {line.unitPrice} · {line.charge} · {line.frequency}
              {line.amountDue !== line.subtotal ? ` · a cobrar ${line.currency} ${line.amountDue}` : ""}
              {line.frozen ? " · precio congelado" : ""}
              {line.startsOn ? ` · desde ${line.startsOn}` : ""}
              {line.endsOn ? ` · hasta ${line.endsOn}` : ""}
              {line.nextDue ? ` · próximo ${line.nextDue}` : ""}
              {line.notes ? ` · ${line.notes}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <h2 className="mt-4 font-medium">Sucursales</h2>
      <ul className="mt-2 text-sm">
        {(servicios.data?.branches ?? []).map((b) => (
          <li key={b.id}>{b.name} · {b.included ? "incluida" : "adicional"} · {b.status}</li>
        ))}
      </ul>
      <h2 className="mt-4 font-medium">Contratar</h2>
      <p className="mt-1 max-w-2xl text-xs text-muted">El precio de catálogo se muestra para elegir. El importe de la línea lo fija el servidor. Una sucursal extra se da de alta en Sucursales. Una comisión no es un abono.</p>
      <div className="mt-2 grid max-w-xl gap-2 sm:grid-cols-2">
        <SelectField label="Moneda del contrato" value={currency} onChange={(value) => setCurrency(value === "ARS" ? "ARS" : "USD")} options={[{ value: "USD", label: "USD" }, { value: "ARS", label: "ARS" }]} />
        <Field label="Cantidad" value={quantity} onChange={setQuantity} type="number" />
        <Field label="Notas" value={notes} onChange={setNotes} />
        <Field label="Referencia del aviso" value={contentRef} onChange={setContentRef} />
      </div>
      <ul className="mt-2 space-y-2">
        {(products.data ?? []).filter((p) => p.status === "active").map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{p.name}</span>
              <span className="ml-2 text-xs text-muted">{p.kind} · {p.slug}</span>
              <span className="block text-xs text-muted">{catalogo(p)}</span>
            </span>
            {p.kind === "branch" || p.kind === "commission" ? (
              <span className="text-xs text-muted">{p.kind === "branch" ? "Alta en Sucursales" : "Condición en el catálogo"}</span>
            ) : (
            <span className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void contratarProducto({
                    data: {
                      tenantId: chosen,
                      productId: p.id,
                      currency,
                      quantity: Number(quantity) || 1,
                      start: new Date().toISOString().slice(0, 10),
                      notes,
                      contentRef,
                    },
                  })
                    .then((res) => {
                      toast.success("note" in res && res.note ? res.note : `Mensual: ${monto(res.monthly)}`);
                      return recargar();
                    })
                    .catch((err: Error) => toast.error(err.message));
                }}
              >
                Contratar
              </Button>
              {p.kind === "addon" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const activa = (servicios.data?.lines ?? []).find((line) => line.kind === "addon" && line.status === "active" && line.charge === "recurring");
                    if (!activa) {
                      toast.error("No hay un add-on activo para reemplazar.");
                      return;
                    }
                    if (!window.confirm(`¿Reemplazar ${activa.productName} por ${p.name}? El precio viejo queda en la línea cerrada.`)) return;
                    void reemplazarProducto({ data: { lineId: activa.id, productId: p.id, currency } })
                      .then(() => { toast.success("Servicio reemplazado"); return recargar(); })
                      .catch((err: Error) => toast.error(err.message));
                  }}
                >
                  Reemplazar
                </Button>
              ) : null}
            </span>
            )}
          </li>
        ))}
      </ul>
    </TorreShell>
  );
}
