import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

void main() {
  test('actualizarEstado envía la transición pedida a la API canónica', () async {
    late http.Request visto;
    final service = PedidosService(
      ApiClient(
        baseUrl: 'http://api.test',
        tokenProvider: () async => 'tok-1',
        httpClient: MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'id': 'ped_1', 'estado': 'listo', 'items': []},
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      ),
    );

    final pedido = await service.actualizarEstado('ped_1', PedidoEstado.listo);

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/pedidos/ped_1/estado');
    expect(jsonDecode(visto.body), {'estado': 'listo'});
    expect(pedido.estado, PedidoEstado.listo);
  });
}
