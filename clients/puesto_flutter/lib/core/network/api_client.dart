import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../auth/token_store.dart';
import '../config/app_config.dart';
import '../errors/api_exceptions.dart';

/// Cliente HTTP único de la app. Adjunta `Authorization: Bearer`, decodifica
/// JSON, mapea errores a [ApiException] y soporta ETag para GET cacheados.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.tokenProvider,
    http.Client? httpClient,
    this.timeout = AppConfig.requestTimeout,
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final Future<String?> Function() tokenProvider;
  final Duration timeout;
  final http.Client _http;

  /// Caché en memoria de ETag por recurso. La clave incluye el token para que
  /// un cambio de sesión nunca reutilice una respuesta de otro usuario.
  final Map<String, _CachedResponse> _etagCache = {};

  /// Invocado cuando una request con token adjunto recibe 401 (sesión
  /// rechazada). Lo instala [AuthController] para cerrar sesión localmente.
  void Function()? onUnauthorized;
  void Function()? onContextChanged;

  String? _tenantId;
  int _generation = 0;
  bool _closed = false;
  bool _exclusive = false;

  void bindTenant(String tenantId) {
    _checkActive(_generation);
    _tenantId = tenantId;
    _generation++;
    _etagCache.clear();
  }

  void close() {
    if (_closed) return;
    _closed = true;
    _generation++;
    _etagCache.clear();
    onUnauthorized = null;
    onContextChanged = null;
    _http.close();
  }

  void _checkActive(int generation, {bool exclusive = false}) {
    if (_closed || generation != _generation || (_exclusive && !exclusive)) {
      throw ContextChangedException();
    }
  }

  Future<dynamic> postExclusive(
    String path, {
    Object? body,
    Map<String, String>? extraHeaders,
  }) async {
    _checkActive(_generation);
    _exclusive = true;
    _generation++;
    _etagCache.clear();
    try {
      return await _send(
        'POST',
        path,
        body: body,
        extraHeaders: extraHeaders,
        exclusive: true,
      );
    } finally {
      close();
    }
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(
    String path, {
    Object? body,
    Map<String, String>? extraHeaders,
  }) => _send('POST', path, body: body, extraHeaders: extraHeaders);
  
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> patch(String path, {Object? body}) =>
      _send('PATCH', path, body: body);

  Future<dynamic> postMultipart(
    String path, {
    required String fieldName,
    required String fileName,
    required String mimeType,
    required List<int> bytes,
  }) async {
    final generation = _generation;
    final tenantId = _tenantId;
    _checkActive(generation);
    final token = await tokenProvider();
    _checkActive(generation);
    final uri = Uri.parse(baseUrl).replace(path: path);
    final session = path == '/api/v1/session';

    final request = http.MultipartRequest('POST', uri)
      ..headers.addAll({
        'accept': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
        if (tenantId != null && path.startsWith('/api/v1/') && !session)
          'x-mostrador-tenant': tenantId,
      })
      ..files.add(http.MultipartFile.fromBytes(
        fieldName,
        bytes,
        filename: fileName,
        contentType: http.MediaType.parse(mimeType),
      ));

    late final http.StreamedResponse streamedResponse;
    try {
      streamedResponse = await _http.send(request).timeout(timeout);
    } on TimeoutException {
      _checkActive(generation);
      throw NetworkException();
    } on SocketException {
      _checkActive(generation);
      throw NetworkException();
    } on http.ClientException {
      _checkActive(generation);
      throw NetworkException();
    }
    _checkActive(generation);

    final response = await http.Response.fromStream(streamedResponse);
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      final text = utf8.decode(response.bodyBytes);
      try {
        return text.isEmpty ? null : jsonDecode(text);
      } on FormatException {
        throw ApiException('Respuesta inválida del servidor.');
      }
    }

    final errorBody = _tryDecode(response.bodyBytes);
    final message = _extractMessage(errorBody);
    switch (response.statusCode) {
      case 401:
        if (token != null) onUnauthorized?.call();
        throw UnauthorizedException(message);
      case 403:
        throw ForbiddenException(message);
      case 404:
        throw NotFoundException(message);
      case 400:
      case 422:
        throw ValidationException(message);
      default:
        if (response.statusCode >= 500) throw ServerException(message);
        throw ApiException(message ?? 'Error inesperado (${response.statusCode}).');
    }
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    Map<String, String>? extraHeaders,
    bool exclusive = false,
  }) async {
    final generation = _generation;
    final tenantId = _tenantId;
    _checkActive(generation, exclusive: exclusive);
    final token = await tokenProvider();
    _checkActive(generation, exclusive: exclusive);
    final uri = Uri.parse(baseUrl).replace(path: path, queryParameters: query);
    final cacheKey = '${token ?? '-'}|${tenantId ?? '-'}|$uri';
    final session = path == '/api/v1/session';

    final headers = <String, String>{
      'accept': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
      if (body != null) 'content-type': 'application/json',
      ...?extraHeaders,
      if (tenantId != null && path.startsWith('/api/v1/') && !session)
        'x-mostrador-tenant': tenantId,
    };

    final cached = session ? null : _etagCache[cacheKey];
    if (method == 'GET' && cached?.etag != null) {
      headers['if-none-match'] = cached!.etag!;
    }

    late final http.Response response;
    try {
      final future = switch (method) {
        'GET' => _http.get(uri, headers: headers),
        'POST' => _http.post(
          uri,
          headers: headers,
          body: body == null ? null : jsonEncode(body),
        ),
        'PATCH' => _http.patch(
          uri,
          headers: headers,
          body: body == null ? null : jsonEncode(body),
        ),
        'DELETE' => _http.delete(uri, headers: headers),
        _ => throw ArgumentError.value(method, 'method'),
      };
      response = await future.timeout(timeout);
    } on TimeoutException {
      _checkActive(generation, exclusive: exclusive);
      throw NetworkException();
    } on SocketException {
      _checkActive(generation, exclusive: exclusive);
      throw NetworkException();
    } on http.ClientException {
      _checkActive(generation, exclusive: exclusive);
      throw NetworkException();
    }
    _checkActive(generation, exclusive: exclusive);

    if (response.statusCode == 304 && cached != null) {
      return cached.body;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final text = utf8.decode(response.bodyBytes);
      final dynamic decoded;
      try {
        decoded = text.isEmpty ? null : jsonDecode(text);
      } on FormatException {
        throw ApiException('Respuesta inválida del servidor.');
      }
      final etag = response.headers['etag'];
      if (method == 'GET' && !session) {
        _etagCache[cacheKey] = _CachedResponse(body: decoded, etag: etag);
      }
      return decoded;
    }

    final errorBody = _tryDecode(response.bodyBytes);
    final message = _extractMessage(errorBody);
    if (response.statusCode == 409 &&
        errorBody is Map &&
        errorBody['error'] == 'contexto_desactualizado') {
      final callback = exclusive ? null : onContextChanged;
      close();
      callback?.call();
      throw ContextChangedException();
    }
    switch (response.statusCode) {
      case 401:
        if (token != null && !exclusive) onUnauthorized?.call();
        throw UnauthorizedException(message);
      case 403:
        throw ForbiddenException(message);
      case 404:
        throw NotFoundException(message);
      case 409:
        throw ConflictException(message);
      case 400:
      case 422:
        throw ValidationException(message);
      default:
        if (response.statusCode >= 500) throw ServerException(message);
        throw ApiException(
          message ?? 'Error inesperado (${response.statusCode}).',
        );
    }
  }

  /// Decodifica sin lanzar: los cuerpos de error pueden no ser JSON.
  dynamic _tryDecode(List<int> bytes) {
    if (bytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(bytes));
    } on FormatException {
      return null;
    }
  }

  /// Extrae `message` de las formas de error del backend
  /// (`{message}` o `{error, message}`); null si no hay una legible.
  String? _extractMessage(dynamic body) {
    if (body is! Map) return null;
    final message = body['message'];
    if (message is String && message.isNotEmpty) return message;
    return null;
  }
}

class _CachedResponse {
  const _CachedResponse({required this.body, required this.etag});

  final dynamic body;
  final String? etag;
}

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenProvider: () => ref.read(tokenStoreProvider).read(),
  );
  ref.onDispose(client.close);
  return client;
});
