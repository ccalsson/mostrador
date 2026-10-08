import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/ids.dart';
import '../core/network/api_client.dart';
import '../models/suscripcion.dart';

/// Endpoints A.1–A.4 del contrato de suscripción (Parte A de
/// `app/docs/suscripcion-legal-propuesta.md`). Sólo el rol dueño los consume;
/// el backend rechaza al resto con 403 `rol_no_permitido`.
class SuscripcionService {
  SuscripcionService(this._client);

  final ApiClient _client;

  /// A.1 — resumen de suscripción, add-ons, contrato vigente y pendiente.
  /// 404 (`sin_suscripcion`) lo trata la UI como "no disponible todavía".
  Future<SuscripcionResumen> obtenerResumen() async {
    final data = await _client.get('/api/v1/suscripcion') as Map<String, dynamic>;
    return SuscripcionResumen.fromJson(
        (data['data'] as Map).cast<String, dynamic>());
  }

  /// A.2 — documento del contrato (vigente o histórica con `version`).
  Future<ContratoDocumento> obtenerContrato({int? version}) async {
    final data = await _client.get(
      '/api/v1/suscripcion/contrato',
      query: version == null ? null : {'version': '$version'},
    ) as Map<String, dynamic>;
    return ContratoDocumento.fromJson(
        (data['data'] as Map).cast<String, dynamic>());
  }

  /// A.3 — historial inmutable de versiones y aceptaciones.
  Future<List<EntradaHistorial>> obtenerHistorial() async {
    final data =
        await _client.get('/api/v1/suscripcion/contrato/historial')
            as Map<String, dynamic>;
    final entradas = (data['data'] as Map)['entradas'] as List? ?? const [];
    return entradas
        .whereType<Map>()
        .map((e) => EntradaHistorial.fromJson(e.cast<String, dynamic>()))
        .toList();
  }

  /// A.4 — aceptación online-only con clave de idempotencia por intento. El
  /// backend deduplica por (actor, documento, versión) y valida vigencia y
  /// hash; en 409 la UI refresca y muestra la nueva pendiente.
  Future<void> aceptarContrato({
    required String documentoId,
    required int version,
    required String hash,
  }) async {
    await _client.post(
      '/api/v1/suscripcion/contrato/aceptar',
      body: {'documentoId': documentoId, 'version': version, 'hash': hash},
      extraHeaders: {'Idempotency-Key': generarUuidV4()},
    );
  }
}

final suscripcionServiceProvider = Provider<SuscripcionService>(
  (ref) => SuscripcionService(ref.watch(apiClientProvider)),
);

final suscripcionProvider = FutureProvider<SuscripcionResumen>(
  (ref) => ref.watch(suscripcionServiceProvider).obtenerResumen(),
);
