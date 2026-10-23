import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/facturacion.dart';

class FacturacionService {
  FacturacionService(this._client);

  final ApiClient _client;

  Future<AfipConfig> getConfig() async {
    final data =
        await _client.get('/api/v1/afip/config') as Map<String, dynamic>;
    return AfipConfig.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<AfipConfig> guardarConfig({
    required String cuit,
    required String razonSocial,
    required String domicilio,
    required String condicion,
    required int puntoVenta,
    required String inicioActividades,
    required String iibb,
    required double alicuota,
    required String ambiente,
    String? certPem,
    String? keyPem,
  }) async {
    final body = <String, dynamic>{
      'cuit': cuit,
      'razonSocial': razonSocial,
      'domicilio': domicilio,
      'condicion': condicion,
      'puntoVenta': puntoVenta,
      'inicioActividades': inicioActividades,
      'iibb': iibb,
      'alicuota': alicuota,
      'ambiente': ambiente,
    };
    if (certPem != null) body['certPem'] = certPem;
    if (keyPem != null) body['keyPem'] = keyPem;
    final data = await _client.post('/api/v1/afip/config', body: body)
        as Map<String, dynamic>;
    return AfipConfig.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<AfipProbarResultado> probarConexion() async {
    final data =
        await _client.post('/api/v1/afip/probar') as Map<String, dynamic>;
    return AfipProbarResultado.fromJson(
        data['data'] as Map<String, dynamic>);
  }

  Future<AfipConfig> setHabilitada(bool habilitada) async {
    final data = await _client.post('/api/v1/afip/habilitada',
        body: {'habilitada': habilitada}) as Map<String, dynamic>;
    return AfipConfig.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<FacturacionPanel> listar() async {
    final data = await _client.get('/api/v1/afip/facturacion')
        as Map<String, dynamic>;
    return FacturacionPanel.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<Factura> emitirFactura(String cobroId) async {
    final data = await _client
            .post('/api/v1/afip/facturas', body: {'cobroId': cobroId})
        as Map<String, dynamic>;
    return Factura.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<Factura> emitirNotaCredito(String facturaId, {String? motivo}) async {
    final body = <String, dynamic>{'facturaId': facturaId};
    if (motivo != null && motivo.isNotEmpty) body['motivo'] = motivo;
    final data = await _client.post('/api/v1/afip/notas-credito',
        body: body) as Map<String, dynamic>;
    return Factura.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<Factura> getFactura(String id) async {
    final data = await _client.get('/api/v1/afip/facturas/$id')
        as Map<String, dynamic>;
    return Factura.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final facturacionServiceProvider = Provider<FacturacionService>(
  (ref) => FacturacionService(ref.watch(apiClientProvider)),
);

final facturacionPanelProvider = FutureProvider<FacturacionPanel>(
  (ref) => ref.watch(facturacionServiceProvider).listar(),
);

final afipConfigProvider = FutureProvider<AfipConfig>(
  (ref) => ref.watch(facturacionServiceProvider).getConfig(),
);

final facturaProvider = FutureProvider.family<Factura, String>(
  (ref, id) => ref.watch(facturacionServiceProvider).getFactura(id),
);
