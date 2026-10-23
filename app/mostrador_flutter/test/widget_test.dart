import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mostrador_flutter/core/network/api_client.dart';
import 'package:mostrador_flutter/main.dart';
import 'package:mostrador_flutter/providers.dart';

/// ApiClient falso que devuelve respuestas vacías para que la app no falle.
class _EmptyApiClient implements ApiClient {
  @override
  String? get sessionToken => null;

  @override
  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    return _Resp(200, '{"items":[],"efectivo":0,"premium":false,"margen":{"cobrado":0,"costo":0,"diferencia":0,"sinPrecio":0,"serie":[],"entradas":[]},"deudas":[],"cierres":[]}');
  }

  @override
  Future<ApiResponse> post(String path, {Object? body, Map<String, String>? headers}) async =>
      _Resp(200, '{}');
  @override
  Future<ApiResponse> put(String path, {Object? body, Map<String, String>? headers}) async =>
      _Resp(200, '{}');
  @override
  Future<ApiResponse> delete(String path, {Map<String, String>? headers}) async =>
      _Resp(200, '{}');
}

class _Resp implements ApiResponse {
  _Resp(this.statusCode, this.body);
  @override
  final int statusCode;
  @override
  final String body;
  @override
  Map<String, dynamic> get json => Map<String, dynamic>.from(jsonDecode(body) as Map);
  @override
  List<dynamic> get jsonList => jsonDecode(body) as List<dynamic>;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('App arranca y muestra navegación de Caja', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(_EmptyApiClient())],
        child: const MostradorApp(),
      ),
    );
    await tester.pump();
    expect(find.text('Caja'), findsWidgets);
  });
}
