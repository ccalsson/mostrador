import 'pedido.dart';

/// Estado del envío del pedido en curso.
enum EnvioEstado { inactivo, enviando, error, creado, guardadoOffline }

/// Línea del carrito en memoria. El precio queda congelado al agregar.
class CarritoLinea {
  const CarritoLinea({
    required this.productoId,
    required this.nombre,
    required this.unidadLabel,
    required this.precio,
    required this.cantidad,
  });

  final String productoId;
  final String nombre;
  final String unidadLabel;
  final double precio;
  final int cantidad;

  double get subtotal => precio * cantidad;

  CarritoLinea conCantidad(int nueva) => CarritoLinea(
        productoId: productoId,
        nombre: nombre,
        unidadLabel: unidadLabel,
        precio: precio,
        cantidad: nueva,
      );
}

/// Carrito en memoria del vendedor con soporte de cola offline.
///
/// [clientUuid] identifica el intento lógico de creación: se genera en el
/// primer `confirmar`, sobrevive a los reintentos y recién se descarta
/// cuando el pedido quedó creado. Si no hay conexión, el pedido se guarda
/// localmente (estado [EnvioEstado.guardadoOffline]).
///
/// [clienteId] y [clienteNombre] identifican al cliente seleccionado para el
/// pedido en curso. Por defecto es nulo (Mostrador), igual que la web.
class Carrito {
  const Carrito({
    this.lineas = const [],
    this.clientUuid,
    this.envio = EnvioEstado.inactivo,
    this.errorMensaje,
    this.pedido,
    this.clienteId,
    this.clienteNombre = 'Mostrador',
  });

  final List<CarritoLinea> lineas;
  final String? clientUuid;
  final EnvioEstado envio;
  final String? errorMensaje;
  final Pedido? pedido;
  final String? clienteId;
  final String clienteNombre;

  bool get vacio => lineas.isEmpty;

  double get total => lineas.fold(0, (acc, linea) => acc + linea.subtotal);

  int get unidades => lineas.fold(0, (acc, linea) => acc + linea.cantidad);

  Carrito conCliente({String? clienteId, String clienteNombre = 'Mostrador'}) =>
      Carrito(
        lineas: lineas,
        clientUuid: clientUuid,
        envio: envio,
        errorMensaje: errorMensaje,
        pedido: pedido,
        clienteId: clienteId,
        clienteNombre: clienteNombre,
      );
}
