export type Rol = "admin" | "cajero" | "vendedor";
export type Unidad = "bulto" | "kg";
export type PedidoEstado =
  | "borrador"
  | "enviado"
  | "en_preparacion"
  | "listo"
  | "cobrado"
  | "anulado"
  | "entregado";
export type FormaPago = "efectivo" | "transferencia" | "tarjeta" | "cuenta_corriente";
export type MovimientoTipo =
  | "entrada_remito"
  | "venta"
  | "anulacion_venta"
  | "ajuste"
  | "merma"
  | "reserva"
  | "liberacion";

export type Staff = {
  id: string;
  tenantId: string;
  userId: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
};

export type Tenant = {
  id: string;
  nombre: string;
  pieTicket: string;
};

export type Marca = {
  id: string;
  nombre: string;
  bajada: string;
  membrete: string;
  pieTicket: string;
  fondo: string | null;
};

export type Producto = {
  id: string;
  nombre: string;
  unidad: Unidad;
  unidadLabel: string;
  precio: number;
  stock: number;
  stockMinimo: number;
  alias: string[];
  activo: boolean;
  publicadoOnline?: boolean;
  stockBajo: boolean;
  orden: number | null;
};

export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  cuentaCorriente: boolean;
  email?: string | null;
  cuit?: string | null;
  direccion?: string | null;
  condicionIva?: string | null;
  activo?: boolean;
  userId?: string | null;
  saldo?: number;
};

export type PedidoItem = {
  id: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  unidad: Unidad;
  unidadLabel: string;
  subtotal: number;
};

export type Pedido = {
  id: string;
  clientUuid: string;
  vendedorId: string | null;
  vendedorNombre: string | null;
  clienteId: string | null;
  clienteNombre: string;
  estado: PedidoEstado;
  nota: string | null;
  items: PedidoItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
  formaPago?: FormaPago | null;
  comprobanteNombre?: string | null;
  pickedUpAt?: string | null;
  cargadorNombre?: string | null;
};

export type Alerta = {
  id: string;
  tipo: string;
  mensaje: string;
  leida: boolean;
  createdAt: string;
};

export const ROL_LABEL: Record<Rol, string> = {
  admin: "Dueño",
  cajero: "Cajero",
  vendedor: "Vendedor",
};

export const ESTADO_LABEL: Record<PedidoEstado, string> = {
  borrador: "Borrador",
  enviado: "En caja",
  en_preparacion: "Preparando",
  listo: "Listo",
  cobrado: "Cobrado",
  anulado: "Anulado",
  entregado: "Entregado",
};

export const PAGO_LABEL: Record<FormaPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cuenta_corriente: "Cuenta corriente",
};
