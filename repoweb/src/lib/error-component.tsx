import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-ink">
      <span className="text-terra" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-xl font-semibold">No se pudo abrir</h1>
      <p className="max-w-md text-sm text-muted">
        Recargá la página. Si sigue igual, cerrá esta pestaña y volvé a entrar.
      </p>
      <button
        type="button"
        className="mt-1 h-11 rounded-md bg-leaf px-4 text-sm font-medium text-leaf-fg"
        onClick={() => window.location.reload()}
      >
        Recargar
      </button>
      <p className="max-w-md text-xs break-words text-muted">{errorMessage(error)}</p>
    </main>
  );
}