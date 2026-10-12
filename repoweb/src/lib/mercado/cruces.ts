export const SENTIDOS = ["comprador_cargador", "cargador_comprador", "comprador_puesto", "puesto_comprador"] as const;
export type Sentido = (typeof SENTIDOS)[number];

export function estrellasValidas(valor: number) {
  return Number.isInteger(valor) && valor >= 1 && valor <= 5;
}

/** Una entrega cerrada se califica una sola vez en cada sentido. */
export function puedeCruzar(estado: string, ya: boolean) {
  return estado === "entregado" && !ya;
}

export function perfilCargador(input: { nombre: string; telefono: string; foto?: string | null }) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Falta el nombre.");
  if (nombre.length > 80) throw new Error("El nombre es demasiado largo.");
  const telefono = input.telefono.trim();
  if (telefono.length > 40) throw new Error("El teléfono es demasiado largo.");
  const foto = input.foto?.trim() || null;
  if (foto && foto.length > 900_000) throw new Error("La foto es muy pesada. Bajala de 700 KB.");
  return { nombre, telefono, foto };
}
