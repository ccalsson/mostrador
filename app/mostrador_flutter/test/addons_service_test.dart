import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mostrador_flutter/core/network/api_client.dart';
import 'package:mostrador_flutter/models/addon.dart';
import 'package:mostrador_flutter/services/addons_service.dart';

// ---------------------------------------------------------------------------
// Fake ApiClient — devuelve respuestas predefinidas sin tocar la red.
// ---------------------------------------------------------------------------

class _FakeApiClient extends ApiClient {
  _FakeApiClient(this._responses) : super(baseUrl: 'http://localhost:0');
  final Map<String, ApiResponse> _responses;
  final List<String> llamadas = [];

  @override
  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    llamadas.add('GET $path');
    return _responses['GET $path'] ?? _responses[path] ?? ApiResponse(404, _EmptyHeaders(), '{"error":"not_found"}');
  }

  @override
  Future<ApiResponse> post(String path, {Object? body, Map<String, String>? headers}) async {
    llamadas.add('POST $path');
    return _responses['POST $path'] ?? _responses[path] ?? ApiResponse(404, _EmptyHeaders(), '{"error":"not_found"}');
  }
}

/// HttpHeaders mínimo para tests.
class _EmptyHeaders implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

ApiResponse _ok(Map<String, dynamic> body) =>
    ApiResponse(200, _EmptyHeaders(), jsonEncode(body));

ApiResponse _status(int code, {String body = '{"error":"fail"}'}) =>
    ApiResponse(code, _EmptyHeaders(), body);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

List<Map<String, dynamic>> _fixtureAddons() => [
      {
        'id': 'addon_mercado',
        'nombre': 'Mercado al toque',
        'descripcion': 'Publicá tus productos en mercados online.',
        'precioUSD': 15.0,
        'precioARS': 25000.0,
        'icono': 'mercado',
        'contratado': false,
      },
      {
        'id': 'addon_messaging',
        'nombre': 'Mensajería',
        'descripcion': 'Enviá mensajes a tus clientes.',
        'precioUSD': 10.0,
        'precioARS': 17000.0,
        'icono': 'messaging',
        'contratado': true,
      },
    ];

List<Map<String, dynamic>> _fixtureContratos() => [
      {
        'id': 'doc_uso_app',
        'titulo': 'Condiciones de uso de la app',
        'version': 3,
        'hash': 'abc123',
        'aceptado': false,
      },
      {
        'id': 'doc_addons',
        'titulo': 'Condiciones de add-ons y servicios',
        'version': 2,
        'hash': 'def456',
        'aceptado': false,
      },
    ];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  group('Addon.fromJson', () {
    test('parsea correctamente todos los campos', () {
      final addon = Addon.fromJson(_fixtureAddons().first);
      expect(addon.id, 'addon_mercado');
      expect(addon.nombre, 'Mercado al toque');
      expect(addon.descripcion, 'Publicá tus productos en mercados online.');
      expect(addon.precioUSD, 15.0);
      expect(addon.precioARS, 25000.0);
      expect(addon.icono, 'mercado');
      expect(addon.contratado, isFalse);
    });

    test('campos opcionales con defaults cuando faltan', () {
      final addon = Addon.fromJson({'id': 'x'});
      expect(addon.id, 'x');
      expect(addon.nombre, '');
      expect(addon.descripcion, '');
      expect(addon.precioUSD, 0);
      expect(addon.precioARS, 0);
      expect(addon.icono, isNull);
      expect(addon.contratado, isFalse);
    });

    test('valores numéricos como string se parsean', () {
      final addon = Addon.fromJson({
        'id': 'y',
        'precioUSD': '15.50',
        'precioARS': '25000',
      });
      expect(addon.precioUSD, 15.50);
      expect(addon.precioARS, 25000);
    });
  });

  group('AddonContrato.fromJson', () {
    test('parsea id, titulo, version y hash', () {
      final contrato = AddonContrato.fromJson(_fixtureContratos().first);
      expect(contrato.id, 'doc_uso_app');
      expect(contrato.titulo, 'Condiciones de uso de la app');
      expect(contrato.version, 3);
      expect(contrato.hash, 'abc123');
      expect(contrato.aceptado, isFalse);
    });

    test('acepta documentoId como alias de id', () {
      final contrato = AddonContrato.fromJson({
        'documentoId': 'doc_x',
        'titulo': 'Test',
        'version': 1,
        'hash': 'h',
      });
      expect(contrato.id, 'doc_x');
    });

    test('defaults cuando faltan campos', () {
      final contrato = AddonContrato.fromJson({});
      expect(contrato.id, '');
      expect(contrato.titulo, '');
      expect(contrato.version, 0);
      expect(contrato.hash, '');
      expect(contrato.aceptado, isFalse);
    });
  });

  group('AddonCompraException.mensajeUsuario', () {
    test('saldo insuficiente devuelve mensaje específico', () {
      final e = AddonCompraException(402, 'saldo insuficiente');
      expect(e.mensajeUsuario, contains('saldo'));
    });

    test('ya contratado devuelve mensaje específico', () {
      final e = AddonCompraException(409, 'ya contratado');
      expect(e.mensajeUsuario, contains('contratado'));
    });

    test('400 con mensaje lo muestra', () {
      final e = AddonCompraException(400, 'Datos inválidos');
      expect(e.mensajeUsuario, 'Datos inválidos');
    });

    test('400 sin mensaje usa default', () {
      final e = AddonCompraException(400, '');
      expect(e.mensajeUsuario, contains('inválidos'));
    });

    test('error genérico usa mensaje por defecto', () {
      final e = AddonCompraException(500, '');
      expect(e.mensajeUsuario, contains('Intentá de nuevo'));
    });
  });

  group('AddonsService.listar', () {
    test('devuelve lista de add-ons cuando el status es 200', () async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({'addons': _fixtureAddons()}),
      });
      final service = AddonsService(client);
      final addons = await service.listar();
      expect(addons, hasLength(2));
      expect(addons.first.id, 'addon_mercado');
      expect(addons.last.contratado, isTrue);
    });

    test('acepta respuesta con clave "data" en vez de "addons"', () async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({'data': _fixtureAddons()}),
      });
      final service = AddonsService(client);
      final addons = await service.listar();
      expect(addons, hasLength(2));
    });

    test('lanza AddonsApiException en 500', () async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _status(500),
      });
      final service = AddonsService(client);
      expect(() => service.listar(), throwsA(isA<AddonsApiException>()));
    });

    test('lanza AddonsApiException en 403', () async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _status(403),
      });
      final service = AddonsService(client);
      expect(() => service.listar(), throwsA(isA<AddonsApiException>()));
    });
  });

  group('AddonsService.obtenerContratos', () {
    test('devuelve lista de contratos cuando el status es 200', () async {
      final client = _FakeApiClient({
        'GET /api/v1/addons/contratos': _ok({'contratos': _fixtureContratos()}),
      });
      final service = AddonsService(client);
      final contratos = await service.obtenerContratos();
      expect(contratos, hasLength(2));
      expect(contratos.first.id, 'doc_uso_app');
      expect(contratos.first.version, 3);
    });

    test('lanza AddonsApiException en error', () async {
      final client = _FakeApiClient({
        'GET /api/v1/addons/contratos': _status(500),
      });
      final service = AddonsService(client);
      expect(() => service.obtenerContratos(), throwsA(isA<AddonsApiException>()));
    });
  });

  group('AddonsService.comprar', () {
    test('devuelve resultado exitoso cuando el status es 200', () async {
      final client = _FakeApiClient({
        'POST /api/v1/addons/addon_mercado/comprar': _ok({'ok': true, 'mensaje': 'Compra exitosa'}),
      });
      final service = AddonsService(client);
      final resultado = await service.comprar('addon_mercado', 'cuenta_corriente');
      expect(resultado.ok, isTrue);
      expect(resultado.mensaje, 'Compra exitosa');
    });

    test('lanza AddonCompraException en 402 (saldo insuficiente)', () async {
      final client = _FakeApiClient({
        'POST /api/v1/addons/addon_mercado/comprar': _status(
          402,
          body: '{"error":"saldo_insuficiente","message":"No tenés saldo suficiente"}',
        ),
      });
      final service = AddonsService(client);
      expect(
        () => service.comprar('addon_mercado', 'cuenta_corriente'),
        throwsA(isA<AddonCompraException>()),
      );
    });

    test('lanza AddonCompraException en 409 (ya contratado)', () async {
      final client = _FakeApiClient({
        'POST /api/v1/addons/addon_mercado/comprar': _status(
          409,
          body: '{"error":"ya_contratado","message":"Este add-on ya está contratado"}',
        ),
      });
      final service = AddonsService(client);
      expect(
        () => service.comprar('addon_mercado', 'cuenta_corriente'),
        throwsA(isA<AddonCompraException>()),
      );
    });

    test('lanza AddonCompraException en 400 (contratos no aceptados)', () async {
      final client = _FakeApiClient({
        'POST /api/v1/addons/addon_mercado/comprar': _status(
          400,
          body: '{"error":"contratos_pendientes","message":"Debés aceptar los contratos"}',
        ),
      });
      final service = AddonsService(client);
      expect(
        () => service.comprar('addon_mercado', 'cuenta_corriente'),
        throwsA(isA<AddonCompraException>()),
      );
    });
  });

  group('AddonsService.aceptarContratos', () {
    test('completa sin error cuando el status es 200', () async {
      final client = _FakeApiClient({
        'POST /api/v1/addons/contratos/aceptar': _ok({'ok': true}),
      });
      final service = AddonsService(client);
      await service.aceptarContratos();
      expect(client.llamadas, contains('POST /api/v1/addons/contratos/aceptar'));
    });

    test('completa sin error cuando el status es 204', () async {
      final client = _FakeApiClient({
        'POST /api/v1/addons/contratos/aceptar': _status(204),
      });
      final service = AddonsService(client);
      await service.aceptarContratos();
    });

    test('lanza AddonsApiException en error', () async {
      final client = _FakeApiClient({
        'POST /api/v1/addons/contratos/aceptar': _status(500),
      });
      final service = AddonsService(client);
      expect(() => service.aceptarContratos(), throwsA(isA<AddonsApiException>()));
    });
  });
}
