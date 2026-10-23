import '../core/network/api_client.dart';
import '../models/escritorio.dart';

/// Consume GET /api/v1/escritorio — solo admin.
///
/// El backend valida el rol; si el usuario no es admin devuelve 403.
class EscritorioService {
  EscritorioService(this._client);
  final ApiClient _client;

  Future<EscritorioResumen> obtener() async {
    final response = await _client.get('/api/v1/escritorio');
    if (response.statusCode == 403) {
      throw EscritorioNoAutorizadoException('Se requiere rol de administrador.');
    }
    if (response.statusCode != 200) {
      throw EscritorioApiException(response.statusCode, response.body);
    }
    return EscritorioResumen.fromJson(response.json);
  }
}

class EscritorioApiException implements Exception {
  const EscritorioApiException(this.statusCode, this.body);
  final int statusCode;
  final String body;

  @override
  String toString() => 'EscritorioApiException($statusCode)';
}

class EscritorioNoAutorizadoException implements Exception {
  const EscritorioNoAutorizadoException(this.message);
  final String message;

  @override
  String toString() => 'EscritorioNoAutorizadoException: $message';
}
