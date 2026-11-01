export const PRECIO_COMPRA_ARS = 5000;

export type OpcionCompra = {
  id: string;
  tenantId: string;
  puesto: string;
  nombre: string;
  alias: string[];
  precio: number;
  stock: number;
  unidad: string;
  unidadLabel: string;
};

export function textoPlano(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function puntaje(busqueda: string, nombre: string, alias: string[]) {
  const consulta = textoPlano(busqueda);
  if (consulta.length < 2) return 0;
  let mejor = 0;
  for (const candidato of [nombre, ...alias].map(textoPlano).filter(Boolean)) {
    if (candidato === consulta) mejor = Math.max(mejor, 100);
    else if (candidato.includes(consulta) || consulta.includes(candidato)) mejor = Math.max(mejor, 70);
    else {
      const palabras = consulta.split(" ").filter((parte) => parte.length > 2);
      const aciertos = palabras.filter((parte) => candidato.includes(parte)).length;
      if (palabras.length > 0) mejor = Math.max(mejor, Math.round((aciertos / palabras.length) * 60));
    }
  }
  return mejor;
}

export function leerLista(texto: string) {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
    .slice(0, 20)
    .flatMap((linea) => {
      const medida = linea.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
      const cantidad = medida ? Number(medida[1].replace(",", ".")) : 1;
      const nombre = medida ? medida[2] : linea;
      if (!(cantidad > 0) || nombre.trim().length < 2) return [];
      return [{ cantidad, texto: nombre.trim() }];
    });
}

export function elegirOpcion(opciones: OpcionCompra[], texto: string, cantidad: number) {
  const viables = opciones.filter((opcion) => opcion.stock >= cantidad && puntaje(texto, opcion.nombre, opcion.alias) >= 40);
  viables.sort((a, b) => puntaje(texto, b.nombre, b.alias) - puntaje(texto, a.nombre, a.alias) || a.precio - b.precio);
  return viables[0] ?? null;
}
