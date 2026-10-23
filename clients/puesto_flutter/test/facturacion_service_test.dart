import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/facturacion.dart';
import 'package:puesto_flutter/services/facturacion_service.dart';

Map<String, dynamic> _configPayload() => {
      'cuit': '20123456789',
      'razonSocial': 'Mostrador SAS',
      'domicilio': 'Calle 123',
      'condicion': 'ri',
      'puntoVenta': 1,
      'inicioActividades': '2020-01-01',
      'iibb': '901-123456-7',
      'alicuota': 21.0,
      'ambiente': 'homo',
      'certCargado': true,
      'keyCargada': true,
      'lista': true,
      'habilitada': true,
    };

Map<String, dynamic> _facturaPayload() => {
      'id': 'fac_1',
      'cobroId': 'cob_1',
      'origenId': null,
      'cbteTipo': 11,
      'nombre': 'Factura C',
      'puntoVenta': 1,
      'numero': 42,
      'fecha': '2026-10-22',
      'docTipo': 99,
      'docNro': null,
      'receptorNombre': null,
      'receptorCondicion': 'consumidor_final',
      'emisorRazon': 'Mostrador SAS',
      'emisorCuit': '20123456789',
      'emisorDomicilio': 'Calle 123',
      'emisorCondicion': 'ri',
      'emisorIibb': '901-123456-7',
      'emisorInicio': '2020-01-01',
      'ambiente': 'homo',
      'neto': 8264.46,
      'iva': 1735.54,
      'total': 10000.0,
      'alicuota': 21.0,
      'cae': '75012345678901',
      'caeVto': '20261102',
      'estado': 'autorizada',
      'error': null,
      'lineas': [
        {
          'nombre': 'Tomate',
          'cantidad': 5,
          'unidad': 'kg',
          'neto': 4132.23,
          'iva': 867.77,
          'total': 5000.0,
        },
        {
          'nombre': 'Lechuga',
          'cantidad': 10,
          'unidad': 'unidad',
          'neto': 4132.23,
          'iva': 867.77,
          'total': 5000.0,
        },
      ],
      'qr': 'data:image/png;base64,abc123',
      'qrUrl': 'https://www.afip.gob.ar/fe/qr/?p=abc',
    };

FacturacionService _servicio(http.Client client) =>
    FacturacionService(ApiClient(
      baseUrl: 'http://test',
      httpClient: client,
      tokenProvider: () async => 'tok-1',
    ));

void main() {
  test('AfipConfig.fromJson parsea el payload del backend', () {
    final config = AfipConfig.fromJson(_configPayload());
    expect(config.cuit, '20123456789');
    expect(config.razonSocial, 'Mostrador SAS');
    expect(config.condicion, 'ri');
    expect(config.condicionLabel, 'IVA Responsable Inscripto');
    expect(config.puntoVenta, 1);
    expect(config.alicuota, 21.0);
    expect(config.certCargado, true);
    expect(config.keyCargada, true);
    expect(config.lista, true);
    expect(config.habilitada, true);
    expect(config.ambienteLabel, 'Homologación');
  });

  test('Factura.fromJson parsea factura con líneas y QR', () {
    final f = Factura.fromJson(_facturaPayload());
    expect(f.id, 'fac_1');
    expect(f.nombre, 'Factura C');
    expect(f.cbteTipo, 11);
    expect(f.esNotaCredito, false);
    expect(f.numeroFiscal, '0001-00000042');
    expect(f.total, 10000.0);
    expect(f.lineas.length, 2);
    expect(f.lineas[0].nombre, 'Tomate');
    expect(f.cae, '75012345678901');
    expect(f.qr, startsWith('data:image'));
  });

  test('Factura nota de crédito se detecta por cbteTipo', () {
    final nc = Factura.fromJson({
      ..._facturaPayload(),
      'cbteTipo': 13,
      'nombre': 'Nota de crédito C',
    });
    expect(nc.esNotaCredito, true);
  });

  test('Factura.tipoLabel devuelve el nombre correcto por cbteTipo', () {
    expect(Factura.fromJson({..._facturaPayload(), 'cbteTipo': 1}).tipoLabel, 'Factura A');
    expect(Factura.fromJson({..._facturaPayload(), 'cbteTipo': 3}).tipoLabel, 'Nota de crédito A');
    expect(Factura.fromJson({..._facturaPayload(), 'cbteTipo': 6}).tipoLabel, 'Factura B');
    expect(Factura.fromJson({..._facturaPayload(), 'cbteTipo': 8}).tipoLabel, 'Nota de crédito B');
    expect(Factura.fromJson({..._facturaPayload(), 'cbteTipo': 11}).tipoLabel, 'Factura C');
    expect(Factura.fromJson({..._facturaPayload(), 'cbteTipo': 13}).tipoLabel, 'Nota de crédito C');
    expect(Factura.fromJson({..._facturaPayload(), 'cbteTipo': 99}).tipoLabel, 'Comprobante 99');
  });

  test('FacturacionPanel.fromJson parsea config + pendientes + emitidas', () {
    final panel = FacturacionPanel.fromJson({
      'config': _configPayload(),
      'pendientes': [
        {
          'id': 'cob_99',
          'monto': 5000.0,
          'createdAt': '2026-10-22 12:00:00',
          'cliente': 'Juan',
          'numero': 1234,
          'error': null,
        },
      ],
      'emitidas': [_facturaPayload()],
    });
    expect(panel.config.habilitada, true);
    expect(panel.pendientes.length, 1);
    expect(panel.pendientes[0].cliente, 'Juan');
    expect(panel.emitidas.length, 1);
    expect(panel.emitidas[0].numeroFiscal, '0001-00000042');
  });

  test('listar() llama GET /api/v1/afip/facturacion con Bearer', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': {
            'config': _configPayload(),
            'pendientes': [],
            'emitidas': [],
          }
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final panel = await servicio.listar();
    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/afip/facturacion');
    expect(visto.headers['authorization'], 'Bearer tok-1');
    expect(panel.config.cuit, '20123456789');
  });

  test('emitirFactura() POST y parsea la factura resultante', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({'data': _facturaPayload()}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final factura = await servicio.emitirFactura('cob_1');
    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/afip/facturas');
    final body = jsonDecode(visto.body) as Map<String, dynamic>;
    expect(body['cobroId'], 'cob_1');
    expect(factura.estado, 'autorizada');
  });

  test('emitirNotaCredito() POST con facturaId y motivo opcional', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({'data': _facturaPayload()}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final nc = await servicio.emitirNotaCredito('fac_1', motivo: 'Devolución');
    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/afip/notas-credito');
    final body = jsonDecode(visto.body) as Map<String, dynamic>;
    expect(body['facturaId'], 'fac_1');
    expect(body['motivo'], 'Devolución');
    expect(nc.estado, 'autorizada');
  });

  test('emitirNotaCredito() sin motivo no incluye el campo', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({'data': _facturaPayload()}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    await servicio.emitirNotaCredito('fac_1');
    final body = jsonDecode(visto.body) as Map<String, dynamic>;
    expect(body.containsKey('motivo'), false);
  });

  test('getFactura() llama GET /api/v1/afip/facturas/{id}', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({'data': _facturaPayload()}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final factura = await servicio.getFactura('fac_1');
    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/afip/facturas/fac_1');
    expect(factura.id, 'fac_1');
    expect(factura.cae, '75012345678901');
  });

  test('AfipProbarResultado parsea respuesta de probar conexion', () {
    final r = AfipProbarResultado.fromJson({
      'app': 'th-CUIT-20123456789',
      'db': null,
      'auth': 'wsaa-homo',
      'login': true,
    });
    expect(r.login, true);
    expect(r.app, contains('CUIT'));
    expect(r.db, isNull);
  });

  test('CobroPendiente tolera campos nulos', () {
    final p = CobroPendiente.fromJson({
      'id': 'cob_x',
      'monto': 100,
      'createdAt': '2026-10-22',
      'cliente': '',
      'numero': null,
      'error': 'timeout',
    });
    expect(p.numero, isNull);
    expect(p.error, 'timeout');
  });
}
