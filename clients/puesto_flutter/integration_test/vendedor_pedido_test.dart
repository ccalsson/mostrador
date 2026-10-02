import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/auth/token_store.dart';
import 'package:puesto_flutter/core/ids.dart';
import 'package:puesto_flutter/main.dart' as app;
import 'package:puesto_flutter/services/auth_service.dart';
import 'package:puesto_flutter/services/catalogo_service.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

/// Fase 3.1 — vendedor: pedido normal, idempotencia por `clientUuid` y detalle.
///
/// Requiere el backend corriendo contra Neon DEV. Android:
///   flutter test integration_test/vendedor_pedido_test.dart -d emulator-5554 \
///     --dart-define=API_BASE_URL=http://10.0.2.2:8080
const _email = String.fromEnvironment(
  'E2E_EMAIL',
  defaultValue: 'venta@frutasroman.com',
);
const _password = String.fromEnvironment('E2E_PASSWORD', defaultValue: 'roman2026');

/// Polling de frames: `pumpAndSettle` no sirve porque hay un spinner
/// (CircularProgressIndicator) que anima indefinidamente.
Future<void> _esperar(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('No apareció en pantalla: $finder');
}

/// Espera a que [finder] desaparezca. Necesario antes de tocar un widget que
/// el SnackBar de "agregado al carrito" (1 s, anclado abajo) puede tapar.
Future<void> _esperarSin(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 10),
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isEmpty) return;
  }
  fail('Siguió en pantalla: $finder');
}

/// Busca widgets cuya clave sea `ValueKey<String>` con el prefijo dado
/// (los ids de producto/pedido no se conocen de antemano).
Finder _porPrefijoClave(String prefijo) => find.byWidgetPredicate((widget) {
      final key = widget.key;
      return key is ValueKey<String> && key.value.startsWith(prefijo);
    });

/// Flujo UI completo: login vendedor → agregar del catálogo → carrito
/// (+1 unidad) → confirmación explícita → pantalla de pedido creado.
/// Devuelve el nombre del producto agregado.
Future<String> _vendedorCreaPedido(WidgetTester tester) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), _email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();

  await _esperar(tester, find.byKey(const Key('catalogo_lista')));
  await _esperar(tester, _porPrefijoClave('agregar_'));

  final agregar = _porPrefijoClave('agregar_').first;
  final tile = find.ancestor(of: agregar, matching: find.byType(ListTile)).first;
  final nombre = tester
      .widget<Text>(find.descendant(of: tile, matching: find.byType(Text)).first)
      .data!;
  await tester.tap(agregar);
  await tester.pump();

  await tester.tap(find.text('Carrito'));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('carrito_total')));

  await tester.tap(_porPrefijoClave('carrito_mas_').first);
  await tester.pump();

  await _esperarSin(tester, find.byType(SnackBar));
  await tester.tap(find.byKey(const Key('carrito_confirmar')));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('confirmar_aceptar')));
  await tester.tap(find.byKey(const Key('confirmar_aceptar')));
  await tester.pump();

  await _esperar(tester, find.byKey(const Key('pedido_creado_id')));
  return nombre;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('pedido normal: login → catálogo → carrito → pedido creado',
      (tester) async {
    app.main();
    await tester.pump();

    final nombre = await _vendedorCreaPedido(tester);

    final id = tester
        .widget<Text>(find.byKey(const Key('pedido_creado_id')))
        .data!;
    expect(id.startsWith('Nº ped_'), isTrue, reason: 'id visible: $id');
    expect(
      tester.widget<Text>(find.byKey(const Key('pedido_creado_estado'))).data,
      'Estado: Enviado',
    );
    final total = tester
        .widget<Text>(find.byKey(const Key('pedido_creado_total')))
        .data!;
    expect(total.startsWith('Total: \$'), isTrue);
    expect(nombre.isNotEmpty, isTrue);
  });

  testWidgets('idempotencia: reenviar el mismo clientUuid no duplica',
      (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final token = await container
        .read(authServiceProvider)
        .signIn(email: _email, password: _password);
    await container.read(tokenStoreProvider).write(token);

    final productos = await container.read(catalogoServiceProvider).listar();
    final producto = productos.productos.firstWhere((p) => p.activo);

    final servicio = container.read(pedidosServiceProvider);
    final clientUuid = generarUuidV4();
    final items = [(productoId: producto.id, cantidad: 1)];

    final primero = await servicio.crear(clientUuid: clientUuid, items: items);
    final segundo = await servicio.crear(clientUuid: clientUuid, items: items);

    expect(segundo.id, primero.id,
        reason: 'el reintento debe devolver el pedido ya creado');
    expect(primero.estado.name, 'enviado');

    final mios = await servicio.listar(mine: true);
    final repetidos = mios.where((p) => p.clientUuid == clientUuid);
    expect(repetidos.length, 1,
        reason: 'no deben aparecer dos pedidos con el mismo clientUuid');
  });

  testWidgets('detalle: muestra productos, cantidades, total y estado',
      (tester) async {
    app.main();
    await tester.pump();

    final nombre = await _vendedorCreaPedido(tester);

    await tester.tap(find.byKey(const Key('pedido_detalle_abrir')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('pedido_detalle_total')));

    expect(find.text(nombre), findsWidgets);
    expect(
      tester.widget<Text>(find.byKey(const Key('pedido_detalle_estado'))).data,
      'Enviado',
    );
    expect(_porPrefijoClave('pedido_item_'), findsWidgets);
    expect(find.textContaining('2 × '), findsWidgets,
        reason: 'la cantidad modificada en el carrito debe verse en el detalle');
  });
}
