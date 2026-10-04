import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/clientes_service.dart';

ClientesService _servicio(MockClient mock) => ClientesService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  group('listar', () {
    test('GET /clientes y parsea la lista del contrato', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'cli_1',
                'nombre': 'Restaurante El Centro',
                'telefono': '1122334455',
                'cuentaCorriente': true,
              },
              {
                'id': 'cli_2',
                'nombre': 'Kiosco Tito',
                'cuentaCorriente': false,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final clientes = await servicio.listar();

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/clientes');
      expect(clientes.length, 2);
      expect(clientes[0].id, 'cli_1');
      expect(clientes[0].nombre, 'Restaurante El Centro');
      expect(clientes[0].telefono, '1122334455');
      expect(clientes[0].cuentaCorriente, isTrue);
      
      expect(clientes[1].id, 'cli_2');
      expect(clientes[1].telefono, isNull);
      expect(clientes[1].cuentaCorriente, isFalse);
    });
  });

  group('crear', () {
    test('POST /clientes con nombre, telefono y cuentaCorriente', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'id': 'cli_nuevo',
              'nombre': 'Super Mercado',
            },
          }),
          201,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final cliente = await servicio.crear(const ClienteInput(
        nombre: 'Super Mercado',
        telefono: '1155',
        cuentaCorriente: true,
      ));

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/clientes');
      expect(jsonDecode(visto.body), {
        'nombre': 'Super Mercado',
        'telefono': '1155',
        'cuentaCorriente': true,
      });
      
      expect(cliente.id, 'cli_nuevo');
      expect(cliente.nombre, 'Super Mercado');
      expect(cliente.telefono, '1155');
      expect(cliente.cuentaCorriente, isTrue);
    });
  });

  group('cuenta', () {
    test('GET /clientes/:id/cuenta y parsea la cuenta y movimientos', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'saldo': 25000.5,
              'movimientos': [
                {
                  'id': 'mov_1',
                  'tipo': 'cargo',
                  'monto': 50000.0,
                  'nota': 'Pedido #1',
                  'createdAt': '2026-10-01 10:00:00',
                },
                {
                  'id': 'mov_2',
                  'tipo': 'pago',
                  'monto': -24999.5,
                  'createdAt': '2026-10-02 11:00:00',
                },
              ],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final cuenta = await servicio.cuenta('cli_1');

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/clientes/cli_1/cuenta');
      
      expect(cuenta.saldo, 25000.5);
      expect(cuenta.movimientos.length, 2);
      expect(cuenta.movimientos[0].id, 'mov_1');
      expect(cuenta.movimientos[0].tipo, 'cargo');
      expect(cuenta.movimientos[0].monto, 50000.0);
      expect(cuenta.movimientos[0].nota, 'Pedido #1');
      
      expect(cuenta.movimientos[1].tipo, 'pago');
      expect(cuenta.movimientos[1].monto, -24999.5);
      expect(cuenta.movimientos[1].nota, isNull);
    });
  });
}
