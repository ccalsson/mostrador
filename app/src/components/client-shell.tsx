import { Link } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { TemaBoton } from "@/components/tema-boton";

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <header className="z-30 shrink-0 border-b border-leaf-2 bg-leaf-2 text-leaf-fg">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2">
          <Link to="/portal" className="min-w-0">
            <span className="block font-display text-sm font-semibold">Frutas Román, el Jujeño</span>
            <span className="block text-[11px] text-ambar">Cliente</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <TemaBoton />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-3 py-3">{children}</main>
    </div>
  );
}
