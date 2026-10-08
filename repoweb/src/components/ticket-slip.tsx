import { money } from "@/lib/money";
import type { TicketContenido } from "@/lib/termica";
import { PAGO_LABEL } from "@/lib/types";

export function TicketSlip({ c, preview = false }: { c: TicketContenido; preview?: boolean }) {
  const fecha = new Date(c.fecha).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <article
      id="ticket-print"
      className={
        preview
          ? "ticket-80 mx-auto w-[80mm] border border-line bg-white px-3 py-3 text-black"
          : "ticket-80 pointer-events-none fixed top-0 -left-[120mm] w-[80mm] bg-white px-3 py-3 text-black print:left-0 print:top-0"
      }
    >
      <header className="text-center leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">{c.puesto}</div>
        {(c.bajada || "Mercado Central").split(/\n+/).map((linea) => (
          <div key={linea}>{linea}</div>
        ))}
        {c.membrete
          ? c.membrete.split(/\n+/).map((linea) => (
              <div key={linea}>{linea}</div>
            ))
          : null}
        <div className="mt-2">Ticket Nº {c.numero}</div>
        <div>{fecha}</div>
        {c.cliente ? <div>{c.cliente}</div> : null}
      </header>
      <div className="my-2 border-t border-dashed border-black" />
      <ul>
        {c.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-2 leading-tight">
            <span>
              {it.cantidad} {it.unidad} {it.nombre}
            </span>
            <span className="shrink-0">{money(it.subtotal ?? it.cantidad * it.precio)}</span>
          </li>
        ))}
      </ul>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between font-semibold">
        <span>TOTAL</span>
        <span>{money(c.total)}</span>
      </div>
      <div className="flex justify-between">
        <span>{PAGO_LABEL[c.formaPago] ?? c.formaPago}</span>
        <span>{c.recibido ? money(c.recibido) : ""}</span>
      </div>
      {c.formaPago === "efectivo" && c.vuelto ? (
        <div className="flex justify-between">
          <span>Vuelto</span>
          <span>{money(c.vuelto)}</span>
        </div>
      ) : null}
      <p className="mt-3 text-center text-[10px] leading-snug">{c.pie}</p>
      <p className="mt-1 text-center text-[10px]">No fiscal · Mostrador</p>
    </article>
  );
}
