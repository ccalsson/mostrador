const TEXTO =
  "Add-ons y servicios. El precio es el del catálogo al confirmar, en dólares o en pesos con el dólar oficial más el 5 %, redondeado para arriba. Torre habilita el servicio después de ver el pago. Hasta entonces no se prende. Rigen las mismas condiciones de uso y la misma privacidad ya aceptadas.";

export function ChecksContrato({
  precio,
  uso,
  onPrecio,
  onUso,
}: {
  precio: boolean;
  uso: boolean;
  onPrecio: (value: boolean) => void;
  onUso: (value: boolean) => void;
}) {
  return (
    <div className="mt-4 space-y-2">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={precio} onChange={(event) => onPrecio(event.target.checked)} />
        <span>Acepto este servicio al precio que se muestra. Torre lo habilita después del pago.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={uso} onChange={(event) => onUso(event.target.checked)} />
        <span>Acepto que rigen las mismas condiciones de uso y la privacidad.</span>
      </label>
      <details className="ml-6">
        <summary className="cursor-pointer text-xs text-leaf">Condiciones del servicio</summary>
        <p className="mt-1 text-xs text-muted">{TEXTO}</p>
      </details>
    </div>
  );
}
