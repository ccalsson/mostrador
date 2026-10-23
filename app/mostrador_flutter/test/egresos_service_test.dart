import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mostrador_flutter/core/network/api_client.dart';
import 'package:mostrador_flutter/models/egreso.dart';
import 'package:mostrador_flutter/services/egresos_service.dart';

/// ApiClient falso para tests — no hace HTTP real.
class FakeApiClient implements ApiClient {
  FakeApiClient({this.listResponse, this.statusCode = 200});

  int statusCode;
  Object? listResponse;
  String? lastPath;
  String? lastMethod;
  Object? lastBody;

  @override
  String? get sessionToken => null;

  @override
  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    lastPath = path;
    lastMethod = 'GET';
    return _respond(listResponse ?? {'items': [], 'efectivo': 0});
  }

  @override
  Future<ApiResponse> post(String path, {Object? body, Map<String, String>? headers}) async {
    lastPath = path;
    lastMethod = 'POST';
    lastBody = body;
    return _respond({'ok': true});
  }

  @override
  Future<ApiResponse> put(String path, {Object? body, Map<String, String>? headers}) async {
    lastPath = path;
    lastMethod = 'PUT';
    lastBody = body;
    return _respond({'ok': true});
  }

  @override
  Future<ApiResponse> delete(String path, {Map<String, String>? headers}) async {
    lastPath = path;
    lastMethod = 'DELETE';
    return _respond({'ok': true});
  }

  ApiResponse _respond(Object data) {
    final body = jsonEncode(data);
    return _FakeResponse(statusCode, body);
  }
}

class _FakeResponse implements ApiResponse {
  _FakeResponse(this.statusCode, this.body);
  @override
  final int statusCode;
  @override
  final String body;
  @override
  Map<String, dynamic> get json => jsonDecode(body) as Map<String, dynamic>;
  @override
  List<dynamic> get jsonList => jsonDecode(body) as List<dynamic>;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('Egreso model', () {
    test('categoriaValida acepta las 7 categorías', () {
      expect(Egreso.categoriaValida('alquiler'), isTrue);
      expect(Egreso.categoriaValida('combustible'), isTrue);
      expect(Egreso.categoriaValida('servicios'), isTrue);
      expect(Egreso.categoriaValida('proveedores'), isTrue);
      expect(Egreso.categoriaValida('mercaderia'), isTrue);
      expect(Egreso.categoriaValida('sueldos'), isTrue);
      expect(Egreso.categoriaValida('otros'), isTrue);
    });

    test('categoriaValida rechaza categorías inválidas', () {
      expect(Egreso.categoriaValida('invalida'), isFalse);
      expect(Egreso.categoriaValida(''), isFalse);
      expect(Egreso.categoriaValida('ALQUILER'), isFalse);
    });

    test('fromJson parsea correctamente', () {
      final json = {
        'id': 'egr_123',
        'categoria': 'servicios',
        'concepto': 'Luz',
        'monto': 1500.50,
        'medio': 'efectivo',
        'createdAt': '2026-10-24T10:00:00Z',
      };
      final egreso = Egreso.fromJson(json);
      expect(egreso.id, 'egr_123');
      expect(egreso.categoria, 'servicios');
      expect(egreso.concepto, 'Luz');
      expect(egreso.monto, 1500.50);
      expect(egreso.medio, MedioPago.efectivo);
      expect(egreso.afectaEfectivo, isTrue);
    });

    test('fromJson con medio transferencia no afecta efectivo', () {
      final egreso = Egreso.fromJson({
        'id': 'egr_456',
        'categoria': 'proveedores',
        'concepto': 'Proveedor X',
        'monto': 5000,
        'medio': 'transferencia',
        'createdAt': '2026-10-24T10:00:00Z',
      });
      expect(egreso.medio, MedioPago.transferencia);
      expect(egreso.afectaEfectivo, isFalse);
    });

    test('toCreateJson no incluye id ni createdAt', () {
      final egreso = Egreso(
        id: 'egr_123',
        categoria: 'alquiler',
        concepto: 'Alquiler mes',
        monto: 50000,
        medio: MedioPago.transferencia,
        createdAt: '2026-10-24T10:00:00Z',
      );
      final json = egreso.toCreateJson();
      expect(json.containsKey('id'), isFalse);
      expect(json.containsKey('createdAt'), isFalse);
      expect(json['categoria'], 'alquiler');
      expect(json['monto'], 50000);
    });

    test('copyWith crea copia con cambios', () {
      final original = Egreso(
        id: 'egr_1',
        categoria: 'otros',
        concepto: 'Varios',
        monto: 100,
        medio: MedioPago.efectivo,
        createdAt: '',
      );
      final copia = original.copyWith(monto: 200, categoria: 'servicios');
      expect(copia.monto, 200);
      expect(copia.categoria, 'servicios');
      expect(copia.id, 'egr_1'); // sin cambios
    });

    test('medioPagoFromString maneja valores conocidos y null', () {
      expect(medioPagoFromString('efectivo'), MedioPago.efectivo);
      expect(medioPagoFromString('transferencia'), MedioPago.transferencia);
      expect(medioPagoFromString('otro'), MedioPago.otro);
      expect(medioPagoFromString(null), MedioPago.efectivo);
      expect(medioPagoFromString('desconocido'), MedioPago.efectivo);
    });

    test('categoriasEgreso tiene exactamente 7 entradas', () {
      expect(categoriasEgreso.length, 7);
    });
  });

  group('EgresosService', () {
    test('listar llama a GET /api/v1/egresos', () async {
      final fake = FakeApiClient(listResponse: {
        'items': [
          {
            'id': 'egr_1',
            'categoria': 'servicios',
            'concepto': 'Internet',
            'monto': 8000,
            'medio': 'efectivo',
            'createdAt': '2026-10-24T10:00:00Z',
          }
        ],
        'efectivo': 8000,
      });
      final service = EgresosService(fake);

      final turno = await service.listar();

      expect(fake.lastPath, '/api/v1/egresos');
      expect(fake.lastMethod, 'GET');
      expect(turno.items.length, 1);
      expect(turno.items[0].concepto, 'Internet');
      expect(turno.totalEfectivo, 8000);
    });

    test('crear envía POST con body correcto', () async {
      final fake = FakeApiClient();
      final service = EgresosService(fake);
      final egreso = Egreso(
        id: '',
        categoria: 'combustible',
        concepto: 'Nafta',
        monto: 25000,
        medio: MedioPago.efectivo,
        createdAt: '',
      );

      await service.crear(egreso);

      expect(fake.lastPath, '/api/v1/egresos');
      expect(fake.lastMethod, 'POST');
      final body = fake.lastBody as Map<String, dynamic>;
      expect(body['categoria'], 'combustible');
      expect(body['monto'], 25000);
    });

    test('crear rechaza categoría inválida', () async {
      final fake = FakeApiClient();
      final service = EgresosService(fake);
      final egreso = Egreso(
        id: '',
        categoria: 'invalida',
        concepto: 'Test',
        monto: 100,
        medio: MedioPago.efectivo,
        createdAt: '',
      );

      expect(() => service.crear(egreso), throwsA(isA<EgresosException>()));
    });

    test('crear rechaza concepto vacío', () async {
      final fake = FakeApiClient();
      final service = EgresosService(fake);
      final egreso = Egreso(
        id: '',
        categoria: 'servicios',
        concepto: '',
        monto: 100,
        medio: MedioPago.efectivo,
        createdAt: '',
      );

      expect(() => service.crear(egreso), throwsA(isA<EgresosException>()));
    });

    test('crear rechaza monto inválido', () async {
      final fake = FakeApiClient();
      final service = EgresosService(fake);
      final egreso = Egreso(
        id: '',
        categoria: 'servicios',
        concepto: 'Algo',
        monto: 0,
        medio: MedioPago.efectivo,
        createdAt: '',
      );

      expect(() => service.crear(egreso), throwsA(isA<EgresosException>()));
    });

    test('editar envía PUT con id en path', () async {
      final fake = FakeApiClient();
      final service = EgresosService(fake);
      final egreso = Egreso(
        id: 'egr_42',
        categoria: 'alquiler',
        concepto: 'Alquiler',
        monto: 100000,
        medio: MedioPago.transferencia,
        createdAt: '',
      );

      await service.editar(egreso);

      expect(fake.lastPath, '/api/v1/egresos/egr_42');
      expect(fake.lastMethod, 'PUT');
    });

    test('borrar envía DELETE con id en path', () async {
      final fake = FakeApiClient();
      final service = EgresosService(fake);

      await service.borrar('egr_99');

      expect(fake.lastPath, '/api/v1/egresos/egr_99');
      expect(fake.lastMethod, 'DELETE');
    });

    test('listar lanza excepción en error HTTP', () async {
      final fake = FakeApiClient(listResponse: {'error': 'no autorizado'});
      fake.statusCode = 401;
      final service = EgresosService(fake);

      expect(() => service.listar(), throwsA(isA<EgresosException>()));
    });
  });

  group('EgresosTurno', () {
    test('totalGeneral suma todos los montos', () {
      final turno = EgresosTurno(
        items: [
          Egreso(id: '1', categoria: 'servicios', concepto: 'A', monto: 100, medio: MedioPago.efectivo, createdAt: ''),
          Egreso(id: '2', categoria: 'alquiler', concepto: 'B', monto: 500, medio: MedioPago.transferencia, createdAt: ''),
        ],
        totalEfectivo: 100,
      );
      expect(turno.totalGeneral, 600);
    });
  });
}
