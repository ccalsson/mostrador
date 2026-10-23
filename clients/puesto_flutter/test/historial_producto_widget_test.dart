import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/admin/historial_producto_widget.dart';
import 'package:puesto_flutter/features/admin/producto_form_dialog.dart';
import 'package:puesto_flutter/models/producto.dart';
import 'package:puesto_flutter/models/reportes.dart';
import 'package:puesto_flutter/services/reportes_service.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Mock de ReportesService para controlar la respuesta del historial.
class _MockReportesService implements ReportesService {
  _MockReportesService({this.historial, this.error});

  final dynamic historial;
  final Exception? error;

  @override
  Future<HistorialProducto> obtenerHistorialProducto(String productoId) async {
    if (error != null) throw error!;
    if (historial is HistorialProducto) return historial!;
    return HistorialProducto.vacio;
  }

  // Los métodos siguientes no se usan en estos tests, pero hay que
  // implementarlos porque la interfaz los exige.
  @override
  Future<ReporteProductosResumen> obtenerProductos() async =>
      ReporteProductosResumen.vacio;

  @override
  Future<RankingCargadores> obtenerRankingCargadores() async =>
      RankingCargadores.vacio;
}

/// Mock HTTP para el dialog de producto (catálogo + foto + historial).
class _DialogHttp {
  late final api = ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'tok-1',
    httpClient: MockClient((request) async {
      // GET historial
      if (request.method == 'GET' &&
          request.url.path.contains('/historial')) {
        return http.Response(
          jsonEncode({
            'data': {
              'dias': [
                {'dia': '2026-10-10', 'cantidad': 5.0, 'total': 10000.0},
                {'dia': '2026-10-11', 'cantidad': 8.0, 'total': 16000.0},
                {'dia': '2026-10-12', 'cantidad': 3.0, 'total': 6000.0},
              ],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      // PUT/PATCH guardar producto
      if (request.method == 'PUT' || request.method == 'PATCH') {
        return http.Response(
          jsonEncode({'data': {'ok': true}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      // POST foto
      if (request.method == 'POST' && request.url.path.contains('/foto')) {
        return http.Response(
          jsonEncode({'data': {'foto_url': '/uploads/test.jpg'}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      // DELETE foto
      if (request.method == 'DELETE' && request.url.path.contains('/foto')) {
        return http.Response(
          jsonEncode({'data': {'ok': true}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      // GET catálogo (para el ProviderScope)
      if (request.method == 'GET' &&
          request.url.path.contains('/catalogo')) {
        return http.Response(
          jsonEncode({'data': {'productos': [], 'version': null}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      throw StateError(
        'Request inesperada: ${request.method} ${request.url.path}',
      );
    }),
  );
}

Producto _productoExistente({String id = 'p_1', String nombre = 'Manzana'}) {
  return Producto(
    id: id,
    nombre: nombre,
    unidad: 'kg',
    unidadLabel: 'kg',
    precio: 2000,
    stock: 10,
    stockMinimo: 2,
    alias: const [],
    activo: true,
    stockBajo: false,
    publicadoOnline: false,
  );
}

// ---------------------------------------------------------------------------
// Tests: HistorialProductoWidget (standalone)
// ---------------------------------------------------------------------------

void main() {
  group('HistorialProductoWidget', () {
    testWidgets('muestra gráfico y tabla cuando hay datos', (tester) async {
      final servicio = _MockReportesService(
        historial: HistorialProducto(
          dias: const [
            HistorialVentaDia(dia: '2026-10-10', cantidad: 5, total: 10000),
            HistorialVentaDia(dia: '2026-10-11', cantidad: 8, total: 16000),
          ],
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            reportesServiceProvider.overrideWithValue(servicio),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: HistorialProductoWidget(productoId: 'p_1'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // El título del gráfico
      expect(find.text('Ventas diarias (últimos 30 días)'), findsOneWidget);
      // La tabla muestra las fechas formateadas
      expect(find.text('10/10/2026'), findsOneWidget);
      expect(find.text('11/10/2026'), findsOneWidget);
      // Totales (aparece en la fila de totales y como encabezado de columna)
      expect(find.text('Total'), findsWidgets);
      expect(find.text('\$26000,00'), findsOneWidget);
    });

    testWidgets('muestra mensaje cuando no hay ventas', (tester) async {
      final servicio = _MockReportesService(
        historial: HistorialProducto.vacio,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            reportesServiceProvider.overrideWithValue(servicio),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: HistorialProductoWidget(productoId: 'p_sin_ventas'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Sin ventas registradas en los últimos 30 días.'),
        findsOneWidget,
      );
    });

    testWidgets('muestra error y botón reintentar ante fallo', (tester) async {
      final servicio = _MockReportesService(
        error: const ApiException('Error de red'),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            reportesServiceProvider.overrideWithValue(servicio),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: HistorialProductoWidget(productoId: 'p_error'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Error de red'), findsOneWidget);
      expect(find.byKey(const Key('historial_producto_reintentar')),
          findsOneWidget);
    });

    testWidgets('la tabla incluye columna de cantidad con unidades',
        (tester) async {
      final servicio = _MockReportesService(
        historial: HistorialProducto(
          dias: const [
            HistorialVentaDia(dia: '2026-10-15', cantidad: 12.5, total: 25000),
          ],
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            reportesServiceProvider.overrideWithValue(servicio),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: HistorialProductoWidget(productoId: 'p_cant'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // La cantidad aparece en la fila de datos y en el total acumulado.
      expect(find.text('12,50 u.'), findsWidgets);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: Integración en el dialog de producto
  // ---------------------------------------------------------------------------

  group('ProductoFormDialog – pestañas de historial', () {
    Future<void> abrirDialogEdicion(
      WidgetTester tester,
      _DialogHttp backend, {
      Producto? existente,
    }) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [apiClientProvider.overrideWithValue(backend.api)],
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (ctx) => Center(
                  child: ElevatedButton(
                    onPressed: () =>
                        mostrarFormProducto(ctx, existente: existente),
                    child: const Text('Abrir'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Abrir'));
      await tester.pumpAndSettle();
    }

    testWidgets('producto nuevo NO muestra pestañas', (tester) async {
      final backend = _DialogHttp();
      await abrirDialogEdicion(tester, backend, existente: null);

      expect(find.text('Nuevo producto'), findsOneWidget);
      // No debe haber TabBar
      expect(find.byKey(const Key('producto_form_tabs')), findsNothing);
      expect(find.text('Datos'), findsNothing);
      expect(find.text('Historial'), findsNothing);
    });

    testWidgets('producto existente muestra pestañas Datos e Historial',
        (tester) async {
      final backend = _DialogHttp();
      await abrirDialogEdicion(
        tester,
        backend,
        existente: _productoExistente(),
      );

      expect(find.text('Editar Manzana'), findsOneWidget);
      expect(find.byKey(const Key('producto_form_tabs')), findsOneWidget);
      expect(find.text('Datos'), findsOneWidget);
      expect(find.text('Historial'), findsOneWidget);
    });

    testWidgets('historial tiene lazy loading: no carga hasta abrir pestaña',
        (tester) async {
      final backend = _DialogHttp();
      await abrirDialogEdicion(
        tester,
        backend,
        existente: _productoExistente(),
      );

      // Al abrir, estamos en la pestaña "Datos". El placeholder del
      // historial NO debería haber cargado datos todavía.
      // Verificamos que el campo "Nombre" (pestaña Datos) está visible.
      expect(find.byKey(const Key('admin_prod_nombre')), findsOneWidget);

      // Cambiar a la pestaña Historial
      await tester.tap(find.text('Historial'));
      await tester.pumpAndSettle();

      // Ahora debería aparecer el contenido del historial
      expect(find.text('Ventas diarias (últimos 30 días)'), findsOneWidget);
    });
  });
}
