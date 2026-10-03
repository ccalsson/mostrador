import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/caja/cierre_controller.dart';
import 'package:puesto_flutter/models/caja.dart';
import 'package:puesto_flutter/services/caja_service.dart';

class _CajaFake implements CajaService {
  _CajaFake(this.estadoPara);

  final Future<CajaEstado> Function(int llamada) estadoPara;
  var llamadas = 0;

  var cierres = 0;
  Object? cierreError;
  final List<String> ids = [];
  final List<double> reales = [];
  final List<String?> notas = [];

  @override
  Future<CajaEstado> estado() {
    llamadas++;
    return estadoPara(llamadas);
  }

  @override
  Future<CierreCajaResultado> cerrarCaja({
    required String id,
    required double real,
    String? notas,
  }) async {
    cierres++;
    ids.add(id);
    reales.add(real);
    this.notas.add(notas);
    final fallo = cierreError;
    if (fallo != null) throw fallo;
    return const CierreCajaResultado(diferencia: -123.45, esperado: 5000);
  }
}

/// El `estado()` devuelve el mismo turno: suficiente para verificar que se
/// relee tras el cierre (cuenta `llamadas`), sin simular el turno nuevo.
void main() {
  late _CajaFake caja;
  late ProviderContainer container;

  setUp(() {
    caja = _CajaFake((_) async => CajaEstado(
          id: 'cje_1',
          abiertoAt: '',
          esperado: 5000,
          totales: const [],
          ultimos: const [],
        ));
    container = ProviderContainer(
      overrides: [cajaServiceProvider.overrideWithValue(caja)],
    );
  });

  tearDown(() => container.dispose());

  test('cobro exitoso: expone el resultado del backend y relee el estado',
      () async {
    final sub = container.listen(cajaEstadoProvider, (_, _) {});
    addTearDown(sub.close);
    await container.read(cajaEstadoProvider.future);
    expect(caja.llamadas, 1);

    final controller = container.read(cierreControllerProvider('cje_1').notifier);
    await controller.cerrar(real: 4876.55, notas: 'faltante');

    expect(controller.state.fase, CierreFase.exito);
    expect(controller.state.resultado?.diferencia, -123.45,
        reason: 'la diferencia sale del backend, no del cálculo local');
    expect(controller.state.resultado?.esperado, 5000);
    expect(controller.state.contado, 4876.55);
    expect(caja.ids.single, 'cje_1');
    expect(caja.notas.single, 'faltante');
    await container.read(cajaEstadoProvider.future);
    expect(caja.llamadas, 2, reason: 'el estado se relee para ver el turno nuevo');
  });

  test('error del backend: fase error, sin relectura y reintento posible',
      () async {
    caja.cierreError = ValidationException('No hay una caja abierta.');
    final sub = container.listen(cajaEstadoProvider, (_, _) {});
    addTearDown(sub.close);
    await container.read(cajaEstadoProvider.future);
    final controller = container.read(cierreControllerProvider('cje_1').notifier);

    await controller.cerrar(real: 5000);

    expect(controller.state.fase, CierreFase.error);
    expect(controller.state.errorMensaje, contains('No hay una caja abierta'));
    await Future<void>.delayed(Duration.zero);
    expect(caja.llamadas, 1,
        reason: 'un error de cierre no dispara relectura del estado');

    caja.cierreError = null;
    await controller.cerrar(real: 5000);
    expect(controller.state.fase, CierreFase.exito);
    expect(caja.cierres, 2);
  });

  test('error inesperado: mensaje genérico sin exponer detalles internos',
      () async {
    caja.cierreError = Exception('boom interno');
    final controller = container.read(cierreControllerProvider('cje_1').notifier);

    await controller.cerrar(real: 5000);

    expect(controller.state.fase, CierreFase.error);
    expect(controller.state.errorMensaje, 'No se pudo cerrar la caja.');
  });

  test('doble submit: llamadas concurrentes envían una sola petición',
      () async {
    final controller = container.read(cierreControllerProvider('cje_1').notifier);
    final primera = controller.cerrar(real: 5000);
    final segunda = controller.cerrar(real: 5000);
    await Future.wait([primera, segunda]);
    expect(caja.cierres, 1);
  });

  test('reintento tras éxito: no vuelve a llamar al backend', () async {
    final controller = container.read(cierreControllerProvider('cje_1').notifier);
    await controller.cerrar(real: 5000);
    await controller.cerrar(real: 5000);
    expect(caja.cierres, 1);
    expect(controller.state.fase, CierreFase.exito);
  });

  test('el estado de cierre es por caja', () async {
    await container
        .read(cierreControllerProvider('cje_1').notifier)
        .cerrar(real: 5000);
    final otro = container.read(cierreControllerProvider('cje_2'));
    expect(otro.fase, CierreFase.inactiva);
    expect(caja.cierres, 1);
  });
}
