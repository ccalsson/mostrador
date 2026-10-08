import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONDICION_LABEL, numeroFiscal, type Condicion } from "@/lib/afip-calc";
import {
  emitirFactura,
  emitirNotaCredito,
  guardarAfipConfig,
  listarFacturacion,
  probarAfip,
  setArcaHabilitada,
} from "@/lib/afip-fn";
import { clock, money } from "@/lib/money";

export function FacturacionAfip() {
  const panel = useQuery({ queryKey: ["facturacion"], queryFn: () => listarFacturacion(), staleTime: 0 });
  const cfg = panel.data?.config;
  const inhabilitado = !cfg?.habilitada;
  return (
    <section className="max-w-3xl rounded-lg border border-line border-t-2 border-t-terra bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold">ARCA</h2>
        <span className="rounded-full bg-warn-bg px-2.5 py-1 text-xs font-medium text-terra">
          {inhabilitado ? "Inhabilitado" : "Habilitado"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {inhabilitado
          ? "ARCA está inhabilitado. No se emite factura ni nota de crédito hasta que el dueño lo habilite."
          : "El CAE lo pide ARCA al cobrar, o desde esta cola si quedó pendiente. Frutas y verduras frescas van al 10,5 % incluido."}
      </p>
      {panel.isPending ? <p className="mt-3 text-sm text-muted">Cargando…</p> : null}
      {panel.error ? <p className="mt-3 text-sm text-terra">{(panel.error as Error).message}</p> : null}
      {cfg ? <Configuracion inicial={cfg} /> : null}
      {cfg?.habilitada ? <Cola pendientes={panel.data?.pendientes ?? []} emitidas={panel.data?.emitidas ?? []} /> : null}
    </section>
  );
}

type Cfg = {
  cuit: string;
  razonSocial: string;
  domicilio: string;
  condicion: Condicion;
  puntoVenta: number;
  inicioActividades: string;
  iibb: string;
  alicuota: number;
  ambiente: "homo" | "prod";
  certCargado: boolean;
  keyCargada: boolean;
  lista: boolean;
  habilitada: boolean;
};

function Configuracion({ inicial }: { inicial: Cfg }) {
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState(!inicial.lista);
  const [form, setForm] = useState(inicial);
  const [cert, setCert] = useState("");
  const [key, setKey] = useState("");
  const guardar = useMutation({
    mutationFn: () =>
      guardarAfipConfig({
        data: {
          ...form,
          puntoVenta: Number(form.puntoVenta),
          alicuota: Number(form.alicuota),
          certPem: cert,
          keyPem: key,
        },
      }),
    onSuccess: () => {
      toast.success("Datos de ARCA guardados");
      setCert("");
      setKey("");
      setAbierta(false);
      void qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const habilitar = useMutation({
    mutationFn: (habilitada: boolean) => setArcaHabilitada({ data: { habilitada } }),
    onSuccess: (r) => {
      toast.success(r.habilitada ? "ARCA habilitado" : "ARCA inhabilitado");
      void qc.invalidateQueries({ queryKey: ["facturacion"] });
      void qc.invalidateQueries({ queryKey: ["afip-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const probar = useMutation({
    mutationFn: () => probarAfip(),
    onSuccess: (r) => toast.success(`Conexión ${r.app} · acceso otorgado`),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!abierta) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span>
          {form.razonSocial || "Sin razón social"} · CUIT {form.cuit || "—"} · PV {form.puntoVenta} ·{" "}
          {form.ambiente === "prod" ? "Producción" : "Homologación"}
        </span>
        <Button size="sm" variant="secondary" onClick={() => setAbierta(true)}>
          Editar
        </Button>
        <Button size="sm" variant="secondary" disabled={probar.isPending || !inicial.lista} onClick={() => probar.mutate()}>
          Probar conexión
        </Button>
        {inicial.habilitada ? (
          <Button size="sm" variant="secondary" disabled={habilitar.isPending} onClick={() => habilitar.mutate(false)}>
            Inhabilitar
          </Button>
        ) : (
          <Button size="sm" disabled={habilitar.isPending || !inicial.lista} onClick={() => habilitar.mutate(true)}>
            Habilitar
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      {form.ambiente === "prod" ? (
        <p className="sm:col-span-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-terra">
          Producción emite comprobantes reales.
        </p>
      ) : (
        <p className="sm:col-span-2 text-xs text-muted">Homologación no tiene validez fiscal. Sirve para probar el certificado.</p>
      )}
      <Campo label="CUIT" value={form.cuit} onChange={(cuit) => setForm({ ...form, cuit })} />
      <Campo label="Razón social" value={form.razonSocial} onChange={(razonSocial) => setForm({ ...form, razonSocial })} />
      <Campo label="Domicilio fiscal" value={form.domicilio} onChange={(domicilio) => setForm({ ...form, domicilio })} />
      <Campo label="Ingresos brutos" value={form.iibb} onChange={(iibb) => setForm({ ...form, iibb })} />
      <label className="block text-sm font-medium">
        Condición
        <select
          className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
          value={form.condicion === "consumidor_final" ? "ri" : form.condicion}
          onChange={(e) => setForm({ ...form, condicion: e.target.value as Condicion })}
        >
          <option value="ri">Responsable inscripto</option>
          <option value="monotributo">Monotributo</option>
          <option value="exento">Exento</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Punto de venta
        <Input className="mt-1" inputMode="numeric" value={String(form.puntoVenta)} onChange={(e) => setForm({ ...form, puntoVenta: Number(e.target.value.replace(/\D/g, "") || 0) })} />
      </label>
      <label className="block text-sm font-medium">
        Inicio de actividades
        <Input className="mt-1" type="date" value={form.inicioActividades} onChange={(e) => setForm({ ...form, inicioActividades: e.target.value })} />
      </label>
      <label className="block text-sm font-medium">
        IVA de la mercadería
        <select
          className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
          value={String(form.alicuota)}
          onChange={(e) => setForm({ ...form, alicuota: Number(e.target.value) })}
        >
          <option value="10.5">10,5 % frutas y verduras</option>
          <option value="21">21 %</option>
          <option value="0">0 %</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Ambiente
        <select
          className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
          value={form.ambiente}
          onChange={(e) => setForm({ ...form, ambiente: e.target.value as "homo" | "prod" })}
        >
          <option value="homo">Homologación</option>
          <option value="prod">Producción</option>
        </select>
      </label>
      <Archivo label={inicial.certCargado ? "Certificado cargado" : "Certificado .crt"} onLoad={setCert} />
      <Archivo label={inicial.keyCargada ? "Clave cargada" : "Clave privada .key"} onLoad={setKey} />
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={guardar.isPending}>
          Guardar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAbierta(false)}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Archivo({ label, onLoad }: { label: string; onLoad: (text: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-1 block w-full text-sm"
        type="file"
        accept=".crt,.cer,.pem,.key,.txt"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void file.text().then(async (text) => {
            if (text.includes("BEGIN")) {
              onLoad(text);
              return;
            }
            const bytes = new Uint8Array(await file.arrayBuffer());
            let bin = "";
            for (const b of bytes) bin += String.fromCharCode(b);
            onLoad(btoa(bin));
          });
        }}
      />
    </label>
  );
}

function Cola({
  pendientes,
  emitidas,
}: {
  pendientes: { id: string; monto: number; createdAt: string; cliente: string; numero: number | null; error: string | null }[];
  emitidas: {
    id: string;
    nombre: string;
    puntoVenta: number;
    numero: number | null;
    cae: string | null;
    total: number;
    receptorNombre: string | null;
    cbteTipo: number;
    ambiente: string;
  }[];
}) {
  const qc = useQueryClient();
  const emitir = useMutation({
    mutationFn: (cobroId: string) => emitirFactura({ data: { cobroId } }),
    onSuccess: (f) => {
      toast.success(`${f.nombre} ${f.cae ? `CAE ${f.cae}` : "lista"}`);
      void qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const nota = useMutation({
    mutationFn: (facturaId: string) => emitirNotaCredito({ data: { facturaId } }),
    onSuccess: () => {
      toast.success("Nota de crédito autorizada");
      void qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-medium">Sin facturar</h3>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {pendientes.length === 0 ? <li className="px-3 py-3 text-sm text-muted">No hay cobros pendientes.</li> : null}
          {pendientes.map((p) => (
            <li key={p.id} className="px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate">{p.cliente}</span>
                  <span className="text-xs text-muted">
                    {p.numero ? `Nº ${p.numero} · ` : ""}
                    {clock(p.createdAt)} · {money(p.monto)}
                  </span>
                </span>
                <Button size="sm" disabled={emitir.isPending} onClick={() => emitir.mutate(p.id)}>
                  Emitir
                </Button>
              </div>
              {p.error ? <p className="mt-1 text-xs text-terra">{p.error}</p> : null}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-medium">Autorizadas</h3>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {emitidas.length === 0 ? <li className="px-3 py-3 text-sm text-muted">Todavía no hay CAE.</li> : null}
          {emitidas.map((f) => (
            <li key={f.id} className="px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <Link to="/factura/$id" params={{ id: f.id }} className="block truncate font-medium text-leaf">
                    {f.nombre} {f.numero ? numeroFiscal(f.puntoVenta, f.numero) : ""}
                  </Link>
                  <span className="text-xs text-muted">
                    {f.receptorNombre} · {money(f.total)}
                    {f.ambiente === "homo" ? " · prueba" : ""}
                  </span>
                </span>
                {f.cbteTipo === 1 || f.cbteTipo === 6 || f.cbteTipo === 11 ? (
                  <Button size="sm" variant="secondary" disabled={nota.isPending} onClick={() => nota.mutate(f.id)}>
                    Nota de crédito
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
