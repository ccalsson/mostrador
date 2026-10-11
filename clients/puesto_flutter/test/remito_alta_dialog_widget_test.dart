import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/features/admin/remito_alta_controller.dart';
import 'package:puesto_flutter/features/admin/remito_alta_dialog.dart';
import 'package:puesto_flutter/models/proveedor.dart';
import 'package:puesto_flutter/services/proveedores_service.dart';
import 'package:puesto_flutter/models/remito_ocr.dart';

class _FakeController extends RemitoAltaController {
  @override
  RemitoAltaEstado build() => const RemitoAltaEstado();

  @override
  Future<RemitoOcrLectura?> leerFoto(RemitoImagen imagen) async {
    state = const RemitoAltaEstado(lectura: RemitoOcrLectura(proveedor: 'p1', lineas: []));
    return state.lectura;
  }

  @override
  Future<String?> cargar({
    required String proveedorId,
    required String fuente,
    String? archivoNombre,
    required List<RemitoLineaAlta> lineas,
  }) async {
    return '123';
  }
}

void main() {
  Widget wrapper({required Widget child}) {
    return ProviderScope(
      overrides: [
        proveedoresProvider.overrideWith(
          (_) => [
            const Proveedor(id: 'p1', nombre: 'Prov 1', activo: true),
          ],
        ),
        remitoAltaProvider.overrideWith(_FakeController.new),
      ],
      child: MaterialApp(home: Scaffold(body: child)),
    );
  }

  testWidgets('muestra diálogo y campos vacíos', (tester) async {
    await tester.pumpWidget(wrapper(child: Builder(
      builder: (context) {
        return ElevatedButton(
          onPressed: () => mostrarAltaRemito(context),
          child: const Text('Abrir'),
        );
      },
    )));
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();

    expect(find.text('Ingreso de mercadería'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
  });
}
