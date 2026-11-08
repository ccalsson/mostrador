/**
 * Logica pura del catalogo unificado cross-tenant.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type ProductoUnificado = {
  id: string;
  tenantId: string;
  tenantNombre: string;
  nombre: string;
  unidad: string;
  precio: number;
  moneda: string;
  stock: number;
  stockMinimo: number;
  stockBajo: boolean;
  activo: boolean;
  publicadoOnline: boolean;
  canalMostrador: boolean;
  canalMercado: boolean;
  fotoId: string | null;
};

export type FiltroCatalogo = {
  tenantId?: string;
  publicadoOnline?: boolean;
  stockBajo?: boolean;
  busqueda?: string;
};

/**
 * Filtra y ordena productos del catalogo unificado.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function filtrarCatalogo(
  productos: ProductoUnificado[],
  filtro: FiltroCatalogo,
): ProductoUnificado[] {
  let resultado = productos;

  if (filtro.tenantId) {
    resultado = resultado.filter((p) => p.tenantId === filtro.tenantId);
  }

  if (filtro.publicadoOnline !== undefined) {
    resultado = resultado.filter((p) => p.publicadoOnline === filtro.publicadoOnline);
  }

  if (filtro.stockBajo) {
    resultado = resultado.filter((p) => p.stockBajo);
  }

  if (filtro.busqueda && filtro.busqueda.trim()) {
    const q = filtro.busqueda.trim().toLowerCase();
    resultado = resultado.filter((p) => p.nombre.toLowerCase().includes(q));
  }

  return resultado.sort((a, b) => {
    const porTenant = a.tenantNombre.localeCompare(b.tenantNombre);
    if (porTenant !== 0) return porTenant;
    return a.nombre.localeCompare(b.nombre);
  });
}
