import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/mesa_turno.dart';
import 'package:puesto_flutter/services/mesa_turno_service.dart';

/// Payload tal como lo arma `mesaTurnoForStaff` en
/// `app/src/lib/server/mesa-turno.ts` (respaldo real del contrato).
Map<String, dynamic> _payloadBackend() => {
      'cobrado': 125000.50,
      'enCurso': 3,
      'stockBajo': 5,
      'pedidosApp': 2,
      'publicados': 48,
    };

MesaTurnoService _servicio(MockClient mock) => MesaTurnoService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  group('MesaTurno model', () {
    test('fromJson parsea el payload real del backend', () {
      final mesa = MesaTurno.fromJson(_payloadBackend());
      expect(mesa.cobrado, 125000.50);
      expect(mesa.enCurso, 3);
      expect(mesa.stockBajo, 5);
      expect(mesa.pedidosApp, 2);
      expect(mesa.publicados, 48);
    });

    test('fromJson tolera payload vacío con valores por defecto', () {
      final mesa = MesaTurno.fromJson(const {});
      expect(mesa.cobrado, 0);
      expect(mesa.enCurso, 0);
      expect(mesa.stockBajo, 0);
      expect(mesa.pedidosApp, 0);
      expect(mesa.publicados, 0);
    });

    test('vacio tiene todos los indicadores en cero', () {
      expect(MesaTurno.vacio.cobrado, 0);
      expect(MesaTurno.vacio.enCurso, 0);
      expect(MesaTurno.vacio.stockBajo, 0);
      expect(MesaTurno.vacio.pedidosApp, 0);
      expect(MesaTurno.vacio.publicados, 0);
    });
  });

  group('MesaTurnoService', () {
    test('obtener: GET /mesa-turno con Bearer token', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({'data': _payloadBackend()}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final mesa = await servicio.obtener();

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/mesa-turno');
      expect(visto.headers['authorization'], 'Bearer tok-1');
      expect(mesa.cobrado, 125000.50);
      expect(mesa.enCurso, 3);
      expect(mesa.stockBajo, 5);
      expect(mesa.pedidosApp, 2);
      expect(mesa.publicados, 48);
    });

    test('obtener: lanza ApiException si el servidor responde 500', () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          '{"error": "internal", "message": "Error interno"}',
          500,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      expect(servicio.obtener, throwsA(isA<ServerException>()));
    });
  });
}
