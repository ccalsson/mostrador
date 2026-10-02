import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/ids.dart';
import '../../models/carrito.dart';
import '../../models/producto.dart';
import '../../services/pedidos_service.dart';

/// Carrito en memoria del vendedor.
///
/// El `clientUuid` se genera en el primer intento de confirmación y se
/// conserva en los reintentos (aunque el primer POST haya fallado o su
/// respuesta se haya perdido): el backend deduplica por ese valor. Sólo se
/// descarta cuando el pedido quedó confirmado.
class CarritoController extends Notifier<Carrito> {
  @override
  Carrito build() => const Carrito();

  void agregar(Producto producto, {int cantidad = 1}) {
    if (_enviando) return;
    final lineas = [...state.lineas];
    final indice = lineas.indexWhere((l) => l.productoId == producto.id);
    if (indice >= 0) {
      lineas[indice] = lineas[indice].conCantidad(lineas[indice].cantidad + cantidad);
    } else {
      lineas.add(CarritoLinea(
        productoId: producto.id,
        nombre: producto.nombre,
        unidadLabel: producto.unidadLabel,
        precio: producto.precio,
        cantidad: cantidad,
      ));
    }
    _conLineas(lineas);
  }

  void fijarCantidad(String productoId, int cantidad) {
    if (_enviando) return;
    if (cantidad <= 0) {
      quitar(productoId);
      return;
    }
    _conLineas([
      for (final linea in state.lineas)
        linea.productoId == productoId ? linea.conCantidad(cantidad) : linea,
    ]);
  }

  void quitar(String productoId) {
    if (_enviando) return;
    _conLineas([
      for (final linea in state.lineas)
        if (linea.productoId != productoId) linea,
    ]);
  }

  /// Vuelve a un carrito vacío (posterior a "Nuevo pedido").
  void reiniciar() {
    if (_enviando) return;
    state = const Carrito();
  }

  /// Confirma el pedido con el `clientUuid` del intento lógico en curso.
  /// Un reintento reenvía exactamente el mismo valor.
  Future<void> confirmar() async {
    if (_enviando || state.vacio) return;
    final clientUuid = state.clientUuid ?? generarUuidV4();
    final lineas = List<CarritoLinea>.unmodifiable(state.lineas);
    state = Carrito(
      lineas: lineas,
      clientUuid: clientUuid,
      envio: EnvioEstado.enviando,
    );
    try {
      final pedido = await ref.read(pedidosServiceProvider).crear(
            clientUuid: clientUuid,
            items: [
              for (final linea in lineas)
                (productoId: linea.productoId, cantidad: linea.cantidad),
            ],
          );
      if (!ref.mounted) return;
      state = Carrito(envio: EnvioEstado.creado, pedido: pedido);
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      state = Carrito(
        lineas: lineas,
        clientUuid: clientUuid,
        envio: EnvioEstado.error,
        errorMensaje: error.message,
      );
    } catch (_) {
      if (!ref.mounted) return;
      state = Carrito(
        lineas: lineas,
        clientUuid: clientUuid,
        envio: EnvioEstado.error,
        errorMensaje: 'No se pudo crear el pedido.',
      );
    }
  }

  bool get _enviando => state.envio == EnvioEstado.enviando;

  /// Aplica una edición: conserva el `clientUuid` del intento en curso y
  /// limpia el error anterior (el reintento vuelve por "Confirmar").
  void _conLineas(List<CarritoLinea> lineas) {
    state = Carrito(lineas: lineas, clientUuid: state.clientUuid);
  }
}

final carritoControllerProvider =
    NotifierProvider<CarritoController, Carrito>(CarritoController.new);
