import 'dart:convert';
import 'dart:io';

class ApiClient {
  ApiClient({required String baseUrl, this.sessionToken}) : _baseUri = Uri.parse(baseUrl);
  final Uri _baseUri;
  final String? sessionToken;

  void _applyAuth(HttpClientRequest request) {
    if (sessionToken != null && sessionToken!.isNotEmpty) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $sessionToken');
    }
  }

  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(_baseUri.resolve(path));
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      _applyAuth(request);
      headers?.forEach(request.headers.set);
      final response = await request.close();
      return ApiResponse(response.statusCode, response.headers, await utf8.decodeStream(response));
    } finally {
      client.close(force: true);
    }
  }

  Future<ApiResponse> post(String path, {Object? body, Map<String, String>? headers}) async {
    final client = HttpClient();
    try {
      final request = await client.postUrl(_baseUri.resolve(path));
      _applyAuth(request);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      headers?.forEach(request.headers.set);
      if (body != null) request.write(jsonEncode(body));
      final response = await request.close();
      return ApiResponse(response.statusCode, response.headers, await utf8.decodeStream(response));
    } finally {
      client.close(force: true);
    }
  }

  Future<ApiResponse> put(String path, {Object? body, Map<String, String>? headers}) async {
    final client = HttpClient();
    try {
      final request = await client.putUrl(_baseUri.resolve(path));
      _applyAuth(request);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      headers?.forEach(request.headers.set);
      if (body != null) request.write(jsonEncode(body));
      final response = await request.close();
      return ApiResponse(response.statusCode, response.headers, await utf8.decodeStream(response));
    } finally {
      client.close(force: true);
    }
  }

  Future<ApiResponse> delete(String path, {Map<String, String>? headers}) async {
    final client = HttpClient();
    try {
      final request = await client.deleteUrl(_baseUri.resolve(path));
      _applyAuth(request);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      headers?.forEach(request.headers.set);
      final response = await request.close();
      return ApiResponse(response.statusCode, response.headers, await utf8.decodeStream(response));
    } finally {
      client.close(force: true);
    }
  }
}

class ApiResponse {
  const ApiResponse(this.statusCode, this.headers, this.body);
  final int statusCode;
  final HttpHeaders headers;
  final String body;
  Map<String, dynamic> get json => jsonDecode(body) as Map<String, dynamic>;
  List<dynamic> get jsonList => jsonDecode(body) as List<dynamic>;
}
