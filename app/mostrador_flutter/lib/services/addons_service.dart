import '../core/network/api_client.dart';
import '../models/addon.dart';

/// Servicio para consumir /api/v1/addons/* — catálogo, compra y contratos.
///
/// El backend valida el rol (solo admin) y los contratos legales.
class AddonsService {
  AddonsService(this._client);
  final ApiClient _client;

  static const _basePath = '/api/v1/addons';

  /// Lista los add-ons disponibles para comprar.
  Future<List<Addon>> listar() async {
    final res = await _client.get(_basePath);
    if (res.statusCode != 200) {
      throw AddonsApiException(res.statusCode, res.body);
    }
    final data = res.json;
    return (data['addons'] as List<dynamic>? ?? data['data'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>()
        .map(Addon.fromJson)
        .toList();
  }

  /// Obtiene los documentos legales pendientes de aceptación.
  Future<List<AddonContrato>> obtenerContratos() async {
    final res = await _client.get('$_basePath/contratos');
    if (res.statusCode != 200) {
      throw AddonsApiException(res.statusCode, res.body);
    }
    final data = res.json;
    return (data['contratos'] as List<dynamic>? ?? data['data'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>()
        .map(AddonContrato.fromJson)
        .toList();
  }

  /// Acepta los contratos legales requeridos para la compra.
  Future<void> aceptarContratos() async {
    final res = await _client.post('$_basePath/contratos/aceptar');
    if (res.statusCode != 200 && res.statusCode != 201 && res.statusCode != 204) {
      throw AddonsApiException(res.statusCode, res.body);
    }
  }

  /// Compra un add-on con la forma de pago indicada.
  ///
  /// [formaPago] debe ser 'transferencia' o 'cuenta_corriente'.
  /// El backend valida que los contratos estén aceptados y que haya saldo
  /// suficiente si la forma de pago es cuenta corriente.
  Future<AddonCompraResultado> comprar(
    String addonId,
    String formaPago,
  ) async {
    final res = await _client.post(
      '$_basePath/$addonId/comprar',
      body: {'formaPago': formaPago},
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      return AddonCompraResultado.fromJson(res.json);
    }
    // Extraer mensaje del backend si existe.
    String mensaje = '';
    try {
      mensaje = res.json['message'] as String? ?? res.json['error'] as String? ?? '';
    } catch (_) {}
    throw AddonCompraException(res.statusCode, mensaje);
  }
}
