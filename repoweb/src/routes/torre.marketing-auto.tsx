import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MarketingAuto } from "@/components/marketing-auto";
import { TorreShell } from "@/components/torre-shell";
import {
  listarCampanias,
  crearCampania,
  enviarCampania,
  cancelarCampania,
  listarSecuencias,
  crearSecuencia,
  toggleSecuencia,
  listarOfertas,
  crearOferta,
  toggleOferta,
  type CampaniaPush,
  type SecuenciaEmail,
  type OfertaAuto,
} from "@/lib/torre/marketing-fn";
import type { SegmentoPush, EventoTrigger, CondicionOferta } from "@/lib/torre/marketing-core";

type Tab = "campanias" | "secuencias" | "ofertas";

export const Route = createFileRoute("/torre/marketing-auto")({
  component: Page,
  validateSearch: (search: { tab?: string }) => ({
    tab: search.tab ?? "campanias",
  }),
});

function Page() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const currentTab = (["campanias", "secuencias", "ofertas"].includes(tab) ? tab : "campanias") as Tab;

  const campanias = useQuery({
    queryKey: ["torre-marketing-campanias"],
    queryFn: () => listarCampanias(),
  });

  const secuencias = useQuery({
    queryKey: ["torre-marketing-secuencias"],
    queryFn: () => listarSecuencias(),
  });

  const ofertas = useQuery({
    queryKey: ["torre-marketing-ofertas"],
    queryFn: () => listarOfertas(),
  });

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ["torre-marketing-campanias"] });
    await qc.invalidateQueries({ queryKey: ["torre-marketing-secuencias"] });
    await qc.invalidateQueries({ queryKey: ["torre-marketing-ofertas"] });
  };

  const handleCrearCampania = async (data: { nombre: string; segmento: SegmentoPush; titulo: string; cuerpo: string; programadoAt: string | null }) => {
    try {
      await crearCampania({ data });
      toast.success("Campana creada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleEnviarCampania = async (id: string) => {
    try {
      await enviarCampania({ data: id });
      toast.success("Campana enviada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCancelarCampania = async (id: string) => {
    try {
      await cancelarCampania({ data: id });
      toast.success("Campana cancelada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCrearSecuencia = async (data: { nombre: string; eventoTrigger: EventoTrigger; asunto: string; contenido: string }) => {
    try {
      await crearSecuencia({ data });
      toast.success("Secuencia creada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggleSecuencia = async (id: string) => {
    try {
      await toggleSecuencia({ data: id });
      toast.success("Secuencia actualizada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCrearOferta = async (data: { nombre: string; condicion: CondicionOferta; descuentoPct: number; mensaje: string }) => {
    try {
      await crearOferta({ data });
      toast.success("Oferta creada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggleOferta = async (id: string) => {
    try {
      await toggleOferta({ data: id });
      toast.success("Oferta actualizada");
      await invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <TorreShell title="Marketing Automation">
      <MarketingAuto
        tab={currentTab}
        campanias={(campanias.data ?? []) as CampaniaPush[]}
        secuencias={(secuencias.data ?? []) as SecuenciaEmail[]}
        ofertas={(ofertas.data ?? []) as OfertaAuto[]}
        isLoading={campanias.isPending || secuencias.isPending || ofertas.isPending}
        onTabChange={(t) => { void navigate({ search: (prev: Record<string, string>) => ({ ...prev, tab: t }) }); }}
        onCrearCampania={(data) => { void handleCrearCampania(data); }}
        onEnviarCampania={(id) => { void handleEnviarCampania(id); }}
        onCancelarCampania={(id) => { void handleCancelarCampania(id); }}
        onCrearSecuencia={(data) => { void handleCrearSecuencia(data); }}
        onToggleSecuencia={(id) => { void handleToggleSecuencia(id); }}
        onCrearOferta={(data) => { void handleCrearOferta(data); }}
        onToggleOferta={(id) => { void handleToggleOferta(id); }}
      />
    </TorreShell>
  );
}
