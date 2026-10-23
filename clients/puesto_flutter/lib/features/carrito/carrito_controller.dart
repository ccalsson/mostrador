import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/ids.dart';
import '../../models/carrito.dart';
import '../../models/pedido_pendiente.dart';
import '../../models/producto.dart';
import '../../services/conectividad_service.dart';
import '../../services/offline_queue_service.dart';
import '../../services/pedidos_service.dart';

/// Carrito en memoria del vendedor con cola offline.
///
/// El `clientUuid` se genera en el primer intento de confirmación y se
/// conserva en los reintentos (aunque el primer POST haya fallado o su
/// respuesta se haya perdido): el backend deduplica por ese valor. Sólo se
/// descarta cuando el pedido quedó confirmado.
///
/// Si no hay conexión al confirmar, el pedido se guarda en la cola offline
/// (persistencia local) y se reintenta automáticamente al recuperar conexión.
/// Máximo 3 reintentos antes de notificar fallo al usuario.
class CarritoController extends Notifier<Carrito> {
  @override
  Carrito build() {
    // Escuchar cambios de conectividad para replay automático.
    final conectividad = ref.read(conectividadServiceProvider);
    conectividad.addListener(_onConectividadCambio);
    ref.onDispose(() => conectividad.removeListener(_onConectividadCambio));
    return const Carrito();
  }

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
  ///
  /// Si no hay conexión, guarda el pedido en la cola offline y cambia el
  /// estado a [EnvioEstado.guardadoOffline].
  Future<void> confirmar() async {
    if (_enviando || state.vacio) return;
    final clientUuid = state.clientUuid ?? generarUuidV4();
    final lineas = List<CarritoLinea>.unmodifiable(state.lineas);

    // Marcar como enviando ANTES del await para evitar race conditions
    // con llamadas paralelas.
    state = Carrito(
      lineas: lineas,
      clientUuid: clientUuid,
      envio: EnvioEstado.enviando,
    );

    // Verificar conectividad antes de intentar enviar.
    final hayConexion = await ref.read(conectividadServiceProvider).hayConexion();
    if (!hayConexion) {
      await _guardarOffline(clientUuid, lineas);
      return;
    }

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
      // Si es error de red, guardar offline en lugar de mostrar error.
      if (error is NetworkException) {
        await _guardarOffline(clientUuid, lineas);
        return;
      }
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

  /// Guarda el pedido en la cola offline y actualiza el estado.
  Future<void> _guardarOffline(
    String clientUuid,
    List<CarritoLinea> lineas,
  ) async {
    final pendiente = PedidoPendiente(
      clientUuid: clientUuid,
      items: [
        for (final linea in lineas)
          PedidoPendienteItem(
            productoId: linea.productoId,
            cantidad: linea.cantidad,
          ),
      ],
      timestamp: DateTime.now(),
      clienteNombre: 'Mostrador',
    );
    await ref.read(offlineQueueServiceProvider).agregar(pendiente);
    if (!ref.mounted) return;
    state = Carrito(
      lineas: lineas,
      clientUuid: clientUuid,
      envio: EnvioEstado.guardadoOffline,
    );
  }

  /// Reintenta enviar todos los pedidos pendientes de la cola offline.
  /// Incrementa el contador de reintentos y elimina los exitosos.
  /// Notifica los resultados vía callback.
  Future<List<ReplayResultado>> replayPendientes() async {
    final queueService = ref.read(offlineQueueServiceProvider);
    final pedidosService = ref.read(pedidosServiceProvider);
    final pendientes = queueService.leer();
    final resultados = <ReplayResultado>[];

    for (final pendiente in pendientes) {
      if (pendiente.agotado) {
        // Ya agotó reintentos: eliminar y notificar fallo.
        await queueService.eliminar(pendiente.clientUuid);
        resultados.add(ReplayResultado(
          clientUuid: pendiente.clientUuid,
          exito: false,
          agotado: true,
        ));
        continue;
      }

      try {
        await pedidosService.crear(
          clientUuid: pendiente.clientUuid,
          items: [
            for (final item in pendiente.items)
              (productoId: item.productoId, cantidad: item.cantidad),
          ],
          clienteNombre: pendiente.clienteNombre,
          nota: pendiente.nota,
        );
        // Éxito: eliminar de la cola.
        await queueService.eliminar(pendiente.clientUuid);
        resultados.add(ReplayResultado(
          clientUuid: pendiente.clientUuid,
          exito: true,
        ));
      } catch (_) {
        // Fallo: incrementar reintentos.
        final actualizado = pendiente.conRetryIncrementado();
        if (actualizado.agotado) {
          await queueService.eliminar(pendiente.clientUuid);
          resultados.add(ReplayResultado(
            clientUuid: pendiente.clientUuid,
            exito: false,
            agotado: true,
          ));
        } else {
          await queueService.actualizar(actualizado);
          resultados.add(ReplayResultado(
            clientUuid: pendiente.clientUuid,
            exito: false,
          ));
        }
      }
    }

    return resultados;
  }

  /// Devuelve la cantidad de pedidos pendientes en la cola offline.
  int get pendientesOffline =>
      ref.read(offlineQueueServiceProvider).leer().length;

  /// Callback invocado cuando cambia la conectividad.
  Future<void> _onConectividadCambio(bool conectado) async {
    if (conectado) {
      // Actualizar el provider de estado de conexión.
      ref.read(conectadoProvider.notifier).setConectado(true);
      // Replay automático de pedidos pendientes.
      await replayPendientes();
    } else {
      ref.read(conectadoProvider.notifier).setConectado(false);
    }
  }

  bool get _enviando => state.envio == EnvioEstado.enviando;

  /// Aplica una edición: conserva el `clientUuid` del intento en curso y
  /// limpia el error anterior (el reintento vuelve por "Confirmar").
  void _conLineas(List<CarritoLinea> lineas) {
    state = Carrito(lineas: lineas, clientUuid: state.clientUuid);
  }
}

/// Resultado de replay de un pedido pendiente.
class ReplayResultado {
  const ReplayResultado({
    required this.clientUuid,
    required this.exito,
    this.agotado = false,
  });

  final String clientUuid;
  final bool exito;
  final bool agotado;
}

final carritoControllerProvider =
    NotifierProvider<CarritoController, Carrito>(CarritoController.new);

/// Provider reactivo que indica si hay conexión a internet.
/// Se actualiza automáticamente cuando cambia la conectividad.
class ConectadoController extends Notifier<bool> {
  @override
  bool build() => true;

  void setConectado(bool value) => state = value;
}

final conectadoProvider =
    NotifierProvider<ConectadoController, bool>(ConectadoController.new);