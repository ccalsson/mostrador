import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAds, listPacks, listProducts, registrarConsumo, setAdStatus } from "@/lib/torre/control-fn";

export const Route = createFileRoute("/torre/publicidad")({ component: Page });

const ESTADOS = ["draft", "pending_payment", "scheduled", "active", "expired", "cancelled"] as const;

const ESTADO: Record<string, string> = {
  draft: "Borrador",
  pending_payment: "Pago pendiente",
  scheduled: "Programado",
  active: "Activo",
  expired: "Vencido",
  cancelled: "Cancelado",
};

function Page() {
  const qc = useQueryClient();
  const ads = useQuery({ queryKey: ["torre-ads"], queryFn: () => listAds() });
  const packs = useQuery({ queryKey: ["torre-packs"], queryFn: () => listPacks() });
  const productos = useQuery({ queryKey: ["torre-productos"], queryFn: () => listProducts() });
  const catalogo = (productos.data ?? []).filter((p) => p.kind === "advertising" || p.kind === "messaging");
  return (
    <TorreShell title="Publicidad">
      <p className="mb-3 text-sm text-muted">Torre habilita el add-on y el espacio. El dueño escribe el banner en Mostrador. Acá no se arma el aviso ni se manda un push.</p>
      <h2 className="mb-2 font-medium">Catálogo publicitario</h2>
      <ul className="mb-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {catalogo.map((p) => (
          <li key={p.id} className="px-3 py-2">
            <span className="font-medium">{p.name}</span>
            <span className="ml-2 text-xs text-muted">{p.kind} · {p.status} · {p.billing} · {p.frequency}</span>
            <p className="text-xs text-muted">{p.description}</p>
            <p className="text-xs text-muted">{describir(p.configJson)}</p>
          </li>
        ))}
        {catalogo.length === 0 ? <li className="px-3 py-3 text-muted">No hay productos de publicidad ni de envío en el catálogo.</li> : null}
      </ul>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(ads.data ?? []).map((ad) => (
          <li key={ad.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              <span className="block font-medium">{ad.productName} · {ad.tenantName}</span>
              <span className="text-xs text-muted">{ad.placement} · {ad.startsOn} → {ad.endsOn} · {ad.currency} {ad.price}</span>
              {ad.contentRef ? <span className="block text-xs text-muted">{ad.contentRef}</span> : null}
              {ad.notes ? <span className="block text-xs text-muted">{ad.notes}</span> : null}
            </span>
            <span className="flex flex-col items-end gap-2">
              <Badge tone={ad.status === "active" || ad.status === "scheduled" ? "ok" : "muted"}>{ESTADO[ad.status] ?? ad.status}</Badge>
              <select
                className="h-11 rounded-md border border-line bg-paper px-2 text-xs"
                value={ad.status}
                onChange={(e) => {
                  const status = e.target.value;
                  void setAdStatus({ data: { id: ad.id, status } })
                    .then(() => qc.invalidateQueries({ queryKey: ["torre-ads"] }))
                    .catch((err: Error) => toast.error(err.message));
                }}
              >
                {ESTADOS.map((status) => (
                  <option key={status} value={status}>{ESTADO[status]}</option>
                ))}
              </select>
            </span>
          </li>
        ))}
      </ul>
      <h2 className="mt-4 font-medium">Packs de envío</h2>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(packs.data ?? []).map((pack) => (
          <li key={pack.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              <span className="block font-medium">{pack.productName} · {pack.tenantName}</span>
              <span className="text-xs text-muted">{pack.consumed} usados · {pack.remaining} restantes de {pack.quantity} · {pack.status}</span>
              <span className="block text-xs text-muted">comprado {pack.purchasedOn}{pack.expiresOn ? ` · vence ${pack.expiresOn}` : ""}</span>
            </span>
            <Consumo id={pack.id} onHecho={() => void qc.invalidateQueries({ queryKey: ["torre-packs"] })} />
          </li>
        ))}
      </ul>
    </TorreShell>
  );
}

function describir(configJson: string) {
  try {
    const cfg = JSON.parse(configJson) as Record<string, unknown>;
    return [
      cfg.placement ? `lugar ${cfg.placement}` : "",
      cfg.days ? `${cfg.days} días` : "",
      cfg.sends ? `${cfg.sends} envíos` : "",
      cfg.credits ? `${cfg.credits} créditos` : "",
      cfg.tier ? String(cfg.tier) : "",
    ].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

function Consumo({ id, onHecho }: { id: string; onHecho: () => void }) {
  const [n, setN] = useState("1");
  const [ocupado, setOcupado] = useState(false);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const amount = Number(n);
        if (!amount) return;
        setOcupado(true);
        void registrarConsumo({ data: { id, amount } })
          .then(onHecho)
          .catch((err: Error) => toast.error(err.message))
          .finally(() => setOcupado(false));
      }}
    >
      <input className="h-10 w-16 rounded-md border border-line bg-paper px-2 text-sm" type="number" min={1} value={n} onChange={(event) => setN(event.target.value)} />
      <Button type="submit" size="sm" disabled={ocupado}>Anotar</Button>
    </form>
  );
}
