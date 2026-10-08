import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/suscripcion.dart';
import 'package:puesto_flutter/services/suscripcion_service.dart';

SuscripcionService _servicio(MockClient mock) => SuscripcionService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-dueno',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

/// Forma exacta de A.1 según app/docs/suscripcion-legal-propuesta.md.
const _resumenA1 = {
  'data': {
    'suscripcion': {
      'plan': {'codigo': 'crecimiento', 'nombre': 'Crecimiento'},
      'estado': 'activa',
      'inicio': '2026-01-15T00:00:00Z',
      'proximaRenovacion': '2026-11-15T00:00:00Z',
    },
    'addons': [
      {
        'codigo': 'mercado_al_toque',
        'nombre': 'Mercado al Toque',
        'activo': true,
        'detalle': 'Canal de venta',
      },
    ],
    'sucursalesContratadas': 1,
    'mercadoAlToqueContratado': true,
    'precioVigente': {'moneda': 'ARS', 'monto': 25000, 'periodo': 'mes'},
    'condicionesComerciales': {
      'resumen': 'Facturación mensual',
      'actualizado': '2026-09-01',
    },
    'contratoVigente': {
      'documentoId': 'contrato-marco',
      'version': 3,
      'hash': 'sha256:abc123',
      'estado': 'vigente',
      'aceptadoPorMi': true,
      'fechaAceptacion': '2026-09-20T15:30:00Z',
    },
    'pendiente': {
      'hayPendiente': true,
      'documentoId': 'contrato-marco',
      'version': 4,
      'hash': 'sha256:def456',
    },
  },
};

void main() {
  test('A.1 obtenerResumen: GET /suscripcion y parseo completo', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(jsonEncode(_resumenA1), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }));

    final resumen = await servicio.obtenerResumen();

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/suscripcion');
    expect(visto.headers['authorization'], 'Bearer tok-dueno');
    expect(resumen.plan.codigo, 'crecimiento');
    expect(resumen.plan.nombre, 'Crecimiento');
    expect(resumen.estado, 'activa');
    expect(resumen.proximaRenovacion, '2026-11-15T00:00:00Z');
    expect(resumen.addons.single.codigo, 'mercado_al_toque');
    expect(resumen.addons.single.activo, true);
    expect(resumen.sucursalesContratadas, 1);
    expect(resumen.mercadoAlToqueContratado, true);
    expect(resumen.precioVigente!.moneda, 'ARS');
    expect(resumen.precioVigente!.monto, 25000);
    expect(resumen.precioVigente!.periodo, 'mes');
    expect(resumen.condicionesComerciales!.resumen, 'Facturación mensual');
    expect(resumen.contratoVigente!.version, 3);
    expect(resumen.contratoVigente!.aceptadoPorMi, true);
    // La aceptación envía exactamente lo que el backend entregó.
    expect(resumen.pendiente.aceptable, true);
    expect(resumen.pendiente.documentoId, 'contrato-marco');
    expect(resumen.pendiente.version, 4);
    expect(resumen.pendiente.hash, 'sha256:def456');
  });

  test('A.1 tolera respuesta mínima sin pendiente ni contrato', () {
    final resumen = SuscripcionResumen.fromJson({
      'suscripcion': {
        'plan': {'codigo': 'base', 'nombre': 'Base'},
        'estado': 'prueba',
      },
      'addons': <Object>[],
    });
    expect(resumen.estado, 'prueba');
    expect(resumen.addons, isEmpty);
    expect(resumen.contratoVigente, isNull);
    expect(resumen.pendiente.hayPendiente, false);
    expect(resumen.pendiente.aceptable, false);
  });

  test('A.2 obtenerContrato: query version sólo para histórica', () async {
    final paths = <String>[];
    final servicio = _servicio(MockClient((request) async {
      paths.add('${request.url.path}?${request.url.query}');
      return http.Response(
        jsonEncode({
          'data': {
            'documentoId': 'contrato-marco',
            'version': 4,
            'hash': 'sha256:def456',
            'estado': 'vigente',
            'titulo': 'Contrato marco de servicios',
            'fechaVigencia': '2026-10-01',
            'contenido': {'formato': 'texto', 'valor': 'Cláusulas…'},
            'anexos': [
              {
                'documentoId': 'anexo-mercado',
                'titulo': 'Anexo Mercado al Toque',
                'version': 2,
                'hash': 'sha256:aaa',
                'contenido': {
                  'formato': 'pdf_url',
                  'valor': 'https://cdn/anexo.pdf',
                },
              },
            ],
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final vigente = await servicio.obtenerContrato();
    final historica = await servicio.obtenerContrato(version: 3);

    expect(paths[0], '/api/v1/suscripcion/contrato?');
    expect(paths[1], '/api/v1/suscripcion/contrato?version=3');
    expect(vigente.version, 4);
    expect(vigente.contenido.formato, 'texto');
    expect(vigente.contenido.esPdfUrl, false);
    final anexo = vigente.anexos.single;
    expect(anexo.titulo, 'Anexo Mercado al Toque');
    expect(anexo.contenido.esPdfUrl, true);
    expect(historica.version, 4);
  });

  test('A.3 obtenerHistorial: entradas con aceptación', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': {
            'entradas': [
              {
                'documentoId': 'contrato-marco',
                'version': 3,
                'hash': 'sha256:abc123',
                'tipo': 'contrato',
                'estado': 'reemplazada',
                'fechaDesde': '2026-05-01',
                'fechaHasta': '2026-09-30',
                'aceptacion': {
                  'fecha': '2026-05-02T12:00:00Z',
                  'aceptadoPor': 'Juan Román',
                },
              },
            ],
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final entradas = await servicio.obtenerHistorial();

    expect(visto.url.path, '/api/v1/suscripcion/contrato/historial');
    final entrada = entradas.single;
    expect(entrada.tipo, 'contrato');
    expect(entrada.estado, 'reemplazada');
    expect(entrada.fechaHasta, '2026-09-30');
    expect(entrada.aceptacion!.aceptadoPor, 'Juan Román');
  });

  test('A.4 aceptarContrato: POST con Idempotency-Key y cuerpo exacto',
      () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': {
            'aceptacionId': 'uuid',
            'documentoId': 'contrato-marco',
            'version': 4,
            'fecha': '2026-10-07T15:30:00Z',
            'contratoVigente': {'aceptadoPorMi': true},
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    await servicio.aceptarContrato(
      documentoId: 'contrato-marco',
      version: 4,
      hash: 'sha256:def456',
    );

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/suscripcion/contrato/aceptar');
    expect(visto.headers['idempotency-key'], isNotEmpty);
    expect(jsonDecode(visto.body), {
      'documentoId': 'contrato-marco',
      'version': 4,
      'hash': 'sha256:def456',
    });
  });

  test('404 sin_suscripcion mapea a NotFoundException (estado honesto)',
      () async {
    final servicio = _servicio(MockClient((request) async {
      return http.Response(
        jsonEncode({'error': 'sin_suscripcion', 'message': 'Sin suscripción.'}),
        404,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    await expectLater(
      servicio.obtenerResumen(),
      throwsA(isA<NotFoundException>()),
    );
  });

  test('409 en aceptar mapea a ConflictException (version_obsoleta)',
      () async {
    final servicio = _servicio(MockClient((request) async {
      return http.Response(
        jsonEncode({'error': 'version_obsoleta', 'message': 'Obsoleta.'}),
        409,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    await expectLater(
      servicio.aceptarContrato(
        documentoId: 'contrato-marco',
        version: 4,
        hash: 'sha256:def456',
      ),
      throwsA(isA<ConflictException>()),
    );
  });
}
