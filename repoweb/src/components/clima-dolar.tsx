import { useQuery } from "@tanstack/react-query";

const MERCADO = { lat: -34.7, lon: -58.5 };

function textoClima(code: number) {
  if (code === 0) return "despejado";
  if (code <= 3) return "nublado";
  if (code === 45 || code === 48) return "niebla";
  if (code <= 67) return "lluvia";
  if (code <= 77) return "nieve";
  if (code <= 82) return "chaparrón";
  if (code >= 95) return "tormenta";
  return "variable";
}

async function cargarDecoro() {
  const [dolarRes, climaRes] = await Promise.all([
    fetch("https://dolarapi.com/v1/dolares/oficial"),
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${MERCADO.lat}&longitude=${MERCADO.lon}&current=temperature_2m,weather_code&timezone=America%2FArgentina%2FBuenos_Aires`,
    ),
  ]);
  if (!dolarRes.ok || !climaRes.ok) throw new Error("sin dato");
  const dolar = (await dolarRes.json()) as { venta?: number; compra?: number };
  const clima = (await climaRes.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  if (typeof dolar.venta !== "number" || typeof clima.current?.temperature_2m !== "number") {
    throw new Error("sin dato");
  }
  return {
    venta: dolar.venta,
    compra: typeof dolar.compra === "number" ? dolar.compra : null,
    temp: Math.round(clima.current.temperature_2m),
    cielo: textoClima(clima.current.weather_code ?? -1),
  };
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function ClimaDolar() {
  const q = useQuery({
    queryKey: ["decoro"],
    queryFn: cargarDecoro,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });
  if (q.isError || !q.data) {
    return <span className="text-xs text-muted">{q.isPending ? "Clima…" : ""}</span>;
  }
  const d = q.data;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
      <span className="rounded-full border border-line bg-surface px-2 py-0.5">
        Oficial <span className="font-medium tabular-nums text-ink">${pesos.format(d.venta)}</span>
        {d.compra != null ? (
          <span className="text-muted"> · compra ${pesos.format(d.compra)}</span>
        ) : null}
      </span>
      <span>
        Mercado Central · {d.temp}° {d.cielo}
      </span>
    </p>
  );
}
