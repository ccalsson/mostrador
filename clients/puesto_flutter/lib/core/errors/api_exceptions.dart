/// Errores tipados del cliente HTTP. Las pantallas muestran [message];
/// el código (`statusCode`) permite ramificar sin parsear texto.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

final class UnauthorizedException extends ApiException {
  UnauthorizedException([String? message])
      : super(message ?? 'Sesión expirada o inválida.', statusCode: 401);
}

final class ForbiddenException extends ApiException {
  ForbiddenException([String? message])
      : super(message ?? 'No tenés permiso para esta operación.', statusCode: 403);
}

final class NotFoundException extends ApiException {
  NotFoundException([String? message])
      : super(message ?? 'No se encontró el recurso.', statusCode: 404);
}

final class ConflictException extends ApiException {
  ConflictException([String? message])
      : super(message ?? 'La operación entra en conflicto con el estado actual.', statusCode: 409);
}

final class ValidationException extends ApiException {
  ValidationException([String? message])
      : super(message ?? 'Los datos enviados no son válidos.', statusCode: 422);
}

final class ServerException extends ApiException {
  ServerException([String? message])
      : super(message ?? 'Error interno del servidor.', statusCode: 500);
}

final class NetworkException extends ApiException {
  NetworkException([String? message])
      : super(message ?? 'No se pudo conectar con el servidor.');
}
