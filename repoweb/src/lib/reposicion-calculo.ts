export type VentaDia = { fecha: string; cantidad: number };

const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function nombreDia(dia: number) {
  return DIA[dia] ?? "";
}

function fechaUtc(iso: string) {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(anio, (mes ?? 1) - 1, dia ?? 1));
}

export function sumarDias(iso: string, cantidad: number) {
  const fecha = fechaUtc(iso);
  fecha.setUTCDate(fecha.getUTCDate() + cantidad);
  return fecha.toISOString().slice(0, 10);
}

export function diaSemana(iso: string) {
  return fechaUtc(iso).getUTCDay();
}

export function normalizarDias(dias: number[]) {
  return [...new Set(dias.filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6))].sort((a, b) => a - b);
}

export function diasACubrir(hoy: string, recepcion: number[]) {
  const dias = normalizarDias(recepcion);
  if (dias.length === 0) return [];
  const puestos = new Set(dias);
  let proxima = "";
  for (let i = 1; i <= 7; i += 1) {
    const candidata = sumarDias(hoy, i);
    if (puestos.has(diaSemana(candidata))) {
      proxima = candidata;
      break;
    }
  }
  if (!proxima) return [];
  const cubrir: number[] = [];
  let cursor = hoy;
  while (cursor < proxima) {
    cubrir.push(diaSemana(cursor));
    cursor = sumarDias(cursor, 1);
  }
  return cubrir;
}

function promedio(valores: number[]) {
  if (valores.length === 0) return 0;
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

export function cantidadAReponer(input: {
  hoy: string;
  recepcion: number[];
  stock: number;
  ventas: VentaDia[];
  semanas?: number;
}) {
  const cubrir = diasACubrir(input.hoy, input.recepcion);
  if (cubrir.length === 0) return null;
  const semanas = input.semanas ?? 8;
  const desde = sumarDias(input.hoy, -semanas * 7);
  const recientes = input.ventas.filter((venta) => venta.fecha >= desde && venta.fecha < input.hoy);
  const ritmo = promedio(
    recientes.filter((venta) => venta.fecha >= sumarDias(input.hoy, -14)).map((venta) => venta.cantidad),
  );
  let necesario = 0;
  for (const dia of cubrir) {
    const delDia = recientes.filter((venta) => diaSemana(venta.fecha) === dia).map((venta) => venta.cantidad);
    necesario += delDia.length > 0 ? promedio(delDia) : ritmo;
  }
  return Math.max(0, Math.ceil(necesario - input.stock));
}
