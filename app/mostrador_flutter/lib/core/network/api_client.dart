import 'dart:convert';
import 'dart:io';

class ApiClient {
  ApiClient({required String baseUrl, this.sessionToken}) : _baseUri = Uri.parse(baseUrl);
  final Uri _baseUri;
  final String? sessionToken;

  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(_baseUri.resolve(path));
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (sessionToken != null && sessionToken!.isNotEmpty) request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $sessionToken');
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
}
