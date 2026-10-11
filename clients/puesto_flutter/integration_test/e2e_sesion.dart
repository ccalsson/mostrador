import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

/// Asistencia de login para los e2e cuando el backend corre en el deployment
/// público: ahí Better Auth aplica su rate limit al sign-in (3 intentos por
/// 10s por IP) y responde 429 con `X-Retry-After`. Los tests hacen ráfagas
/// (fixtures por HTTP + login de UI), así que reintentan respetando esa
/// ventana en vez de fallar. Contra `npm run dev` el límite está apagado y
/// los reintentos nunca se activan.

const _intentosMax = 4;

/// POST de sign-in con reintentos ante 429; devuelve el token de sesión.
Future<String> signInConReintentos(
  http.Client client,
  Uri url,
  Map<String, String> headers,
  String body, {
  String motivo = 'sign-in',
}) async {
  for (var intento = 0;; intento++) {
    final res = await client.post(url, headers: headers, body: body);
    if (res.statusCode != 429 || intento >= _intentosMax - 1) {
      expect(res.statusCode, 200, reason: '$motivo: ${res.body}');
      return (jsonDecode(res.body) as Map<String, dynamic>)['token'] as String;
    }
    final espera = int.tryParse(res.headers['x-retry-after'] ?? '') ?? 11;
    await Future<void>.delayed(Duration(seconds: espera + 1));
  }
}

/// Toca `login_submit` y espera a que aparezca [destino] (la pantalla
/// post-login, o el mensaje de error en un test negativo). Si se quedó en el
/// login — casi seguro por 429 — espera la ventana de `X-Retry-After` y
/// reintenta el envío.
Future<void> tocaLoginHasta(
  WidgetTester tester,
  Finder destino, {
  Duration porIntento = const Duration(seconds: 20),
}) async {
  final login = find.byKey(const Key('login_submit'));
  for (var intento = 0; intento < _intentosMax; intento++) {
    if (login.evaluate().isNotEmpty) {
      await tester.tap(login);
      await tester.pump();
    }
    final fin = DateTime.now().add(porIntento);
    while (DateTime.now().isBefore(fin)) {
      await tester.pump(const Duration(milliseconds: 250));
      if (destino.evaluate().isNotEmpty) return;
    }
    await Future<void>.delayed(const Duration(seconds: 11));
  }
  fail('Login no alcanzó el destino tras $_intentosMax intentos: $destino');
}
