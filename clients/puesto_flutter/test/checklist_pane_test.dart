import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/pedidos/checklist_pane.dart';
import 'package:puesto_flutter/models/checklist.dart';
import 'package:puesto_flutter/services/checklist_service.dart';

/// Fake de [ChecklistService] para tests de widget.
class _ChecklistFake implements ChecklistService {
  _ChecklistFake(List<ChecklistItem> items) : _items = List.of(items);

  List<ChecklistItem> _items;
  ApiException? crearError;
  ApiException? toggleError;
  ApiException? borrarError;
  int crearLlamadas = 0;
  int toggleLlamadas = 0;
  int borrarLlamadas = 0;

  @override
  Future<List<ChecklistItem>> listarItems(String pedidoId) async =>
      List.unmodifiable(_items);

  @override
  Future<ChecklistItem> crearItem(String pedidoId, String descripcion) async {
    crearLlamadas++;
    final error = crearError;
    if (error != null) throw error;
    final item = ChecklistItem(
      id: 'chk_new_$crearLlamadas',
      pedidoId: pedidoId,
      descripcion: descripcion,
      completado: false,
      createdAt: '2026-01-01',
    );
    _items.add(item);
    return item;
  }

  @override
  Future<ChecklistItem> toggleItem(
    String pedidoId,
    String itemId,
    bool completado,
  ) async {
    toggleLlamadas++;
    final error = toggleError;
    if (error != null) throw error;
    _items = [
      for (final i in _items)
        i.id == itemId ? ChecklistItem(
          id: i.id,
          pedidoId: i.pedidoId,
          descripcion: i.descripcion,
          completado: completado,
          createdAt: i.createdAt,
        ) : i,
    ];
    return _items.firstWhere((i) => i.id == itemId);
  }

  @override
  Future<void> borrarItem(String pedidoId, String itemId) async {
    borrarLlamadas++;
    final error = borrarError;
    if (error != null) throw error;
    _items.removeWhere((i) => i.id == itemId);
  }

  @override
  Future<List<ChecklistTemplate>> listarTemplates() async =>
      throw UnimplementedError();

  @override
  Future<ChecklistTemplate> crearTemplate(String nombre, List<String> items) async =>
      throw UnimplementedError();
}

ChecklistItem _item(String id, {String descripcion = 'Item', bool completado = false}) =>
    ChecklistItem(
      id: id,
      pedidoId: 'ped_1',
      descripcion: descripcion,
      completado: completado,
      createdAt: '2026-01-01',
    );

/// Espera a que un finder aparezca en pantalla (sondeo de frames).
Future<void> _esperar(
  WidgetTester tester,
  Finder finder, {
  int intentos = 50,
}) async {
  for (var i = 0; i < intentos; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('No aparecio en pantalla: $finder');
}

Future<void> _montar(WidgetTester tester, _ChecklistFake fake) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [checklistServiceProvider.overrideWithValue(fake)],
    child: const MaterialApp(
      home: Scaffold(body: ChecklistPane(pedidoId: 'ped_1')),
    ),
  ));
  await tester.pump();
}

void main() {
  testWidgets('lista vacia: muestra mensaje y input', (tester) async {
    final fake = _ChecklistFake([]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_input')));

    expect(find.text('No hay items en el checklist.\nAgrega items para verificar antes de entregar.'),
        findsOneWidget);
    expect(find.byKey(const Key('checklist_agregar')), findsOneWidget);
  });

  testWidgets('lista con items: muestra checkboxes y descripcion',
      (tester) async {
    final fake = _ChecklistFake([
      _item('chk_1', descripcion: 'Verificar mercaderia'),
      _item('chk_2', descripcion: 'Confirmar direccion', completado: true),
    ]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_lista')));

    expect(find.text('Verificar mercaderia'), findsOneWidget);
    expect(find.text('Confirmar direccion'), findsOneWidget);
    expect(find.byKey(const Key('checklist_checkbox_chk_1')), findsOneWidget);
    expect(find.byKey(const Key('checklist_checkbox_chk_2')), findsOneWidget);
  });

  testWidgets('barra de progreso: muestra conteo', (tester) async {
    final fake = _ChecklistFake([
      _item('chk_1', completado: true),
      _item('chk_2', completado: false),
    ]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_progreso')));

    expect(find.text('1 de 2 completados'), findsOneWidget);
    expect(find.text('50%'), findsOneWidget);
  });

  testWidgets('todos completados: muestra "Listo para entregar"',
      (tester) async {
    final fake = _ChecklistFake([
      _item('chk_1', completado: true),
      _item('chk_2', completado: true),
    ]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_progreso')));

    expect(find.text('Listo para entregar'), findsOneWidget);
    expect(find.text('100%'), findsOneWidget);
  });

  testWidgets('toggle: marca item como completado', (tester) async {
    final fake = _ChecklistFake([_item('chk_1')]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_checkbox_chk_1')));

    await tester.tap(find.byKey(const Key('checklist_checkbox_chk_1')));
    await tester.pump();

    expect(fake.toggleLlamadas, 1);
  });

  testWidgets('agregar item: envia descripcion al backend', (tester) async {
    final fake = _ChecklistFake([]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_input')));

    await tester.enterText(
        find.byKey(const Key('checklist_input')), 'Nuevo item');
    await tester.tap(find.byKey(const Key('checklist_agregar')));
    await tester.pump();

    expect(fake.crearLlamadas, 1);
  });

  testWidgets('agregar vacio: no llama al backend', (tester) async {
    final fake = _ChecklistFake([]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_input')));

    await tester.tap(find.byKey(const Key('checklist_agregar')));
    await tester.pump();

    expect(fake.crearLlamadas, 0);
  });

  testWidgets('agregar con error: muestra mensaje de error', (tester) async {
    final fake = _ChecklistFake([]);
    fake.crearError = ServerException('Falla simulada.');
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_input')));

    await tester.enterText(
        find.byKey(const Key('checklist_input')), 'Item');
    await tester.tap(find.byKey(const Key('checklist_agregar')));
    await _esperar(tester, find.byKey(const Key('checklist_error')));

    expect(find.text('Falla simulada.'), findsOneWidget);
    expect(fake.crearLlamadas, 1);
  });

  testWidgets('borrar item: confirma y llama al backend', (tester) async {
    final fake = _ChecklistFake([_item('chk_1', descripcion: 'Borrable')]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_borrar_chk_1')));

    await tester.tap(find.byKey(const Key('checklist_borrar_chk_1')));
    await _esperar(tester, find.byKey(const Key('checklist_borrar_confirmar')));
    await tester.tap(find.byKey(const Key('checklist_borrar_confirmar')));
    await tester.pump();

    expect(fake.borrarLlamadas, 1);
  });

  testWidgets('items completados: muestra tachado', (tester) async {
    final fake = _ChecklistFake([
      _item('chk_1', descripcion: 'Hecho', completado: true),
    ]);
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('checklist_lista')));

    final textFinder = find.text('Hecho');
    expect(textFinder, findsOneWidget);
    final textWidget = tester.widget<Text>(textFinder);
    expect(textWidget.style?.decoration, TextDecoration.lineThrough);
  });
}
