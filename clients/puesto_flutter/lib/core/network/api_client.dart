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

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body, Map<String, String>? extraHeaders}) =>
      _send('POST', path, body: body, extraHeaders: extraHeaders);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    Map<String, String>? extraHeaders,
  }) async {
    final token = await tokenProvider();
    final uri = Uri.parse(baseUrl).replace(path: path, queryParameters: query);
    final cacheKey = '${token ?? '-'}|$uri';

    final headers = <String, String>{
      'accept': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
      if (body != null) 'content-type': 'application/json',
      ...?extraHeaders,
    };

    final cached = _etagCache[cacheKey];
    if (method == 'GET' && cached?.etag != null) {
      headers['if-none-match'] = cached!.etag!;
    }

    late final http.Response response;
    try {
      final future = switch (method) {
        'GET' => _http.get(uri, headers: headers),
        'POST' => _http.post(uri, headers: headers, body: body == null ? null : jsonEncode(body)),
        _ => throw ArgumentError.value(method, 'method'),
      };
      response = await future.timeout(timeout);
    } on TimeoutException {
      throw NetworkException();
    } on SocketException {
      throw NetworkException();
    } on http.ClientException {
      throw NetworkException();
    }

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
      if (method == 'GET') {
        _etagCache[cacheKey] = _CachedResponse(body: decoded, etag: etag);
      }
      return decoded;
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
      case 409:
        throw ConflictException(message);
      case 400:
      case 422:
        throw ValidationException(message);
      default:
        if (response.statusCode >= 500) throw ServerException(message);
        throw ApiException(message ?? 'Error inesperado (${response.statusCode}).');
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
  ref.onDispose(() => client.onUnauthorized = null);
  return client;
});
