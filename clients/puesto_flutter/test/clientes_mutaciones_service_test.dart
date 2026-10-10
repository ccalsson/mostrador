import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/cliente.dart';
import 'package:puesto_flutter/services/clientes_service.dart';

ClientesService _servicio(MockClient mock) => ClientesService(
  ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'tok-1',
    httpClient: mock,
    timeout: const Duration(seconds: 5),
  ),
);

void main() {
  test(
    'actualizar replica el contrato canónico de edición de cliente',
    () async {
      late http.Request visto;
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'ok': true},
            }),
            200,
          );
        }),
      );

      await servicio.actualizar(
        'cli_1',
        const ClienteActualizacionInput(
          nombre: 'Almacén Centro',
          telefono: '1144556677',
          cuit: '20123456789',
          direccion: 'Calle 123',
          cuentaCorriente: true,
          condicionIva: 'ri',
          activo: false,
        ),
      );

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/clientes/cli_1');
      expect(jsonDecode(visto.body), {
        'nombre': 'Almacén Centro',
        'telefono': '1144556677',
        'cuit': '20123456789',
        'direccion': 'Calle 123',
        'cuentaCorriente': true,
        'condicionIva': 'ri',
        'activo': false,
      });
    },
  );

  test(
    'registrarPago manda monto positivo y nota al endpoint de cuenta',
    () async {
      late http.Request visto;
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'ok': true},
            }),
            200,
          );
        }),
      );

      await servicio.registrarPago(
        'cli_1',
        monto: 1250.5,
        nota: 'Pago parcial',
      );

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/clientes/cli_1/pagos');
      expect(jsonDecode(visto.body), {'monto': 1250.5, 'nota': 'Pago parcial'});
    },
  );

  test('el modelo toma datos completos de ficha y saldo de GET /clientes', () {
    final cliente = Cliente.fromJson({
      'id': 'cli_1',
      'nombre': 'Almacén Centro',
      'telefono': '1144556677',
      'cuit': '20123456789',
      'direccion': 'Calle 123',
      'cuentaCorriente': true,
      'condicionIva': 'ri',
      'activo': false,
      'saldo': 4200.75,
    });

    expect(cliente.cuit, '20123456789');
    expect(cliente.direccion, 'Calle 123');
    expect(cliente.condicionIva, 'ri');
    expect(cliente.activo, isFalse);
    expect(cliente.saldo, 4200.75);
  });
}
