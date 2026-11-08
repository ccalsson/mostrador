import 'package:flutter_test/flutter_test.dart';

import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/canal_mercado.dart';
import 'package:puesto_flutter/services/canal_mercado_service.dart';

class _FakeClient extends Fake implements ApiClient {
  Map<String, dynamic>? lastPostBody;
  CanalMercado respuesta = const CanalMercado(
    activo: false,
    presencia: true,
    tier: 'presencia',
    cuentaCorriente: false,
    packs: 1,
    avisos: 2,
    comision: 5.0,
  );

  @override
  Future<dynamic> get(String path, {Map<String, String>? query}) async {
    return <String, dynamic>{
      'activo': respuesta.activo,
      'presencia': respuesta.presencia,
      'tier': respuesta.tier,
      'cuentaCorriente': respuesta.cuentaCorriente,
      'packs': respuesta.packs,
      'avisos': respuesta.avisos,
      'comision': respuesta.comision,
    };
  }

  @override
  Future<dynamic> post(String path,
      {Object? body, Map<String, String>? extraHeaders}) async {
    lastPostBody = body as Map<String, dynamic>?;
    respuesta = CanalMercado(
      activo: lastPostBody?['activo'] == true,
      presencia: respuesta.presencia,
      tier: respuesta.tier,
      cuentaCorriente: respuesta.cuentaCorriente,
      packs: respuesta.packs,
      avisos: respuesta.avisos,
      comision: respuesta.comision,
    );
    return <String, dynamic>{'activo': respuesta.activo};
  }
}

void main() {
  group('CanalMercado', () {
    test('fromJson mapea campos correctamente', () {
      final canal = CanalMercado.fromJson({
        'activo': true,
        'presencia': true,
        'tier': 'pro',
        'cuentaCorriente': true,
        'packs': 3,
        'avisos': 5,
        'comision': 7.5,
      });
      expect(canal.activo, true);
      expect(canal.presencia, true);
      expect(canal.tier, 'pro');
      expect(canal.cuentaCorriente, true);
      expect(canal.packs, 3);
      expect(canal.avisos, 5);
      expect(canal.comision, 7.5);
    });

    test('fromJson usa defaults para campos ausentes', () {
      final canal = CanalMercado.fromJson({});
      expect(canal.activo, false);
      expect(canal.presencia, false);
      expect(canal.tier, '');
      expect(canal.cuentaCorriente, false);
      expect(canal.packs, 0);
      expect(canal.avisos, 0);
      expect(canal.comision, 0);
    });
  });

  group('CanalMercadoService', () {
    test('obtener lee GET /api/v1/canal-mercado', () async {
      final fake = _FakeClient();
      final service = CanalMercadoService(fake);
      final canal = await service.obtener();
      expect(canal.activo, false);
      expect(canal.presencia, true);
      expect(canal.tier, 'presencia');
    });

    test('guardar envia POST con activo booleano', () async {
      final fake = _FakeClient();
      final service = CanalMercadoService(fake);
      await service.guardar(true);
      expect(fake.lastPostBody, {'activo': true});
    });

    test('guardar(false) desactiva el canal', () async {
      final fake = _FakeClient();
      fake.respuesta = const CanalMercado(
        activo: true,
        presencia: true,
        tier: 'pro',
        cuentaCorriente: false,
        packs: 1,
        avisos: 0,
        comision: 5.0,
      );
      final service = CanalMercadoService(fake);
      await service.guardar(false);
      expect(fake.lastPostBody, {'activo': false});
    });
  });
}
