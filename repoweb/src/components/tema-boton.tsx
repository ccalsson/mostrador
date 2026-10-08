import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const CLAVE = "mostrador-tema";

export const TEMA_BOOT = `(function(){try{var t=localStorage.getItem("${CLAVE}");var o=t==="oscuro"||(t!=="claro"&&matchMedia("(prefers-color-scheme: dark)").matches);if(o)document.documentElement.classList.add("dark");document.documentElement.style.colorScheme=o?"dark":"light";}catch(e){}})();`;

function aplicar(oscuro: boolean) {
  document.documentElement.classList.toggle("dark", oscuro);
  document.documentElement.style.colorScheme = oscuro ? "dark" : "light";
  try {
    localStorage.setItem(CLAVE, oscuro ? "oscuro" : "claro");
  } catch {
    /* ignore */
  }
}

export function TemaBoton({ tono = "barra" }: { tono?: "barra" | "pagina" }) {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    setOscuro(document.documentElement.classList.contains("dark"));
  }, []);

  return (
    <button
      type="button"
      aria-label={oscuro ? "Usar modo claro" : "Usar modo oscuro"}
      title={oscuro ? "Modo claro" : "Modo oscuro"}
      onClick={() => {
        const next = !document.documentElement.classList.contains("dark");
        aplicar(next);
        setOscuro(next);
      }}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-[10px]",
        tono === "barra"
          ? "text-leaf-fg/85 hover:bg-white/10"
          : "border border-line bg-surface text-ink hover:bg-paper-2",
      )}
    >
      {oscuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
