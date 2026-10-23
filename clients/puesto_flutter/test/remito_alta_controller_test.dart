import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/admin/remito_alta_controller.dart';
import 'package:puesto_flutter/models/proveedor.dart';
import 'package:puesto_flutter/models/remito.dart';
import 'package:puesto_flutter/models/remito_ocr.dart';
import 'package:puesto_flutter/services/remitos_service.dart';

class MockRemitosService implements RemitosService {
  MockRemitosService({this.ocrResult, this.crearResult, this.exception});

  final RemitoOcrLectura? ocrResult;
  final String? crearResult;
  final Exception? exception;

  @override
  Future<List<Remito>> listar() async => [];

  @override
  Future<Remito> obtener(String id) async => throw UnimplementedError();

  @override
  Future<String> crear({
    required String proveedorId,
    required String fuente,
    String? archivoNombre,
    required List<RemitoLineaAlta> lineas,
  }) async {
    if (exception != null) throw exception!;
    return crearResult ?? 'id-remito';
  }

  @override
  Future<RemitoOcrLectura> ocr(RemitoImagen imagen) async {
    if (exception != null) throw exception!;
    return ocrResult ?? const RemitoOcrLectura(lineas: []);
  }

  @override
  Future<void> actualizarItem({
    required String id,
    required String? productoId,
    required double cantidad,
    required bool confirmado,
  }) async {}

  @override
  Future<void> asignarProveedor({
    required String remitoId,
    required String proveedorId,
  }) async {}

  @override
  Future<void> confirmar(String id) async {}

  @override
  Future<int> tomarCostosDeRemito(String remitoId) async => 0;
}

void main() {
  ProviderContainer crearContainer({RemitosService? remitosService}) {
    final container = ProviderContainer(
      overrides: [
        if (remitosService != null)
          remitosServiceProvider.overrideWithValue(remitosService),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('fase inicial es inactiva', () {
    final container = crearContainer();
    final controller = container.read(remitoAltaProvider.notifier);
    expect(controller.state.fase, RemitoAltaFase.inactiva);
    expect(controller.state.ocupado, isFalse);
  });

  test('proveedorDeLectura empareja por nombre ignorando mayúsculas', () {
    final container = crearContainer();
    final controller = container.read(remitoAltaProvider.notifier);
    final activos = <Proveedor>[
      const Proveedor(id: 'p1', nombre: 'Distribuidora Juan', activo: true),
      const Proveedor(id: 'p2', nombre: 'Frutas SA', activo: true),
    ];
    expect(
      controller.proveedorDeLectura(const RemitoOcrLectura(proveedor: ' Frutas sa ', lineas: []), activos),
      'p2',
    );
    expect(
      controller.proveedorDeLectura(const RemitoOcrLectura(proveedor: 'desconocido', lineas: []), activos),
      isNull,
    );
  });

  test('leerFoto cambia fases y guarda lectura', () async {
    final container = crearContainer(
      remitosService: MockRemitosService(ocrResult: const RemitoOcrLectura(proveedor: 'Test', lineas: [])),
    );
    final controller = container.read(remitoAltaProvider.notifier);
    
    final future = controller.leerFoto(RemitoImagen(bytes: [], mimeType: 'image/jpeg', nombre: 'test.jpg'));
    expect(container.read(remitoAltaProvider).fase, RemitoAltaFase.leyendo);
    
    await future;
    expect(container.read(remitoAltaProvider).fase, RemitoAltaFase.inactiva);
    expect(container.read(remitoAltaProvider).lectura?.proveedor, 'Test');
  });

  test('leerFoto maneja ApiException', () async {
    final container = crearContainer(
      remitosService: MockRemitosService(exception: const ApiException('OCR falló', statusCode: 503)),
    );
    final controller = container.read(remitoAltaProvider.notifier);
    
    await controller.leerFoto(RemitoImagen(bytes: [], mimeType: 'image/jpeg', nombre: 'test.jpg'));
    expect(container.read(remitoAltaProvider).fase, RemitoAltaFase.error);
    expect(container.read(remitoAltaProvider).errorMensaje, 'OCR falló');
  });

  test('cargar rechaza sin proveedor o sin líneas', () async {
    final container = crearContainer();
    final controller = container.read(remitoAltaProvider.notifier);
    
    await controller.cargar(proveedorId: '', fuente: 'manual', lineas: [const RemitoLineaAlta(descripcion: '1', cantidad: 10)]);
    expect(container.read(remitoAltaProvider).errorMensaje, 'Elegí un proveedor.');

    controller.reiniciar();
    await controller.cargar(proveedorId: 'p1', fuente: 'manual', lineas: []);
    expect(container.read(remitoAltaProvider).errorMensaje, 'El remito debe incluir al menos una línea.');
  });
}
