import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/mensajes.dart';
import 'package:puesto_flutter/services/mensajes_service.dart';

MensajesService _servicio(MockClient mock) =>
    MensajesService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  test('listarConversaciones: GET /mensajes/conversaciones', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': [
            {
              'pedidoId': 'p1',
              'clienteNombre': 'Ana',
              'estado': 'enviado',
              'pedidoAt': '2026-10-16 10:00:00+00',
              'ultimo': '¿Está listo?',
              'ultimoDe': 'cliente',
              'ultimoAt': '2026-10-16 12:30:00+00',
              'sinLeer': 2,
            },
          ],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final lista = await servicio.listarConversaciones();

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/mensajes/conversaciones');
    expect(visto.headers['authorization'], 'Bearer tok-1');
    expect(lista, hasLength(1));
    expect(lista.first.pedidoId, 'p1');
    expect(lista.first.sinLeer, 2);
    expect(lista.first.ultimoDe, 'cliente');
  });

  test('mensajesDelPedido: GET /pedidos/:id/mensajes con paginación', () async {
    final servicio = _servicio(MockClient((request) async {
      expect(request.url.path, '/api/v1/pedidos/p1/mensajes');
      return http.Response(
        jsonEncode({
          'data': {
            'mensajes': [
              {
                'id': 'm1',
                'emisor': 'cliente',
                'cuerpo': 'Hola',
                'createdAt': '2026-10-16 10:00:00+00',
              },
              {
                'id': 'm2',
                'emisor': 'negocio',
                'cuerpo': 'Hola, ¿en qué te ayudo?',
                'createdAt': '2026-10-16 10:01:00+00',
              },
            ],
            'hayMas': false,
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final pagina = await servicio.mensajesDelPedido('p1');
    expect(pagina.mensajes, hasLength(2));
    expect(pagina.mensajes.first.emisor, 'cliente');
    expect(pagina.mensajes.last.emisor, 'negocio');
    expect(pagina.hayMas, isFalse);
  });

  test('enviar: POST /pedidos/:id/mensajes con cuerpo', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': {'ok': true},
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    await servicio.enviar('p1', 'Listo para retirar');

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/pedidos/p1/mensajes');
    final body = jsonDecode(visto.body) as Map<String, dynamic>;
    expect(body['cuerpo'], 'Listo para retirar');
  });

  test('ConversacionResumen tolera campos ausentes', () {
    final c = ConversacionResumen.fromJson(const {});
    expect(c.pedidoId, isEmpty);
    expect(c.sinLeer, 0);
  });

  test('MensajesPagina.vacio tiene lista vacía y hayMas=false', () {
    expect(MensajesPagina.vacio.mensajes, isEmpty);
    expect(MensajesPagina.vacio.hayMas, isFalse);
  });
}
