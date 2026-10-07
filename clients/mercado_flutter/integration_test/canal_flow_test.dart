import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:mercado_al_toque/main.dart' as app;

/// Fase 4 — ciclo completo del canal Mercado al Toque contra el backend real
/// + Neon DEV: COMPRAR (UI comprador) -> PREPARAR (staff Mostrador por API)
/// -> CARGAR (UI comprador arma recorrido; UI cargador acepta) -> RETIRAR ->
/// ENTREGAR (UI cargador) -> CALIFICAR (UI comprador).
///
/// Sin mocks: los pasos que ocurren fuera del canal (preparación del puesto)
/// se hacen por HTTP crudo igual que el script tmp-mercado-e2e.mjs; todo lo
/// del canal se maneja desde la UI real de la app.
///
/// Requiere el backend corriendo en 8080 contra Neon DEV:
///   flutter test integration_test/canal_flow_test.dart -d emulator-5554
const _base = String.fromEnvironment('E2E_BASE', defaultValue: 'http://192.168.0.101:8080');
const _emailComprador = 'mercado-e2e-comprador@frutasroman.com';
const _emailCargador = 'mercado-e2e-cargador@frutasroman.com';
const _passwordMercado = 'mercado2026';
const _staff = {'email': 'caja@frutasroman.com', 'password': 'roman2026'};

final _http = http.Client();

Future<Map<String, dynamic>> _mercado(
  String path, {
  String method = 'GET',
  String? token,
  Object? body,
  String? key,
}) async {
  final res = await _http.send(http.Request(method, Uri.parse('$_base/api/mercado/v1$path'))
    ..headers.addAll({
      'accept': 'application/json',
      'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
      'idempotency-key': ?key,
    })
    ..body = body == null ? '' : jsonEncode(body));
  final text = await res.stream.bytesToString();
  final json = text.isEmpty ? <String, dynamic>{} : jsonDecode(text) as Map<String, dynamic>;
  return {'status': res.statusCode, 'json': json};
}

Future<String> _entrarOCrear(Map<String, dynamic> registro, String perfil) async {
  var r = await _mercado(
    perfil == 'comprador' ? '/auth/registro' : '/auth/registro-cargador',
    method: 'POST',
    body: registro,
  );
  if (r['status'] == 409) {
    r = await _mercado('/auth/ingreso', method: 'POST', body: {
      'email': registro['email'],
      'password': registro['password'],
      'perfil': perfil,
    });
  }
  expect(r['status'], anyOf(200, 201), reason: 'registro/ingreso $perfil: $r');
  return (r['json']['token'] as String);
}

Future<String> _staffSignIn() async {
  final res = await _http.post(
    Uri.parse('$_base/api/auth/sign-in/email'),
    headers: {'content-type': 'application/json', 'origin': _base},
    body: jsonEncode(_staff),
  );
  expect(res.statusCode, 200, reason: 'staff sign-in: ${res.body}');
  final json = jsonDecode(res.body) as Map<String, dynamic>;
  return (json['token'] ?? (json['data'] as Map<String, dynamic>)['token']) as String;
}

Future<void> _prepararPedido(String staffToken, String pedidoId, String estado) async {
  final res = await _http.post(
    Uri.parse('$_base/api/v1/pedidos/$pedidoId/estado'),
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer $staffToken',
    },
    body: jsonEncode({'estado': estado}),
  );
  expect(res.statusCode, 200, reason: 'estado $estado de $pedidoId: ${res.body}');
}

/// Polling de frames: `pumpAndSettle` no sirve con spinners que animan siempre.
///
/// Los finders con `.first` lanzan StateError si el subtree todavía no existe
/// (una recarga reemplaza las cards por un spinner un momento): eso cuenta
/// como "todavía no está", no debe matar el test.
bool _visible(Finder finder) {
  try {
    return finder.evaluate().isNotEmpty;
  } on StateError {
    return false;
  }
}

Future<void> _esperar(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (_visible(finder)) return;
  }
  final textos = find
      .byType(Text)
      .evaluate()
      .map((e) => ((e.widget as Text).data ?? '(rich)'))
      .toSet()
      .join(' | ');
  fail('No apareció en pantalla: $finder. Textos visibles: $textos');
}

Future<void> _esperarAusencia(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (!_visible(finder)) return;
  }
  fail('Siguió en pantalla: $finder');
}

/// Scroll manual con arrastres: `scrollUntilVisible` no sirve acá porque su
/// finder interno exige coincidencia única (raw con 2 coincidencias lanza
/// "Too many elements"; `.first` con cero lanza "No element" mientras el item
/// no se construyó). `_visible` tolera ambas situaciones.
Future<void> _scrollHasta(
  WidgetTester tester,
  Finder finder, {
  int maxScrolls = 50,
}) async {
  final lista = find.byType(ListView).first;
  for (var i = 0; i < maxScrolls; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (_visible(finder)) return;
    if (!_visible(lista)) continue;
    await tester.drag(lista, const Offset(0, -200));
    await tester.pump();
  }
  fail('No apareció al scrollear: $finder');
}

/// Recarga de la lista de pedidos al volver del detalle: el refresco recién
/// terminó cuando ya hay casillas para armar el recorrido. La preparación de
/// ESTA corrida ya quedó asertada por polling en el detalle ('Preparado');
/// corridas fallidas pueden dejar pedidos Confirmado atascados, así que la
/// ausencia de esa baldosa no es una condición alcanzable.
/// Si la recarga falla por latencia de Neon, toca Reintentar.
Future<void> _esperarListaRecargada(
  WidgetTester tester, {
  Duration timeout = const Duration(seconds: 60),
}) async {
  final fin = DateTime.now().add(timeout);
  final casillas = find.byType(CheckboxListTile);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (casillas.evaluate().isNotEmpty) {
      return;
    }
    final reintentar = find.text('Reintentar');
    if (reintentar.evaluate().isNotEmpty) {
      await tester.tap(reintentar.first);
      await tester.pump();
    }
  }
  fail('La lista nunca recargó con el pedido de esta corrida preparado');
}

Future<void> _ingresar(WidgetTester tester, String email, {bool cargador = false}) async {
  await _esperar(tester, find.text('Ingresar'));
  if (cargador) {
    await tester.tap(find.text('Cargador'));
    await tester.pump();
  }
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Correo electrónico'),
    email,
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Contraseña'),
    _passwordMercado,
  );
  await tester.tap(find.text('Ingresar'));
  await tester.pump();
}

Future<void> _salir(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Cerrar sesión'));
  await tester.pump();
  await _esperar(tester, find.text('Ingresar'));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets(
    'ciclo completo: comprar, preparar, cargar, retirar, entregar y calificar',
    (tester) async {
      // ---------- FIXTURES (HTTP crudo, idempotente) ----------
      final tokenComprador = await _entrarOCrear({
        'nombre': 'Comprador E2E',
        'email': _emailComprador,
        'password': _passwordMercado,
        'telefono': '3510000000',
        'pais': 'AR',
        'tipoDocumento': 'DNI',
        'numeroDocumento': '30111222',
      }, 'comprador');
      final dummy = base64Encode(utf8.encode('e2e-flutter-${DateTime.now()}'));
      final identidad = await _mercado('/identidad', method: 'POST', token: tokenComprador, body: {
        'pais': 'AR',
        'tipoDocumento': 'DNI',
        'numeroDocumento': '30111222',
        'documentoBase64': dummy,
        'selfieBase64': dummy,
      });
      expect(identidad['status'], 200, reason: '$identidad');

      final tokenCargador = await _entrarOCrear({
        'nombre': 'Cargador E2E',
        'email': _emailCargador,
        'password': _passwordMercado,
        'telefono': '3510000001',
      }, 'cargador');
      final disp = await _mercado('/cargador/disponibilidad', method: 'POST', token: tokenCargador, body: {
        'disponibilidad': 'disponible',
      });
      expect(disp['status'], 200, reason: '$disp');

      final puestos = await _mercado('/puestos', token: tokenComprador);
      expect(puestos['status'], 200, reason: '$puestos');
      final puesto = (puestos['json']['puestos'] as List).cast<Map<String, dynamic>>().first;
      final catalogo = await _mercado('/puestos/${puesto['id']}/productos', token: tokenComprador);
      final productos = (catalogo['json']['productos'] as List).cast<Map<String, dynamic>>();
      final producto = productos.firstWhere((p) => (p['disponible'] as num) >= 1,
          orElse: () => throw StateError('sin productos con stock para el e2e'));
      final staffToken = await _staffSignIn();

      // ---------- UI: COMPRADOR COMPRA ----------
      app.main();
      await tester.pump();
      await _ingresar(tester, _emailComprador);
      await _esperar(tester, find.text(puesto['nombre'] as String));

      await tester.tap(find.text(puesto['nombre'] as String));
      // El catálogo es una lista perezosa: esperar el primer ítem y luego
      // scrollear hasta el producto elegido.
      await _esperar(tester, find.text(productos.first['nombre'] as String));
      await tester.scrollUntilVisible(
        find.text(producto['nombre'] as String),
        200,
      );
      await tester.tap(find.descendant(
        of: find.ancestor(
          of: find.text(producto['nombre'] as String),
          matching: find.byType(ListTile),
        ),
        matching: find.byTooltip('Agregar al carrito'),
      ));
      await _esperar(tester, find.textContaining('agregado al carrito'));
      // El SnackBar flota sobre el botón de confirmar: esperar que se vaya
      // antes de tocar nada en la parte baja de la pantalla.
      await _esperarAusencia(tester, find.textContaining('agregado al carrito'));

      await tester.tap(find.text('Carrito'));
      await tester.pump();
      await _esperar(tester, find.text('Confirmar pedidos'));
      await tester.tap(find.text('Confirmar pedidos'));
      await _esperar(tester, find.text('Elegí cómo vas a pagar al puesto'));
      await tester.tap(find.text('Efectivo'));
      // Los pedidos Preparado atascados de corridas fallidas empujan el
      // encabezado bajo el viewport: el ListView diferido no lo construye.
      await _scrollHasta(tester, find.text('Pedidos por puesto'));
      // El SnackBar del checkout flota sobre la lista: esperar que se vaya
      // antes de tocar o scrollear.
      await _esperarAusencia(
        tester,
        find.byType(SnackBar),
        timeout: const Duration(seconds: 10),
      );
      // Con las corridas acumuladas la baldosa del pedido nuevo queda debajo
      // del viewport: el ListView construye en forma diferida y hay que
      // scrollear para que exista. Puede haber más de un pedido Confirmado
      // (corridas fallidas): la baldosa de esta corrida es la primera
      // (created_at desc).
      await _scrollHasta(tester, find.textContaining('Confirmado ·'));
      await _esperar(tester, find.textContaining('Confirmado ·'));

      // ---------- UI: DETALLE CON POLLING ----------
      // Recién confirmado es el único pedido en ese estado: el primero de la
      // lista (created_at desc) es el de esta corrida.
      await tester.tap(find.ancestor(
        of: find.textContaining('Confirmado ·'),
        matching: find.byType(ListTile),
      ).first);
      await _esperar(tester, find.text('Pedido creado'));

      // ---------- STAFF PREPARA (HTTP crudo, fuera del canal) ----------
      final listado = await _mercado('/pedidos', token: tokenComprador);
      final pedido = (listado['json']['pedidos'] as List)
          .cast<Map<String, dynamic>>()
          .firstWhere((p) => p['estado'] == 'confirmado');
      await _prepararPedido(staffToken, pedido['id'] as String, 'en_preparacion');
      // El detalle sondea cada 10 s: el chip debe pasar a En preparación.
      await _esperar(tester, find.text('En preparación'));

      await _prepararPedido(staffToken, pedido['id'] as String, 'listo');
      // El polling debe traer el hito nuevo.
      await _esperar(tester, find.text('Preparado'));
      await tester.pageBack();
      await _esperarListaRecargada(tester);

      // ---------- UI: COMPRADOR ARMA RECORRIDO ----------
      // Los pedidos se listan del más nuevo al más viejo: el primero es el de
      // esta corrida (otras corridas pueden dejar pedidos parecidos).
      final casilla = find.byType(CheckboxListTile).first;
      await tester.ensureVisible(casilla);
      await tester.pump();
      // Sin marcar la casilla el botón queda deshabilitado y el tap no haría
      // nada (falla silenciosa).
      await tester.tap(casilla);
      // El hit-test usa el último frame construido: sin este pump el botón
      // todavía figura deshabilitado y el tap no haría nada.
      await tester.pump();
      await tester.ensureVisible(find.text('Armar recorrido con estos pedidos'));
      await tester.tap(find.text('Armar recorrido con estos pedidos'));
      await _esperar(tester, find.text('Elegí un cargador'));
      // El listado ordena por score: el cargador nuevo (0 puntos) puede
      // quedar al fondo del sheet.
      await _esperar(tester, find.text('Cargador E2E'));
      await tester.ensureVisible(find.text('Cargador E2E'));
      await tester.tap(find.text('Cargador E2E'));
      // El SnackBar es la confirmación inequívoca de ESTA asignación: las
      // cards de corridas previas también pueden decir Asignado.
      await _esperar(tester, find.text('Recorrido asignado al cargador.'));
      // La recarga post-asignación puede completar entre dos frames (nunca
      // llegamos a ver el spinner): no se espera nada más de esta pantalla.

      // ---------- UI: CARGADOR ACEPTA, RETIRA Y ENTREGA ----------
      await _salir(tester);
      await _ingresar(tester, _emailCargador, cargador: true);
      await _esperar(tester, find.text('Disponible para recorridos'));
      await _esperar(tester, find.textContaining('· Asignado'));

      // Los recorridos se listan del más nuevo al más viejo: corridas previas
      // pueden dejar botones iguales en cards viejas, así que toda la
      // secuencia se acota a la primera card (la de esta corrida).
      Finder enTarjetaActual(String texto) => find.descendant(
        of: find.byType(Card).first,
        matching: find.text(texto),
      );
      await tester.ensureVisible(enTarjetaActual('Aceptar'));
      await tester.pump();
      await tester.tap(enTarjetaActual('Aceptar'));
      await _esperar(tester, enTarjetaActual('Retiré'));

      await tester.tap(enTarjetaActual('Retiré'));
      await _esperar(tester, enTarjetaActual('Entregué'));

      await tester.tap(enTarjetaActual('Entregué'));
      await _esperarAusencia(tester, enTarjetaActual('Entregué'));

      // ---------- UI: COMPRADOR CALIFICA ----------
      await _salir(tester);
      await _ingresar(tester, _emailComprador);
      // _ingresar no espera el shell: el POST de login sigue en vuelo tras
      // su único pump y sin esta espera el tap de 'Pedidos' no encuentra nada.
      await _esperar(tester, find.text('Pedidos'));
      await tester.tap(find.text('Pedidos'));
      await tester.pump();
      await _scrollHasta(tester, find.text('Pedidos por puesto'));
      // Con los pedidos acumulados de corridas previas, la sección Recorridos
      // queda debajo del viewport: el item recién se construye al scrollear.
      await _scrollHasta(tester, find.text('Calificar recorrido'));

      final calificar = find.descendant(
        of: find.byType(Card).first,
        matching: find.text('Calificar recorrido'),
      );
      await tester.ensureVisible(calificar);
      await tester.pump();
      await tester.tap(calificar);
      await _esperar(tester, find.text('Calificá al cargador'));
      await tester.tap(find.text('Enviar'));
      await _esperar(tester, find.text('Recorrido calificado'));
    },
    timeout: Timeout(const Duration(minutes: 12)),
  );
}
