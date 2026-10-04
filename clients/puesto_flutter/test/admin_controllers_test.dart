import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/admin/ajuste_stock_controller.dart';
import 'package:puesto_flutter/features/admin/producto_form_controller.dart';
import 'package:puesto_flutter/models/alerta.dart';
import 'package:puesto_flutter/models/producto.dart';
import 'package:puesto_flutter/services/alertas_service.dart';
import 'package:puesto_flutter/services/catalogo_service.dart';
import 'package:puesto_flutter/services/productos_service.dart';

class _ProductosFake implements ProductosAdminService {
  var guardados = 0;
  var bajas = 0;
  var ajustes = 0;
  final List<ProductoInput> inputs = [];
  final List<String> idsBaja = [];
  final List<({String productoId, double cantidad, String tipo, String motivo})>
      ajustesVistos = [];

  Object? errorGuardar;
  Object? errorBajar;
  Object? errorAjustar;

  @override
  Future<String> guardar(ProductoInput input) async {
    guardados++;
    inputs.add(input);
    final error = errorGuardar;
    if (error != null) throw error;
    return input.id ?? 'p_nuevo';
  }

  @override
  Future<void> bajar(String id) async {
    bajas++;
    idsBaja.add(id);
    final error = errorBajar;
    if (error != null) throw error;
  }

  @override
  Future<void> ajustarStock({
    required String productoId,
    required double cantidad,
    required String tipo,
    required String motivo,
  }) async {
    ajustes++;
    ajustesVistos.add((
      productoId: productoId,
      cantidad: cantidad,
      tipo: tipo,
      motivo: motivo,
    ));
    final error = errorAjustar;
    if (error != null) throw error;
  }
}

class _CatalogoFake implements CatalogoService {
  var lecturas = 0;

  @override
  Future<Catalogo> listar() async {
    lecturas++;
    return const Catalogo(productos: [], version: 'v');
  }
}

class _AlertasFake implements AlertasService {
  var lecturas = 0;

  @override
  Future<List<Alerta>> listar() async {
    lecturas++;
    return const [];
  }

  @override
  Future<void> marcarLeida(String id) async {}
}

const _input = ProductoInput(
  nombre: 'Banana',
  unidad: 'kg',
  unidadLabel: 'kg',
  precio: 1200,
  stockMinimo: 5,
  alias: [],
  activo: true,
);

void main() {
  late _ProductosFake productos;
  late _CatalogoFake catalogo;
  late _AlertasFake alertas;
  late ProviderContainer container;

  setUp(() {
    productos = _ProductosFake();
    catalogo = _CatalogoFake();
    alertas = _AlertasFake();
    container = ProviderContainer(
      overrides: [
        productosAdminServiceProvider.overrideWithValue(productos),
        catalogoServiceProvider.overrideWithValue(catalogo),
        alertasServiceProvider.overrideWithValue(alertas),
      ],
    );
  });

  tearDown(() => container.dispose());

  /// Mantiene los providers de lectura activos para poder contar relecturas
  /// tras cada `invalidate`, igual que hace la pantalla con `ref.watch`.
  void mantenerVivos() {
    addTearDown(container.listen(catalogoProvider, (_, _) {}).close);
    addTearDown(container.listen(alertasProvider, (_, _) {}).close);
  }

  Future<void> leerLecturas() async {
    await container.read(catalogoProvider.future);
    await container.read(alertasProvider.future);
  }

  group('ProductoFormController', () {
    test('guardar exitoso: devuelve true e invalida catálogo y alertas',
        () async {
      mantenerVivos();
      await leerLecturas();

      final ok =
          await container.read(productoFormProvider.notifier).guardar(_input);

      expect(ok, isTrue);
      expect(productos.guardados, 1);
      expect(productos.inputs.single, same(_input));
      expect(
          container.read(productoFormProvider).fase, ProductoFormFase.inactiva,
          reason: 'no queda fase de éxito colgada');
      await leerLecturas();
      expect(catalogo.lecturas, 2, reason: 'el catálogo se relee tras guardar');
      expect(alertas.lecturas, 2,
          reason: 'las alertas se releen (alta con stock bajo genera alerta)');
    });

    test('error del backend al guardar: mensaje expuesto, sin relecturas',
        () async {
      productos.errorGuardar = ValidationException('unidad inválida');
      mantenerVivos();
      await leerLecturas();

      final ok =
          await container.read(productoFormProvider.notifier).guardar(_input);

      expect(ok, isFalse);
      final estado = container.read(productoFormProvider);
      expect(estado.fase, ProductoFormFase.error);
      expect(estado.errorMensaje, 'unidad inválida');
      await leerLecturas();
      expect(catalogo.lecturas, 1, reason: 'un error no invalida lecturas');
      expect(alertas.lecturas, 1);
    });

    test('error inesperado al guardar: mensaje genérico', () async {
      productos.errorGuardar = Exception('boom interno');

      final ok =
          await container.read(productoFormProvider.notifier).guardar(_input);

      expect(ok, isFalse);
      final estado = container.read(productoFormProvider);
      expect(estado.fase, ProductoFormFase.error);
      expect(estado.errorMensaje, 'No se pudo guardar el producto.');
    });

    test('doble submit al guardar: una sola llamada', () async {
      final notifier = container.read(productoFormProvider.notifier);
      final primera = notifier.guardar(_input);
      final segunda = notifier.guardar(_input);

      expect(await segunda, isFalse);
      expect(await primera, isTrue);
      expect(productos.guardados, 1);
    });

    test('bajar exitoso: relee catálogo pero no alertas', () async {
      mantenerVivos();
      await leerLecturas();

      final ok =
          await container.read(productoFormProvider.notifier).bajar('p_1');

      expect(ok, isTrue);
      expect(productos.idsBaja, ['p_1']);
      await leerLecturas();
      expect(catalogo.lecturas, 2);
      expect(alertas.lecturas, 1, reason: 'la baja no toca alertas');
    });

    test('bajar con error del backend: mensaje expuesto, sin relecturas',
        () async {
      productos.errorBajar =
          ForbiddenException('No tenés permiso para esta acción.');
      mantenerVivos();
      await leerLecturas();

      final ok =
          await container.read(productoFormProvider.notifier).bajar('p_1');

      expect(ok, isFalse);
      final estado = container.read(productoFormProvider);
      expect(estado.fase, ProductoFormFase.error);
      expect(estado.errorMensaje, contains('No tenés permiso'));
      await leerLecturas();
      expect(catalogo.lecturas, 1);
    });

    test('reiniciar limpia el error de una apertura previa', () async {
      productos.errorGuardar = ValidationException('unidad inválida');
      final notifier = container.read(productoFormProvider.notifier);
      await notifier.guardar(_input);
      expect(container.read(productoFormProvider).fase, ProductoFormFase.error);

      notifier.reiniciar();

      final estado = container.read(productoFormProvider);
      expect(estado.fase, ProductoFormFase.inactiva);
      expect(estado.errorMensaje, isNull);
    });
  });

  group('AjusteStockController', () {
    Future<bool> ajustar(AjusteModo modo, double cantidad) => container
        .read(ajusteStockProvider.notifier)
        .ajustar(
            productoId: 'p_1', modo: modo, cantidad: cantidad, motivo: 'motivo');

    test('sumar: ajuste positivo con tipo ajuste', () async {
      expect(await ajustar(AjusteModo.sumar, 3.5), isTrue);

      final visto = productos.ajustesVistos.single;
      expect(visto.productoId, 'p_1');
      expect(visto.cantidad, 3.5);
      expect(visto.tipo, 'ajuste');
      expect(visto.motivo, 'motivo');
    });

    test('restar: ajuste negativo con tipo ajuste', () async {
      expect(await ajustar(AjusteModo.restar, 12.5), isTrue);

      final visto = productos.ajustesVistos.single;
      expect(visto.cantidad, -12.5);
      expect(visto.tipo, 'ajuste');
    });

    test('merma: cantidad positiva con tipo merma', () async {
      expect(await ajustar(AjusteModo.merma, 2), isTrue);

      final visto = productos.ajustesVistos.single;
      expect(visto.cantidad, 2, reason: 'el signo lo aplica el backend en abs');
      expect(visto.tipo, 'merma');
    });

    test('cantidad <= 0: rechazado sin llamar al servicio', () async {
      expect(await ajustar(AjusteModo.sumar, 0), isFalse);
      expect(productos.ajustes, 0);
    });

    test('ajuste exitoso invalida catálogo y alertas', () async {
      mantenerVivos();
      await leerLecturas();

      await ajustar(AjusteModo.sumar, 1);

      await leerLecturas();
      expect(catalogo.lecturas, 2);
      expect(alertas.lecturas, 2,
          reason: 'el ajuste puede cruzar el stock mínimo');
    });

    test('error del backend en ajuste: mensaje expuesto, sin relecturas',
        () async {
      productos.errorAjustar = ValidationException('motivo requerido');
      mantenerVivos();
      await leerLecturas();

      expect(await ajustar(AjusteModo.sumar, 1), isFalse);

      final estado = container.read(ajusteStockProvider);
      expect(estado.fase, AjusteFase.error);
      expect(estado.errorMensaje, 'motivo requerido');
      await leerLecturas();
      expect(catalogo.lecturas, 1);
      expect(alertas.lecturas, 1);
    });

    test('error inesperado en ajuste: mensaje genérico', () async {
      productos.errorAjustar = Exception('boom interno');

      expect(await ajustar(AjusteModo.sumar, 1), isFalse);

      final estado = container.read(ajusteStockProvider);
      expect(estado.fase, AjusteFase.error);
      expect(estado.errorMensaje, 'No se pudo registrar el ajuste.');
    });

    test('doble submit de ajuste: una sola llamada', () async {
      final notifier = container.read(ajusteStockProvider.notifier);
      final primera = notifier.ajustar(
          productoId: 'p_1',
          modo: AjusteModo.sumar,
          cantidad: 1,
          motivo: 'motivo');
      final segunda = notifier.ajustar(
          productoId: 'p_1',
          modo: AjusteModo.sumar,
          cantidad: 1,
          motivo: 'motivo');

      expect(await segunda, isFalse);
      expect(await primera, isTrue);
      expect(productos.ajustes, 1);
    });

    test('reiniciar limpia el error del ajuste', () async {
      productos.errorAjustar = ValidationException('motivo requerido');
      final notifier = container.read(ajusteStockProvider.notifier);
      await ajustar(AjusteModo.sumar, 1);
      expect(container.read(ajusteStockProvider).fase, AjusteFase.error);

      notifier.reiniciar();

      final estado = container.read(ajusteStockProvider);
      expect(estado.fase, AjusteFase.inactiva);
      expect(estado.errorMensaje, isNull);
    });
  });
}
