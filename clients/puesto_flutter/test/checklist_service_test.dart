import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/checklist.dart';
import 'package:puesto_flutter/services/checklist_service.dart';

http.Response _json(int status, Object? body) => http.Response(
      body == null ? '' : jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

void main() {
  group('ChecklistService', () {
    test('listarItems: GET /api/v1/pedidos/:id/checklist', () async {
      late http.Request visto;
      final service = ChecklistService(
        ApiClient(
          baseUrl: 'http://api.test',
          tokenProvider: () async => 'tok',
          httpClient: MockClient((req) async {
            visto = req;
            return _json(200, {
              'data': [
                {
                  'id': 'chk_1',
                  'pedidoId': 'ped_1',
                  'descripcion': 'Verificar mercaderia',
                  'completado': false,
                  'createdAt': '2026-01-01T00:00:00Z',
                },
                {
                  'id': 'chk_2',
                  'pedidoId': 'ped_1',
                  'descripcion': 'Confirmar direccion',
                  'completado': true,
                  'createdAt': '2026-01-01T00:01:00Z',
                },
              ],
            });
          }),
        ),
      );

      final items = await service.listarItems('ped_1');

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/pedidos/ped_1/checklist');
      expect(items, hasLength(2));
      expect(items[0].id, 'chk_1');
      expect(items[0].descripcion, 'Verificar mercaderia');
      expect(items[0].completado, isFalse);
      expect(items[1].completado, isTrue);
    });

    test('crearItem: POST con descripcion', () async {
      late http.Request visto;
      final service = ChecklistService(
        ApiClient(
          baseUrl: 'http://api.test',
          tokenProvider: () async => 'tok',
          httpClient: MockClient((req) async {
            visto = req;
            return _json(200, {
              'data': {
                'id': 'chk_new',
                'pedidoId': 'ped_1',
                'descripcion': 'Nuevo item',
                'completado': false,
                'createdAt': '2026-01-01T00:00:00Z',
              },
            });
          }),
        ),
      );

      final item = await service.crearItem('ped_1', 'Nuevo item');

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/pedidos/ped_1/checklist');
      expect(jsonDecode(visto.body), {'descripcion': 'Nuevo item'});
      expect(item.id, 'chk_new');
      expect(item.descripcion, 'Nuevo item');
      expect(item.completado, isFalse);
    });

    test('toggleItem: PATCH con completado', () async {
      late http.Request visto;
      final service = ChecklistService(
        ApiClient(
          baseUrl: 'http://api.test',
          tokenProvider: () async => 'tok',
          httpClient: MockClient((req) async {
            visto = req;
            return _json(200, {
              'data': {
                'id': 'chk_1',
                'pedidoId': 'ped_1',
                'descripcion': 'Item',
                'completado': true,
                'createdAt': '2026-01-01T00:00:00Z',
              },
            });
          }),
        ),
      );

      final item = await service.toggleItem('ped_1', 'chk_1', true);

      expect(visto.method, 'PATCH');
      expect(visto.url.path, '/api/v1/pedidos/ped_1/checklist/chk_1');
      expect(jsonDecode(visto.body), {'completado': true});
      expect(item.completado, isTrue);
    });

    test('borrarItem: DELETE', () async {
      late http.Request visto;
      final service = ChecklistService(
        ApiClient(
          baseUrl: 'http://api.test',
          tokenProvider: () async => 'tok',
          httpClient: MockClient((req) async {
            visto = req;
            return _json(200, null);
          }),
        ),
      );

      await service.borrarItem('ped_1', 'chk_1');

      expect(visto.method, 'DELETE');
      expect(visto.url.path, '/api/v1/pedidos/ped_1/checklist/chk_1');
    });

    test('listarTemplates: GET /api/v1/checklist/templates', () async {
      late http.Request visto;
      final service = ChecklistService(
        ApiClient(
          baseUrl: 'http://api.test',
          tokenProvider: () async => 'tok',
          httpClient: MockClient((req) async {
            visto = req;
            return _json(200, {
              'data': [
                {
                  'id': 'cht_1',
                  'nombre': 'Default',
                  'items': ['Verificar', 'Confirmar'],
                  'activo': true,
                  'createdAt': '2026-01-01T00:00:00Z',
                },
              ],
            });
          }),
        ),
      );

      final templates = await service.listarTemplates();

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/checklist/templates');
      expect(templates, hasLength(1));
      expect(templates[0].nombre, 'Default');
      expect(templates[0].items, ['Verificar', 'Confirmar']);
    });

    test('crearTemplate: POST con nombre e items', () async {
      late http.Request visto;
      final service = ChecklistService(
        ApiClient(
          baseUrl: 'http://api.test',
          tokenProvider: () async => 'tok',
          httpClient: MockClient((req) async {
            visto = req;
            return _json(200, {
              'data': {
                'id': 'cht_new',
                'nombre': 'Nueva',
                'items': ['A', 'B'],
                'activo': true,
                'createdAt': '2026-01-01T00:00:00Z',
              },
            });
          }),
        ),
      );

      final t = await service.crearTemplate('Nueva', ['A', 'B']);

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/checklist/templates');
      expect(jsonDecode(visto.body), {'nombre': 'Nueva', 'items': ['A', 'B']});
      expect(t.id, 'cht_new');
      expect(t.items, ['A', 'B']);
    });

    test('listarItems vacio: devuelve lista sin elementos', () async {
      final service = ChecklistService(
        ApiClient(
          baseUrl: 'http://api.test',
          tokenProvider: () async => 'tok',
          httpClient: MockClient((_) async => _json(200, {'data': []})),
        ),
      );

      final items = await service.listarItems('ped_1');
      expect(items, isEmpty);
    });
  });

  group('ChecklistItem model', () {
    test('fromJson: campos obligatorios', () {
      final item = ChecklistItem.fromJson({
        'id': 'chk_1',
        'pedidoId': 'ped_1',
        'descripcion': 'Test',
        'completado': false,
        'createdAt': '2026-01-01',
      });
      expect(item.id, 'chk_1');
      expect(item.pedidoId, 'ped_1');
      expect(item.descripcion, 'Test');
      expect(item.completado, isFalse);
    });

    test('fromJson: campos opcionales con defaults', () {
      final item = ChecklistItem.fromJson({
        'id': 'chk_1',
        'pedidoId': 'ped_1',
      });
      expect(item.descripcion, '');
      expect(item.completado, isFalse);
      expect(item.createdAt, '');
    });
  });

  group('ChecklistTemplate model', () {
    test('fromJson: campos completos', () {
      final t = ChecklistTemplate.fromJson({
        'id': 'cht_1',
        'nombre': 'Default',
        'items': ['A', 'B'],
        'activo': true,
        'createdAt': '2026-01-01',
      });
      expect(t.id, 'cht_1');
      expect(t.nombre, 'Default');
      expect(t.items, ['A', 'B']);
      expect(t.activo, isTrue);
    });

    test('fromJson: items ausente → lista vacía', () {
      final t = ChecklistTemplate.fromJson({
        'id': 'cht_1',
        'nombre': 'X',
      });
      expect(t.items, isEmpty);
    });
  });
}
