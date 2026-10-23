import '../core/network/api_client.dart';
import '../models/egreso.dart';

/// Servicio CRUD para /api/v1/egresos.
class EgresosService {
  EgresosService(this._client);
  final ApiClient _client;

  static const _basePath = '/api/v1/egresos';

  /// Lista los egresos del turno abierto.
  /// El backend filtra por el turno activo del tenant.
  Future<EgresosTurno> listar() async {
    final res = await _client.get(_basePath);
    if (res.statusCode != 200) {
      throw EgresosException(res.statusCode, res.body);
    }
    final json = res.json;
    final items = (json['items'] as List<dynamic>)
        .map((e) => Egreso.fromJson(e as Map<String, dynamic>))
        .toList();
    final efectivo = (json['efectivo'] as num?)?.toDouble() ?? 0.0;
    return EgresosTurno(items: items, totalEfectivo: efectivo);
  }

  /// Crea un nuevo egreso. Valida categoría antes de enviar.
  Future<void> crear(Egreso egreso) async {
    if (!Egreso.categoriaValida(egreso.categoria)) {
      throw EgresosException(400, 'Categoría inválida: ${egreso.categoria}');
    }
    if (egreso.concepto.trim().isEmpty) {
      throw EgresosException(400, 'El concepto no puede estar vacío');
    }
    if (!(egreso.monto > 0) || egreso.monto > 99999999) {
      throw EgresosException(400, 'El monto no es válido');
    }
    final res = await _client.post(_basePath, body: egreso.toCreateJson());
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw EgresosException(res.statusCode, res.body);
    }
  }

  /// Edita un egreso existente.
  Future<void> editar(Egreso egreso) async {
    if (!Egreso.categoriaValida(egreso.categoria)) {
      throw EgresosException(400, 'Categoría inválida: ${egreso.categoria}');
    }
    final res = await _client.put('$_basePath/${egreso.id}', body: egreso.toCreateJson());
    if (res.statusCode != 200 && res.statusCode != 204) {
      throw EgresosException(res.statusCode, res.body);
    }
  }

  /// Borra un egreso por id.
  Future<void> borrar(String id) async {
    final res = await _client.delete('$_basePath/$id');
    if (res.statusCode != 200 && res.statusCode != 204) {
      throw EgresosException(res.statusCode, res.body);
    }
  }
}

/// Resultado de listar egresos del turno.
class EgresosTurno {
  const EgresosTurno({required this.items, required this.totalEfectivo});
  final List<Egreso> items;
  final double totalEfectivo;

  double get totalGeneral => items.fold(0.0, (s, e) => s + e.monto);
}

class EgresosException implements Exception {
  const EgresosException(this.statusCode, this.message);
  final int statusCode;
  final String message;

  @override
  String toString() => 'EgresosException($statusCode): $message';
}
