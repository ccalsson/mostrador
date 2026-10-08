/** Ticket 80 mm. Manda ESC/POS si hay térmica; si no, el diálogo del sistema. */

import { money } from "@/lib/money";
import { PAGO_LABEL, type FormaPago } from "@/lib/types";

export const PAPEL_MM = 80;
const COLUMNAS = 48;

export type TicketContenido = {
  puesto: string;
  bajada?: string;
  membrete?: string;
  numero: number;
  fecha: string;
  cliente?: string;
  items: { nombre: string; cantidad: number; unidad: string; precio: number; subtotal?: number }[];
  total: number;
  formaPago: FormaPago;
  recibido?: number;
  vuelto?: number;
  pie: string;
};

type Via = "bluetooth" | "usb";
export type TermicaVia = Via;

type Canal = {
  via: Via;
  nombre: string;
  escribir: (data: Uint8Array) => Promise<void>;
};

let canal: Canal | null = null;
const oyentes = new Set<(nombre: string | null) => void>();

function avisar() {
  const nombre = canal?.nombre ?? null;
  for (const fn of oyentes) fn(nombre);
}

export function onTermica(fn: (nombre: string | null) => void) {
  oyentes.add(fn);
  fn(canal?.nombre ?? null);
  return () => {
    oyentes.delete(fn);
  };
}

export function termicaConectada() {
  return canal?.nombre ?? null;
}

type UsbEndpoint = { direction: string; endpointNumber: number };
type UsbDevice = {
  productName?: string;
  configuration: {
    interfaces: { interfaceNumber: number; alternates: { endpoints: UsbEndpoint[] }[] }[];
  } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: ArrayBuffer): Promise<{ status: string }>;
};

type UsbApi = {
  requestDevice(opts: { filters: { classCode: number }[] }): Promise<UsbDevice>;
  getDevices(): Promise<UsbDevice[]>;
};

function usbApi(): UsbApi | null {
  return (navigator as Navigator & { usb?: UsbApi }).usb ?? null;
}

function aBuffer(data: Uint8Array): ArrayBuffer {
  const copia = new ArrayBuffer(data.byteLength);
  new Uint8Array(copia).set(data);
  return copia;
}

type BtChar = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue(value: ArrayBuffer): Promise<void>;
  writeValueWithoutResponse?(value: ArrayBuffer): Promise<void>;
};

type BtDevice = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryServices(): Promise<{ getCharacteristics(): Promise<BtChar[]> }[]>;
    }>;
  };
  addEventListener(type: "gattserverdisconnected", cb: () => void): void;
};

type BluetoothApi = {
  requestDevice(opts: { acceptAllDevices: true; optionalServices: string[] }): Promise<BtDevice>;
  getDevices?(): Promise<BtDevice[]>;
};

function bluetooth(): BluetoothApi | null {
  return (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth ?? null;
}

function vias(): Via[] {
  const tactil = window.matchMedia("(pointer: coarse)").matches;
  const lista: Via[] = [];
  if (tactil && bluetooth()) lista.push("bluetooth");
  if (usbApi()) lista.push("usb");
  if (!tactil && bluetooth()) lista.push("bluetooth");
  return lista;
}

export function puedeConectarTermica() {
  return vias().length > 0;
}

export function viasTermica(): Via[] {
  return vias();
}

const CP850: Record<string, number> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  Á: 0xb5,
  É: 0x90,
  Í: 0xd6,
  Ó: 0xe0,
  Ú: 0xe9,
  ñ: 0xa4,
  Ñ: 0xa5,
  ü: 0x81,
  Ü: 0x9a,
  "¿": 0xa8,
  "¡": 0xad,
  "°": 0xf8,
  "·": 0xfa,
};

function aCp850(texto: string): number[] {
  const limpio = texto.replace(/\u00a0|\u202f/g, " ");
  const out: number[] = [];
  for (const ch of limpio) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code >= 32 && code <= 126) out.push(code);
    else if (ch === "\n") out.push(0x0a);
    else if (CP850[ch] != null) out.push(CP850[ch]);
    else out.push(0x3f);
  }
  return out;
}

function fila(izq: string, der: string) {
  const derecha = der.replace(/\u00a0|\u202f/g, " ");
  const hueco = Math.max(1, COLUMNAS - derecha.length - 1);
  const izquierda = izq.length > hueco ? izq.slice(0, hueco) : izq;
  return izquierda + " ".repeat(Math.max(0, COLUMNAS - izquierda.length - derecha.length)) + derecha;
}

function centro(texto: string) {
  const t = texto.length > COLUMNAS ? texto.slice(0, COLUMNAS) : texto;
  const pad = Math.floor((COLUMNAS - t.length) / 2);
  return " ".repeat(pad) + t;
}

export function lineasTicket(c: TicketContenido): string[] {
  const fecha = new Date(c.fecha).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const lineas = [centro(c.puesto)];
  for (const parte of (c.bajada || "Mercado Central").split(/\n+/)) {
    const texto = parte.trim();
    if (texto) lineas.push(centro(texto));
  }
  for (const parte of (c.membrete || "").split(/\n+/)) {
    const texto = parte.trim();
    if (texto) lineas.push(centro(texto));
  }
  lineas.push(centro(`Ticket Nº ${c.numero}`), centro(fecha));
  if (c.cliente) lineas.push(centro(c.cliente));
  lineas.push("-".repeat(COLUMNAS));
  for (const it of c.items) {
    const sub = it.subtotal ?? it.cantidad * it.precio;
    lineas.push(fila(`${it.cantidad} ${it.unidad} ${it.nombre}`, money(sub)));
  }
  lineas.push("-".repeat(COLUMNAS));
  lineas.push(fila("TOTAL", money(c.total)));
  lineas.push(fila(PAGO_LABEL[c.formaPago] ?? c.formaPago, c.recibido ? money(c.recibido) : ""));
  if (c.formaPago === "efectivo" && c.vuelto) lineas.push(fila("Vuelto", money(c.vuelto)));
  lineas.push("");
  for (const parte of c.pie.split(/\n+/)) {
    const texto = parte.trim();
    if (texto) lineas.push(centro(texto));
  }
  lineas.push(centro("No fiscal · Mostrador"));
  return lineas;
}

function escpos(lineas: string[]): Uint8Array {
  const bytes: number[] = [
    0x1b, 0x40, 0x1b, 0x74, 0x02, 0x1b, 0x4d, 0x00, 0x1b, 0x61, 0x00, 0x1b, 0x45, 0x00,
  ];
  lineas.forEach((linea, i) => {
    if (i === 0) bytes.push(0x1b, 0x45, 0x01);
    bytes.push(...aCp850(linea), 0x0a);
    if (i === 0) bytes.push(0x1b, 0x45, 0x00);
  });
  bytes.push(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00);
  return Uint8Array.from(bytes);
}

async function enTrozos(escribir: (data: Uint8Array) => Promise<void>, data: Uint8Array) {
  for (let i = 0; i < data.length; i += 180) {
    await escribir(data.slice(i, i + 180));
    await new Promise((r) => setTimeout(r, 40));
  }
}

const SERVICIOS_BT = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
];

async function tomarCaracteristica(device: BtDevice): Promise<BtChar> {
  const server = await device.gatt?.connect();
  if (!server) throw new Error("La impresora no respondió.");
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const chars = await service.getCharacteristics();
    const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  throw new Error("Esa térmica no acepta el ticket.");
}

function publicarBluetooth(device: BtDevice, ch: BtChar) {
  const nombre = device.name || "Térmica Bluetooth";
  device.addEventListener("gattserverdisconnected", () => {
    if (canal?.nombre === nombre) {
      canal = null;
      avisar();
    }
  });
  canal = {
    via: "bluetooth",
    nombre,
    escribir: async (data) => {
      const buf = aBuffer(data);
      if (ch.writeValueWithoutResponse && ch.properties.writeWithoutResponse) {
        await ch.writeValueWithoutResponse(buf);
      } else {
        await ch.writeValue(buf);
      }
    },
  };
  avisar();
}

async function conectarBluetooth(device: BtDevice) {
  const ch = await tomarCaracteristica(device);
  publicarBluetooth(device, ch);
  return canal?.nombre ?? "Térmica Bluetooth";
}

async function conectarUsb(device: UsbDevice) {
  await device.open();
  if (device.configuration == null) await device.selectConfiguration(1);
  const ifaces = device.configuration?.interfaces ?? [];
  let endpoint = 0;
  let tomada = false;
  for (const iface of ifaces) {
    const alt = iface.alternates[0];
    const out = alt?.endpoints.find((e) => e.direction === "out");
    if (!out) continue;
    try {
      await device.claimInterface(iface.interfaceNumber);
      endpoint = out.endpointNumber;
      tomada = true;
      break;
    } catch {
      /* otra interfaz */
    }
  }
  if (!tomada) throw new Error("No pude usar esa impresora USB.");
  const numero = endpoint;
  const nombre = device.productName || "Térmica USB";
  canal = {
    via: "usb",
    nombre,
    escribir: async (data) => {
      const res = await device.transferOut(numero, aBuffer(data));
      if (res.status !== "ok") throw new Error("La térmica no recibió el ticket.");
    },
  };
  avisar();
  return nombre;
}

export async function conectarTermica(preferida?: Via) {
  const lista = vias();
  const via = preferida && lista.includes(preferida) ? preferida : lista[0];
  if (!via) {
    throw new Error("Este navegador no conecta térmicas. Imprimí con papel de 80 mm.");
  }
  if (via === "bluetooth") {
    const bt = bluetooth();
    if (!bt) throw new Error("Bluetooth no está disponible.");
    let device: BtDevice;
    try {
      device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BT });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        throw new Error("No elegiste impresora.");
      }
      throw e;
    }
    return conectarBluetooth(device);
  }
  const usb = usbApi();
  if (!usb) throw new Error("USB no está disponible.");
  let device: UsbDevice;
  try {
    device = await usb.requestDevice({ filters: [{ classCode: 7 }, { classCode: 255 }] });
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      throw new Error("No elegiste impresora.");
    }
    throw e;
  }
  return conectarUsb(device);
}

export async function retomarTermica() {
  if (canal) return canal.nombre;
  const tactil = window.matchMedia("(pointer: coarse)").matches;
  const usb = usbApi();
  if (usb && !tactil) {
    const devices = await usb.getDevices();
    const previa = devices[0];
    if (previa) {
      try {
        return await conectarUsb(previa);
      } catch {
        /* sigue en el diálogo */
      }
    }
  }
  const bt = bluetooth();
  if (bt?.getDevices) {
    const devices = await bt.getDevices();
    const previa = devices[0];
    if (previa?.gatt) {
      try {
        return await conectarBluetooth(previa);
      } catch {
        /* sin térmica cerca */
      }
    }
  }
  return null;
}

export async function enviarTicket(c: TicketContenido) {
  if (!canal) throw new Error("No hay térmica conectada.");
  await enTrozos(canal.escribir, escpos(lineasTicket(c)));
}

/** Térmica si está conectada. Si no, false: hay que usar window.print(). */
export async function imprimirEnTermica(c: TicketContenido) {
  if (!canal) return false;
  await enviarTicket(c);
  return true;
}
