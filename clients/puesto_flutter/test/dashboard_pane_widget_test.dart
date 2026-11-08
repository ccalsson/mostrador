import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/features/admin/dashboard_pane.dart';
import 'package:puesto_flutter/models/dashboard.dart';
import 'package:puesto_flutter/models/producto.dart';
import 'package:puesto_flutter/services/catalogo_service.dart';
import 'package:puesto_flutter/services/dashboard_service.dart';
import 'package:puesto_flutter/services/tenant_service.dart';

const _resumen = DashboardResumen(
  totalVentas: 100000,
  totalCobrado: 90000,
  cantidadPedidos: 10,
  cantidadCobros: 8,
  pedidosPendientes: 2,
  stockBajoCount: 1,
  porFormaPago: {'efectivo': 60000, 'transferencia': 30000},
  alertasSinLeer: 3,
  reputacionPromedio: 4.5,
  ventasPorSucursal: {'Central': 70000, 'Norte': 30000},
);

final _productos = Catalogo(
  productos: [
    const Producto(id: '1', nombre: 'Tomate', unidad: 'kg', unidadLabel: 'kg',
        precio: 1000, stock: 50, stockMinimo: 10, alias: [], activo: true, stockBajo: false),
    const Producto(id: '2', nombre: 'Lechuga', unidad: 'bulto', unidadLabel: 'atado',
        precio: 500, stock: 0, stockMinimo: 5, alias: [], activo: true, stockBajo: true),
  ],
  version: null,
);

Widget _wrap(DashboardResumen resumen) {
  return ProviderScope(
    overrides: [
      dashboardProvider.overrideWith((ref) async => resumen),
      catalogoProvider.overrideWith((ref) async => _productos),
      tenantProvider.overrideWith((ref) async => const IdentidadTenant(nombre: 'Puesto Test', bajada: 'Mercado Central')),
    ],
    child: MaterialApp(
      theme: ThemeData(useMaterial3: true, extensions: const [TokensMostrador.claro]),
      home: const Scaffold(body: DashboardPane()),
    ),
  );
}

Future<void> _scrollDown(WidgetTester tester) async {
  await tester.drag(find.byKey(const Key('dashboard_lista')), const Offset(0, -2000));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('muestra tarjeta de identidad del puesto', (tester) async {
    await tester.pumpWidget(_wrap(_resumen));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('dashboard_identidad')), findsOneWidget);
    expect(find.text('Puesto Test'), findsOneWidget);
  });

  testWidgets('muestra reputacion con estrellas', (tester) async {
    await tester.pumpWidget(_wrap(_resumen));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('dashboard_reputacion')), findsOneWidget);
    expect(find.text('4.5'), findsOneWidget);
    expect(find.byIcon(Icons.star), findsWidgets);
  });

  testWidgets('muestra grafico de barras de sucursales', (tester) async {
    await tester.pumpWidget(_wrap(_resumen));
    await tester.pumpAndSettle();
    await _scrollDown(tester);
    expect(find.byKey(const Key('dashboard_comparar_sucursales')), findsOneWidget);
    expect(find.byType(BarChart), findsOneWidget);
  });

  testWidgets('muestra pie chart interactivo', (tester) async {
    await tester.pumpWidget(_wrap(_resumen));
    await tester.pumpAndSettle();
    await _scrollDown(tester);
    expect(find.byType(PieChart), findsOneWidget);
  });

  testWidgets('muestra stock board con productos', (tester) async {
    await tester.pumpWidget(_wrap(_resumen));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('dashboard_stock_board')), findsOneWidget);
    expect(find.text('Tomate'), findsOneWidget);
    expect(find.text('Lechuga'), findsOneWidget);
  });

  testWidgets('stock board: buscar filtra productos', (tester) async {
    await tester.pumpWidget(_wrap(_resumen));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('stock_buscar')), 'tom');
    await tester.pumpAndSettle();
    expect(find.text('Tomate'), findsOneWidget);
    expect(find.text('Lechuga'), findsNothing);
  });

  testWidgets('sin sucursales no muestra grafico', (tester) async {
    final sinSucursales = DashboardResumen(
      totalVentas: 100, totalCobrado: 100, cantidadPedidos: 1,
      cantidadCobros: 1, pedidosPendientes: 0, stockBajoCount: 0,
      porFormaPago: const {}, alertasSinLeer: 0,
    );
    await tester.pumpWidget(_wrap(sinSucursales));
    await tester.pumpAndSettle();
    await _scrollDown(tester);
    expect(find.byKey(const Key('dashboard_comparar_sucursales')), findsNothing);
  });
}
