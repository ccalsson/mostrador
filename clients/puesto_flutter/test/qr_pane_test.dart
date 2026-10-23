import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/features/admin/qr_pane.dart';
import 'package:puesto_flutter/services/tenant_service.dart';

void main() {
  group('QrPane', () {
    testWidgets('muestra error si PUBLIC_SITE_URL no esta configurada', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tenantProvider.overrideWith((ref) async => const IdentidadTenant(
              nombre: 'Test Puesto',
              bajada: '',
            )),
          ],
          child: const MaterialApp(
            home: Scaffold(body: QrPane()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('PUBLIC_SITE_URL no esta configurada.'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('muestra nombre del puesto del tenant', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tenantProvider.overrideWith((ref) async => const IdentidadTenant(
              nombre: 'Mi Negocio',
              bajada: 'La mejor tienda',
            )),
          ],
          child: const MaterialApp(
            home: Scaffold(body: QrPane()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // En entorno de test, PUBLIC_SITE_URL esta vacio, asi que muestra error
      expect(find.text('PUBLIC_SITE_URL no esta configurada.'), findsOneWidget);
    });
  });
}
