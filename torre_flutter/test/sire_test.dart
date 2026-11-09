import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:torre_flutter/src/api.dart';
import 'package:torre_flutter/src/pantallas/plataforma/sire.dart';

class SireFalso extends TorreApi {
  SireFalso() : super(servidor: 'https://example.test');
  final calls = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> fnMapa(String nombre, [Object? data]) async {
    if (nombre == 'consultarInstitucionesSire') return {'disponible':true,'data':{'institutions':[{'id':'i','name':'ISFD ficticio'}],'sites':[{'id':'s','institution_id':'i','name':'Sede central','kind':'sede','active':true}],'members':[{'id':'m','institution_id':'i','name':'Docente ficticio','role':'docente','active':true,'email':'docente@example.test'}], 'limited':false}};
    calls.add(Map<String, dynamic>.from(data as Map));
    return {'ok':true,'mensaje':'Operación guardada'};
  }
}

void main() {
  testWidgets('crea institución y transmite cuentas ficticias', (tester) async {
    final api = SireFalso();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: PantallaSire(api: api)))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Crear institución'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Institución'), 'Instituto de prueba');
    await tester.enterText(find.widgetWithText(TextField, 'Correo de rectoría'), 'rector@example.test');
    await tester.tap(find.text('Guardar'));
    await tester.pumpAndSettle();
    expect(api.calls.single['action'], 'create-institution');
    expect(api.calls.single['institutionName'], 'Instituto de prueba');
    expect(api.calls.single['rectorEmail'], 'rector@example.test');
    expect(api.calls.single['operationId'], matches(RegExp(r'^[0-9a-f-]{36}$')));
  });

  testWidgets('suspende solo el acceso seleccionado', (tester) async {
    final api = SireFalso();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: PantallaSire(api: api)))));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Suspender acceso'));
    await tester.tap(find.text('Suspender acceso'));
    await tester.pumpAndSettle();
    expect(api.calls.single['action'], 'set-member-state');
    expect(api.calls.single['institutionId'], 'i');
    expect(api.calls.single['membershipId'], 'm');
    expect(api.calls.single['active'], false);
  });
}
