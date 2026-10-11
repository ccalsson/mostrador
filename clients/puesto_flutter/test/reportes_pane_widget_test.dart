import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/admin/reportes_pane.dart';
import 'package:puesto_flutter/models/reportes.dart';
import 'package:puesto_flutter/services/reportes_service.dart';

class MockReportesService implements ReportesService {
  MockReportesService({
    this.resumenProductos,
    this.historial,
    this.ranking,
    this.error,
  });

  final ReporteProductosResumen? resumenProductos;
  final HistorialProducto? historial;
  final RankingCargadores? ranking;
  final Exception? error;

  @override
  Future<ReporteProductosResumen> obtenerProductos() async {
    if (error != null) throw error!;
    return resumenProductos ?? ReporteProductosResumen.vacio;
  }

  @override
  Future<HistorialProducto> obtenerHistorialProducto(String productoId) async {
    if (error != null) throw error!;
    return historial ?? HistorialProducto.vacio;
  }

  @override
  Future<RankingCargadores> obtenerRankingCargadores() async {
    if (error != null) throw error!;
    return ranking ?? RankingCargadores.vacio;
  }
}

Widget _construirTestApp(ReportesService servicio) {
  return ProviderScope(
    overrides: [
      reportesServiceProvider.overrideWithValue(servicio),
    ],
    child: const MaterialApp(
      home: Scaffold(
        body: ReportesPane(),
      ),
    ),
  );
}

void main() {
  final resumenMock = ReporteProductosResumen(
    semana: const [
      ReporteVentaProducto(
        productoId: 'p1',
        nombre: 'Cebolla Morada',
        cantidad: 30,
        total: 60000,
      ),
    ],
    mes: const [
      ReporteVentaProducto(
        productoId: 'p2',
        nombre: 'Zanahoria',
        cantidad: 120,
        total: 180000,
      ),
    ],
  );

  final historialMock = HistorialProducto(
    dias: const [
      HistorialVentaDia(
        dia: '2026-10-10',
        cantidad: 10,
        total: 20000,
      ),
      HistorialVentaDia(
        dia: '2026-10-11',
        cantidad: 20,
        total: 40000,
      ),
    ],
  );

  final rankingMock = RankingCargadores(
    ranking: const [
      RankingCargadorItem(
        puesto: 1,
        nombre: 'Lautaro',
        nivel: 'Oro',
        puntos: 320,
        score: 4.95,
        recorridosCompletados: 54,
      ),
    ],
  );

  testWidgets('Muestra productos más vendidos y conmuta período', (tester) async {
    final mock = MockReportesService(resumenProductos: resumenMock);
    await tester.pumpWidget(_construirTestApp(mock));
    await tester.pumpAndSettle();

    // Por defecto período 7 días
    expect(find.text('Cebolla Morada'), findsOneWidget);
    expect(find.text('30 unidades vendidas'), findsOneWidget);
    expect(find.text('Zanahoria'), findsNothing);

    // Cambiar a 30 días
    await tester.tap(find.text('30 días'));
    await tester.pumpAndSettle();

    expect(find.text('Zanahoria'), findsOneWidget);
    expect(find.text('120 unidades vendidas'), findsOneWidget);
    expect(find.text('Cebolla Morada'), findsNothing);
  });

  testWidgets('Seleccionar un producto abre su historial de 7 días',
      (tester) async {
    final mock = MockReportesService(
      resumenProductos: resumenMock,
      historial: historialMock,
    );
    await tester.pumpWidget(_construirTestApp(mock));
    await tester.pumpAndSettle();

    // Inicialmente no está la tarjeta de historial
    expect(find.byKey(const Key('reportes_historial_card')), findsNothing);

    // Tocamos el producto
    await tester.tap(find.byKey(const Key('reportes_producto_tile_p1')));
    await tester.pumpAndSettle();

    // Aparece el historial
    expect(find.byKey(const Key('reportes_historial_card')), findsOneWidget);
    expect(
      find.text('Historial últimos 7 días · Cebolla Morada'),
      findsOneWidget,
    );
    expect(find.text('10/10'), findsOneWidget);
    expect(find.text('11/10'), findsOneWidget);
  });

  testWidgets('Conmutar a Ranking de cargadores muestra banner y lista',
      (tester) async {
    final mock = MockReportesService(
      resumenProductos: resumenMock,
      ranking: rankingMock,
    );
    await tester.pumpWidget(_construirTestApp(mock));
    await tester.pumpAndSettle();

    // Seleccionamos la sección Ranking cargadores
    await tester.tap(find.text('Ranking cargadores'));
    await tester.pumpAndSettle();

    // Verifica banner explicativo y datos del cargador
    expect(
      find.textContaining('El puntaje lo calcula Mercado'),
      findsOneWidget,
    );
    expect(find.text('Lautaro'), findsOneWidget);
    expect(find.textContaining('Oro'), findsOneWidget);
    expect(find.textContaining('54 entregas'), findsOneWidget);
    expect(find.text('#1'), findsOneWidget);
    expect(find.text('5.0'), findsOneWidget); // 4.95 redondeado a 1 decimal
  });

  testWidgets('Muestra error y botón reintentar ante fallo de API',
      (tester) async {
    final mock = MockReportesService(
      error: const ApiException('Error de conexión con reportes', statusCode: 500),
    );
    await tester.pumpWidget(_construirTestApp(mock));
    await tester.pumpAndSettle();

    expect(find.text('Error de conexión con reportes'), findsOneWidget);
    expect(find.byKey(const Key('reportes_productos_reintentar')), findsOneWidget);
  });
}
