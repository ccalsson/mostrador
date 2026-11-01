export type Escena = "banner" | "push" | "foto" | "puesto" | "usuario" | "visita" | "migracion";

export function escenaDe(id: string, kind: string): Escena {
  if (id.includes("banner") || kind === "advertising") return "banner";
  if (id.includes("push") || kind === "messaging") return "push";
  if (id.includes("credito")) return "foto";
  if (id.includes("usuario")) return "usuario";
  if (id.includes("capacit")) return "visita";
  if (id.includes("migrac")) return "migracion";
  return "puesto";
}

export function medidaDe(escena: Escena) {
  if (escena === "banner") return "Banner ancho, en la portada del teléfono";
  if (escena === "push") return "Aviso, al ancho de la pantalla";
  if (escena === "foto") return "Foto cuadrada, para publicar";
  if (escena === "usuario") return "Usuarios, en el teléfono del dueño";
  if (escena === "visita") return "La visita, anotada en el teléfono";
  if (escena === "migracion") return "Del papel a la lista del puesto";
  return "La pantalla del puesto";
}

export function MuestraTelefono({ escena }: { escena: Escena }) {
  return (
    <div className="w-[220px] rounded-[32px] bg-[#1a1612] p-[7px] shadow-[0_18px_40px_rgba(26,22,18,0.28)]">
      <div className="overflow-hidden rounded-[26px] bg-paper">
        <div className="flex items-center justify-between px-3 pt-1.5 text-[9px] text-ink/70">
          <span>9:41</span>
          <span className="h-3 w-14 rounded-full bg-[#1a1612]" />
          <span>5G</span>
        </div>
        <div className="px-2 pt-1 pb-2">
          {escena === "banner" ? <Banner /> : null}
          {escena === "push" ? <Push /> : null}
          {escena === "foto" ? <Foto /> : null}
          {escena === "puesto" ? <Puesto /> : null}
          {escena === "usuario" ? <Usuarios /> : null}
          {escena === "visita" ? <Visita /> : null}
          {escena === "migracion" ? <Migracion /> : null}
        </div>
        <div className="mx-auto mb-1.5 h-1 w-16 rounded-full bg-ink/20" />
      </div>
    </div>
  );
}

function Banner() {
  return (
    <div>
      <p className="px-1 pb-1 text-[10px] font-medium tracking-[0.14em] text-leaf uppercase">Mercado</p>
      <div className="relative h-[108px] overflow-hidden rounded-xl">
        <img src="/marketing/banner.jpg" alt="" className="h-full w-full object-cover object-[center_40%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f3d26]/80 via-[#0f3d26]/35 to-transparent" />
        <div className="absolute bottom-2 left-2 text-[#f4efe4]">
          <p className="text-[10px] tracking-wide uppercase">El puesto</p>
          <p className="font-display text-lg leading-none font-semibold">Banana</p>
          <p className="text-xs">$1.200 el cajón</p>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {["Espinaca", "Tomate", "Limón"].map((nombre) => (
          <div key={nombre} className="rounded-md bg-paper-2 px-1 py-1 text-[9px] text-ink-soft">{nombre}</div>
        ))}
      </div>
    </div>
  );
}

function Push() {
  return (
    <div className="relative h-[250px] overflow-hidden rounded-xl">
      <img src="/marketing/puesto.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[#1a1612]/35" />
      <p className="relative pt-6 text-center font-display text-3xl text-[#f4efe4]">9:41</p>
      <div className="relative mx-1 mt-4 flex gap-2 rounded-2xl bg-[#fffaf2]/95 p-2 shadow-lg">
        <img src="/marketing/foto.jpg" alt="" className="size-11 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="text-[10px] text-muted">El puesto · ahora</p>
          <p className="text-xs leading-snug font-medium">Llegó banana Ecuador. $1.200 el cajón.</p>
        </div>
      </div>
    </div>
  );
}

function Foto() {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl">
      <img src="/marketing/foto.jpg" alt="Banana y espinaca, muestra cuadrada" className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0f3d26]/85 to-transparent px-2 pt-8 pb-2 text-[#f4efe4]">
        <p className="text-[10px] tracking-wide uppercase">El puesto</p>
        <p className="font-display text-xl leading-none font-semibold">Banana $1.200</p>
      </div>
    </div>
  );
}

function Puesto() {
  return (
    <div>
      <div className="relative h-24 overflow-hidden rounded-xl">
        <img src="/marketing/puesto.jpg" alt="" className="h-full w-full object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f3d26]/70 to-transparent" />
        <p className="absolute bottom-1.5 left-2 font-display text-sm text-[#f4efe4]">Hoy en el puesto</p>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <div className="rounded-lg bg-surface px-2 py-1.5">
          <p className="text-[9px] text-muted">Caja</p>
          <p className="text-sm font-semibold tabular-nums">$84.000</p>
        </div>
        <div className="rounded-lg bg-surface px-2 py-1.5">
          <p className="text-[9px] text-muted">Pedidos</p>
          <p className="text-sm font-semibold">6</p>
        </div>
      </div>
    </div>
  );
}

function Usuarios() {
  return (
    <div>
      <img src="/marketing/puesto.jpg" alt="" className="h-16 w-full rounded-xl object-cover object-[center_30%]" />
      <ul className="mt-1.5 space-y-1">
        {[["Dueño", "En el puesto"], ["Cajero", "En caja"], ["Vendedor", "Tomando pedidos"], ["Uno más", "Para sumar"]].map(([nombre, detalle]) => (
          <li key={nombre} className="flex items-center justify-between rounded-lg bg-surface px-2 py-1">
            <span className="text-xs font-medium">{nombre}</span>
            <span className="text-[10px] text-muted">{detalle}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Visita() {
  return (
    <div className="overflow-hidden rounded-xl">
      <img src="/marketing/puesto.jpg" alt="" className="h-28 w-full object-cover" />
      <div className="bg-surface px-2 py-2">
        <p className="text-[10px] tracking-wide text-terra uppercase">Capacitación</p>
        <p className="font-display text-lg leading-tight">Martes, 9 h</p>
        <p className="text-[11px] text-ink-soft">En el puesto, con el equipo.</p>
      </div>
    </div>
  );
}

function Migracion() {
  return (
    <div>
      <img src="/marketing/banner.jpg" alt="" className="h-16 w-full rounded-xl object-cover" />
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px]">
        <div className="rounded-lg bg-paper-2 px-2 py-2">
          <p className="text-[10px] text-muted">Papel</p>
          <p>Banana</p>
          <p>Espinaca</p>
          <p>Tomate</p>
        </div>
        <div className="rounded-lg bg-ok-bg px-2 py-2">
          <p className="text-[10px] text-ok">En la lista</p>
          <p>Banana</p>
          <p>Espinaca</p>
          <p>Tomate</p>
        </div>
      </div>
    </div>
  );
}
