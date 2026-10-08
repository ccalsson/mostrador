import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import 'models.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://192.168.0.101:8080/api/mercado/v1',
);

/// Tipo de falla, para que la UI distinga sin conexión, timeout, error del
/// servidor, sesión expirada, permisos y rechazo de negocio (nunca un
/// "Error desconocido").
enum ApiErrorKind { red, timeout, servidor, sesionExpirada, prohibido, negocio }

class MercadoApiException implements Exception {
  const MercadoApiException(
    this.message, {
    this.statusCode,
    this.kind = ApiErrorKind.negocio,
  });

  final String message;
  final int? statusCode;
  final ApiErrorKind kind;

  bool get definitiveClientError =>
      statusCode != null && statusCode! >= 400 && statusCode! < 500;

  @override
  String toString() => message;
}

class ProductRead {
  const ProductRead({
    required this.products,
    required this.readAt,
    required this.isStale,
  });

  final List<Producto> products;
  final DateTime readAt;
  final bool isStale;
}

class _CachedProducts {
  const _CachedProducts(this.products, this.readAt);

  final List<Producto> products;
  final DateTime readAt;
}

class _CachedLegal {
  const _CachedLegal(this.documento, this.readAt);

  final DocumentoLegalContenido documento;
  final DateTime readAt;
}

class MercadoApi {
  MercadoApi({http.Client? client, FlutterSecureStorage? storage})
    : _client = client ?? http.Client(),
      _storage = storage ?? const FlutterSecureStorage() {
    final uri = Uri.parse(apiBaseUrl);
    _root = uri.toString().replaceFirst(RegExp(r'/$'), '');
  }

  static const _uuid = Uuid();
  static const _tokenKey = 'mercado.session_token';
  String _pendingCheckoutKey(String userId) =>
      'mercado.pending_checkout_key.$userId';
  String _pendingCheckoutBody(String userId) =>
      'mercado.pending_checkout_body.$userId';

  String _actionKey(String userId, String actionId) =>
      'mercado.action_key.$userId.$actionId';

  final http.Client _client;
  final FlutterSecureStorage _storage;
  late final String _root;
  final Map<String, _CachedProducts> _productsCache = {};
  List<Map<String, dynamic>>? _standsCache;
  DateTime? _standsReadAt;
  void Function()? onUnauthorized;

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> saveToken(String token) =>
      _storage.write(key: _tokenKey, value: token);

  Future<void> clearToken() => _storage.delete(key: _tokenKey);

  Future<Map<String, dynamic>> get(String path) async =>
      _asMap(await _send('GET', path));

  Future<Map<String, dynamic>> post(
    String path, {
    Object? body,
    String? idempotencyKey,
  }) async {
    return _asMap(
      await _send(
        'POST',
        path,
        body: body,
        headers: {'Idempotency-Key': ?idempotencyKey},
      ),
    );
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    final uri = Uri.parse('$_root/$path');
    final token = await readToken();
    final requestHeaders = <String, String>{
      'accept': 'application/json',
      if (body != null) 'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
      ...headers,
    };

    late http.Response response;
    try {
      final request = switch (method) {
        'GET' => _client.get(uri, headers: requestHeaders),
        'POST' => _client.post(
          uri,
          headers: requestHeaders,
          body: body == null ? null : jsonEncode(body),
        ),
        _ => throw ArgumentError.value(method, 'method'),
      };
      response = await request.timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw const MercadoApiException(
        'La solicitud tardó demasiado. Revisá tu conexión.',
        kind: ApiErrorKind.timeout,
      );
    } on SocketException {
      throw const MercadoApiException(
        'No hay conexión con el servidor.',
        kind: ApiErrorKind.red,
      );
    } on http.ClientException {
      throw const MercadoApiException(
        'No se pudo conectar con el servidor.',
        kind: ApiErrorKind.red,
      );
    }
    final decoded = _decode(response.bodyBytes);
    if (response.statusCode >= 200 && response.statusCode < 300) return decoded;
    if (response.statusCode == 401 && token != null) {
      await clearToken();
      onUnauthorized?.call();
    }
    final message =
        decoded is Map<String, dynamic> && decoded['message'] is String
        ? decoded['message'] as String
        : 'Error del servidor (${response.statusCode}).';
    throw MercadoApiException(
      message,
      statusCode: response.statusCode,
      kind: switch (response.statusCode) {
        401 => ApiErrorKind.sesionExpirada,
        403 => ApiErrorKind.prohibido,
        >= 500 => ApiErrorKind.servidor,
        _ => ApiErrorKind.negocio,
      },
    );
  }

  dynamic _decode(List<int> bytes) {
    if (bytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(bytes));
    } on FormatException {
      throw const MercadoApiException(
        'El servidor devolvió una respuesta inválida.',
      );
    }
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    throw const MercadoApiException(
      'El servidor devolvió una respuesta incompleta.',
    );
  }

  Future<Map<String, dynamic>> me() => get('yo');

  Future<Map<String, dynamic>> signIn({
    required String email,
    required String password,
    required String profile,
  }) async {
    final result = await post(
      'auth/ingreso',
      body: {'email': email, 'password': password, 'perfil': profile},
    );
    await saveToken(result['token'] as String);
    return me();
  }

  Future<Map<String, dynamic>> registerBuyer({
    required String name,
    required String email,
    required String password,
    required String phone,
    required String country,
    required String documentType,
    required String documentNumber,
  }) async {
    final result = await post(
      'auth/registro',
      body: {
        'nombre': name,
        'email': email,
        'password': password,
        'telefono': phone,
        'pais': country,
        'tipoDocumento': documentType,
        'numeroDocumento': documentNumber,
      },
    );
    await saveToken(result['token'] as String);
    return me();
  }

  Future<Map<String, dynamic>> registerCourier({
    required String name,
    required String email,
    required String password,
    required String phone,
  }) async {
    final result = await post(
      'auth/registro-cargador',
      body: {
        'nombre': name,
        'email': email,
        'password': password,
        'telefono': phone,
      },
    );
    await saveToken(result['token'] as String);
    return me();
  }

  Future<String> startGoogle(String profile) async {
    final result = await post('auth/google', body: {'perfil': profile});
    return result['url'] as String;
  }

  Future<void> acceptGoogleToken(String token) async => saveToken(token);

  Future<void> signOut() async {
    try {
      await post('auth/salir');
    } finally {
      await clearToken();
    }
  }

  Future<List<Map<String, dynamic>>> stands({bool force = false}) async {
    if (!force &&
        _standsCache != null &&
        _standsReadAt != null &&
        DateTime.now().difference(_standsReadAt!) <
            const Duration(seconds: 45)) {
      return _standsCache!;
    }
    final response = await get('puestos');
    final items = (response['puestos'] as List).cast<Map<String, dynamic>>();
    _standsCache = items;
    _standsReadAt = DateTime.now();
    return items;
  }

  Future<ProductRead> products(String tenantId, {bool force = false}) async {
    final cached = _productsCache[tenantId];
    if (!force &&
        cached != null &&
        DateTime.now().difference(cached.readAt) <
            const Duration(seconds: 45)) {
      return ProductRead(
        products: cached.products,
        readAt: cached.readAt,
        isStale: false,
      );
    }
    try {
      final response = await get(
        'puestos/${Uri.encodeComponent(tenantId)}/productos',
      );
      final products = _tipos(response['productos'], Producto.fromJson);
      final readAt = DateTime.now();
      _productsCache[tenantId] = _CachedProducts(products, readAt);
      return ProductRead(products: products, readAt: readAt, isStale: false);
    } on MercadoApiException {
      if (cached == null) rethrow;
      return ProductRead(
        products: cached.products,
        readAt: cached.readAt,
        isStale: true,
      );
    }
  }

  void invalidateCatalog() {
    _standsCache = null;
    _standsReadAt = null;
    _productsCache.clear();
  }

  Future<Map<String, dynamic>> buyerOrders() => get('pedidos');

  Future<Map<String, dynamic>> couriers() => get('cargadores');

  Future<Map<String, dynamic>> routes() => get('recorridos');

  Future<Map<String, dynamic>> changeAvailability(bool available) => post(
    'cargador/disponibilidad',
    body: {'disponibilidad': available ? 'disponible' : 'no_disponible'},
  );

  Future<Map<String, dynamic>> createRoute({
    required String userId,
    required String courierId,
    required List<String> orderIds,
  }) async {
    final sortedOrderIds = List<String>.from(orderIds)..sort();
    final actionId = 'create-route-$courierId-${sortedOrderIds.join(',')}';
    final key = await _getActionKey(userId, actionId);
    try {
      final response = await post(
        'recorridos',
        body: {'cargadorId': courierId, 'pedidoIds': orderIds},
        idempotencyKey: key,
      );
      await _storage.delete(key: _actionKey(userId, actionId));
      return response;
    } on MercadoApiException catch (error) {
      if (error.definitiveClientError) {
        await _storage.delete(key: _actionKey(userId, actionId));
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> routeAction(
    String userId,
    String routeId,
    String action, {
    String? orderId,
  }) async {
    final actionId = '$routeId-$action-${orderId ?? ''}';
    final key = await _getActionKey(userId, actionId);
    try {
      final response = await post(
        'recorridos/${Uri.encodeComponent(routeId)}/$action',
        body: orderId == null ? null : {'pedidoId': orderId},
        idempotencyKey: key,
      );
      await _storage.delete(key: _actionKey(userId, actionId));
      return response;
    } on MercadoApiException catch (error) {
      if (error.definitiveClientError) {
        await _storage.delete(key: _actionKey(userId, actionId));
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> rateRoute({
    required String routeId,
    required int stars,
    required String comment,
  }) => post(
    'recorridos/${Uri.encodeComponent(routeId)}/calificar',
    body: {'estrellas': stars, 'comentario': comment},
  );

  Future<Map<String, dynamic>> uploadIdentity({
    required String country,
    required String documentType,
    required String documentNumber,
    required Uint8List document,
    required Uint8List selfie,
  }) => post(
    'identidad',
    body: {
      'pais': country,
      'tipoDocumento': documentType,
      'numeroDocumento': documentNumber,
      'documentoBase64': base64Encode(document),
      'selfieBase64': base64Encode(selfie),
    },
  );

  Future<Map<String, dynamic>> checkout({
    required String userId,
    required List<Map<String, dynamic>> items,
    required String paymentMethod,
    required String note,
  }) async {
    final keyStorage = _pendingCheckoutKey(userId);
    final bodyStorage = _pendingCheckoutBody(userId);
    var key = await _storage.read(key: keyStorage);
    var body = await _storage.read(key: bodyStorage);
    if (key == null || body == null) {
      key = _uuid.v4();
      body = jsonEncode({
        'medioPago': paymentMethod,
        'nota': note,
        'items': items,
      });
      await _storage.write(key: keyStorage, value: key);
      await _storage.write(key: bodyStorage, value: body);
    }
    try {
      final response = await post(
        'pedidos',
        body: jsonDecode(body),
        idempotencyKey: key,
      );
      await _clearPendingCheckout(userId);
      invalidateCatalog();
      return response;
    } on MercadoApiException catch (error) {
      if (error.definitiveClientError) await _clearPendingCheckout(userId);
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> pendingCheckout(String userId) async {
    final body = await _storage.read(key: _pendingCheckoutBody(userId));
    if (body == null) return null;
    final decoded = jsonDecode(body);
    return decoded is Map<String, dynamic> ? decoded : null;
  }

  Future<String> _getActionKey(String userId, String actionId) async {
    final storageKey = _actionKey(userId, actionId);
    final existing = await _storage.read(key: storageKey);
    if (existing != null) return existing;
    final key = _uuid.v4();
    await _storage.write(key: storageKey, value: key);
    return key;
  }

  Future<void> _clearPendingCheckout(String userId) async {
    await _storage.delete(key: _pendingCheckoutKey(userId));
    await _storage.delete(key: _pendingCheckoutBody(userId));
  }

  // ---------------------------------------------------------------------------
  // Documentos legales de la cuenta (contrato B, Parte B de suscripción y
  // legal): listar, leer contenido y aceptar. Sólo-online: la aceptación se
  // registra siempre en el backend, nunca localmente.
  // ---------------------------------------------------------------------------

  static const _legalCacheTtl = Duration(seconds: 45);
  final Map<String, _CachedLegal> _legalCache = {};

  /// B.1: documentos del perfil del token, con su estado de aceptación.
  Future<List<DocumentoLegal>> listarDocumentosLegales() async {
    final response = await get('legal/documentos');
    return DocumentoLegal.listFromJson(response['documentos']);
  }

  /// B.2: contenido de la versión vigente. La caché en memoria queda
  /// identificada por documentoId + version + hash y expira pronto.
  Future<DocumentoLegalContenido> obtenerDocumentoLegal(
    String documentoId, {
    bool force = false,
  }) async {
    final cached = _legalCache[documentoId];
    if (!force &&
        cached != null &&
        DateTime.now().difference(cached.readAt) < _legalCacheTtl) {
      return cached.documento;
    }
    final response = await get(
      'legal/documentos/${Uri.encodeComponent(documentoId)}',
    );
    final documento = DocumentoLegalContenido.fromJson(_campo(response));
    _legalCache[documentoId] = _CachedLegal(documento, DateTime.now());
    return documento;
  }

  void invalidarDocumentoLegal(String documentoId) =>
      _legalCache.remove(documentoId);

  /// B.3: acepta la versión y hash exactos que entregó el backend. Con 409
  /// (versión obsoleta o hash distinto) la copia local ya no sirve: se
  /// descarta para que la UI reconsulte la vigente.
  Future<Map<String, dynamic>> aceptarDocumentoLegal({
    required String userId,
    required String documentoId,
    required int version,
    required String hash,
  }) async {
    final actionId = 'aceptar-legal-$documentoId-$version';
    final key = await _getActionKey(userId, actionId);
    try {
      final response = await post(
        'legal/documentos/${Uri.encodeComponent(documentoId)}/aceptar',
        body: {'version': version, 'hash': hash},
        idempotencyKey: key,
      );
      await _storage.delete(key: _actionKey(userId, actionId));
      return response;
    } on MercadoApiException catch (error) {
      if (error.definitiveClientError) {
        await _storage.delete(key: _actionKey(userId, actionId));
      }
      if (error.statusCode == 409) invalidarDocumentoLegal(documentoId);
      rethrow;
    }
  }

  // ---------------------------------------------------------------------------
  // Accesos tipados: mismos endpoints, parseo con los modelos de models.dart.
  // ---------------------------------------------------------------------------
  Future<MercadoActor> actorActual() async =>
      MercadoActor.fromJson(await me());

  Future<List<Puesto>> listarPuestos({bool force = false}) async =>
      _tipos(await stands(force: force), Puesto.fromJson);

  Future<List<Producto>> listarProductos(
    String tenantId, {
    bool force = false,
  }) async => (await products(tenantId, force: force)).products;

  Future<List<PedidoComprador>> listarPedidosComprador() async {
    final response = await buyerOrders();
    return PedidoComprador.listFromJson(response['pedidos']);
  }

  Future<PedidoComprador> obtenerPedidoComprador(String pedidoId) async {
    final response = await get('pedidos/${Uri.encodeComponent(pedidoId)}');
    return PedidoComprador.fromJson(_campo(response['pedido']));
  }

  Future<List<Cargador>> listarCargadores() async {
    final response = await couriers();
    return _tipos(response['cargadores'], Cargador.fromJson);
  }

  Future<List<Recorrido>> listarRecorridos() async {
    final response = await routes();
    return Recorrido.listFromJson(response['recorridos']);
  }

  Future<Recorrido> crearRecorrido({
    required String userId,
    required String courierId,
    required List<String> orderIds,
  }) async {
    final response = await createRoute(
      userId: userId,
      courierId: courierId,
      orderIds: orderIds,
    );
    return Recorrido.fromJson(_campo(response['recorrido']));
  }

  Future<Recorrido> accionRecorrido(
    String userId,
    String routeId,
    String action, {
    String? orderId,
  }) async {
    final response = await routeAction(
      userId,
      routeId,
      action,
      orderId: orderId,
    );
    return Recorrido.fromJson(_campo(response['recorrido']));
  }

  Future<Calificacion> calificarRecorrido({
    required String routeId,
    required int stars,
    required String comment,
  }) async {
    final response = await rateRoute(
      routeId: routeId,
      stars: stars,
      comment: comment,
    );
    return Calificacion.fromJson(_campo(response['calificacion']));
  }

  List<T> _tipos<T>(dynamic value, T Function(Map<String, dynamic>) parse) {
    if (value is! List) return const [];
    return value
        .whereType<Map<String, dynamic>>()
        .map(parse)
        .toList(growable: false);
  }

  Map<String, dynamic> _campo(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    throw const MercadoApiException(
      'El servidor devolvió una respuesta incompleta.',
    );
  }

  void close() => _client.close();
}
