/**
 * Logica pura de grupos empresariales.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type GrupoEmpresarial = {
  id: string;
  nombre: string;
  descripcion: string;
  creadoPor: string;
  clientesCount: number;
  tenantsCount: number;
  revenueTotal: number;
  createdAt: string;
};

export type GrupoDetalle = {
  grupo: GrupoEmpresarial;
  clientes: {
    id: string;
    nombre: string;
    businessName: string;
    status: string;
    tenantsCount: number;
    revenue: number;
  }[];
};

export type ClienteParaGrupo = {
  id: string;
  nombre: string;
  businessName: string;
  grupoId: string | null;
  grupoNombre: string | null;
};

/**
 * Valida la asignacion de un cliente a un grupo.
 * Devuelve un mensaje de error o null si es valida.
 */
export function validarAsignacion(clienteId: string, grupoId: string): string | null {
  if (!clienteId || !clienteId.trim()) return "El ID del cliente es obligatorio.";
  if (!grupoId || !grupoId.trim()) return "El ID del grupo es obligatorio.";
  return null;
}

/**
 * Valida los datos de un grupo empresarial antes de guardarlo.
 * Devuelve un mensaje de error o null si es valido.
 */
export function validarGrupo(g: { nombre: string }): string | null {
  if (!g.nombre.trim()) return "El nombre del grupo es obligatorio.";
  return null;
}

/**
 * Calcula metricas consolidadas para un grupo a partir de sus clientes.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function calcularConsolidado(
  clientes: { revenue: number; tenantsCount: number }[],
): { revenueTotal: number; tenantsTotal: number; clientesCount: number } {
  return {
    revenueTotal: clientes.reduce((acc, c) => acc + c.revenue, 0),
    tenantsTotal: clientes.reduce((acc, c) => acc + c.tenantsCount, 0),
    clientesCount: clientes.length,
  };
}
