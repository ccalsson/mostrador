import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  conectarTermica,
  onTermica,
  puedeConectarTermica,
  retomarTermica,
  viasTermica,
  type TermicaVia,
} from "@/lib/termica";

export function TermicaBoton() {
  const [nombre, setNombre] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elegir, setElegir] = useState(false);
  const disponible = puedeConectarTermica();
  const vias = viasTermica();

  useEffect(() => {
    const off = onTermica(setNombre);
    void retomarTermica();
    return () => {
      off();
    };
  }, []);

  function conectar(via?: TermicaVia) {
    setBusy(true);
    setElegir(false);
    void conectarTermica(via)
      .then((n) => toast.success(`Térmica lista: ${n}`))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  }

  if (elegir && vias.length > 1) {
    return (
      <div className="flex gap-1">
        {vias.map((via) => (
          <Button key={via} size="sm" variant="secondary" disabled={busy} onClick={() => conectar(via)}>
            {via === "usb" ? "USB" : "Bluetooth"}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant={nombre ? "primary" : "secondary"}
      disabled={!disponible || busy}
      title={
        disponible
          ? "Papel 80 mm. Conectá la térmica una vez por turno."
          : "Este navegador imprime por el diálogo, en papel de 80 mm."
      }
      onClick={() => {
        if (!nombre && vias.length > 1) setElegir(true);
        else conectar();
      }}
    >
      {nombre ? nombre : busy ? "Buscando…" : "Conectar térmica"}
    </Button>
  );
}
