import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class TorreError implements Exception {
  TorreError(this.message, [this.status]);
  final String message;
  final int? status;

  @override
  String toString() => message;
}

/// Cliente de la consola Torre contra /api/torre/v1 de la web publicada.
/// Cada fnX llama a la función homónima de la web: mismo body que su validator
/// y misma respuesta JSON que su handler.
class TorreApi {
  TorreApi({required this.servidor, this.token = '', this.email = '', this.role = ''});

  String servidor;
  String token;
  String email;
  String role;
  void Function()? onNoAutorizado;

  Uri _uri(String ruta) {
    final base = servidor.trim().replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base/api/torre/v1/$ruta');
  }

  Future<dynamic> _pedir(String metodo, String ruta, Object? cuerpo, {bool conSesion = true}) async {
    http.Response res;
    try {
      final request = http.Request(metodo, _uri(ruta))
        ..headers['accept'] = 'application/json'
        ..headers['content-type'] = 'application/json';
      if (conSesion && token.isNotEmpty) request.headers['authorization'] = 'Bearer $token';
      if (cuerpo != null) request.body = jsonEncode(cuerpo);
      res = await http.Response.fromStream(await request.send().timeout(const Duration(seconds: 45)));
    } on TimeoutException {
      throw TorreError('El servidor no respondió a tiempo.');
    } catch (_) {
      throw TorreError('No hubo respuesta del servidor. Revisá la dirección y tu conexión.');
    }
    dynamic data;
    try {
      data = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    } catch (_) {
      throw TorreError('El servidor no devolvió JSON (HTTP ${res.statusCode}). Revisá la dirección de la web.', res.statusCode);
    }
    if (res.statusCode == 401 && conSesion) onNoAutorizado?.call();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final mensaje = data is Map && data['message'] is String ? data['message'] as String : 'No se pudo completar.';
      throw TorreError(mensaje, res.statusCode);
    }
    return data;
  }

  Future<void> entrar(String email, String password) async {
    final data = await _pedir('POST', 'auth/ingreso', {'email': email.trim(), 'password': password}, conSesion: false);
    final nuevo = data is Map ? data['token']?.toString() ?? '' : '';
    if (nuevo.isEmpty) throw TorreError('El servidor no devolvió sesión.');
    token = nuevo;
    this.email = email.trim();
    await cargarYo();
  }

  Future<void> cargarYo() async {
    final data = await _pedir('GET', 'auth/yo', null);
    if (data is Map) {
      email = data['email']?.toString() ?? email;
      role = data['role']?.toString() ?? '';
    }
  }

  Future<dynamic> fn(String nombre, [Object? data]) => _pedir('POST', 'fn/$nombre', data ?? <String, dynamic>{});

  Future<List<dynamic>> fnLista(String nombre, [Object? data]) async {
    final res = await fn(nombre, data);
    if (res is List) return res;
    throw TorreError('La respuesta de $nombre no es una lista.');
  }

  Future<Map<String, dynamic>> fnMapa(String nombre, [Object? data]) async {
    final res = await fn(nombre, data);
    if (res is Map<String, dynamic>) return res;
    if (res is Map) return res.map((k, v) => MapEntry(k.toString(), v));
    throw TorreError('La respuesta de $nombre no es un objeto.');
  }
}
