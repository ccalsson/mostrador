import '../../../core/network/api_client.dart';

class CatalogApi {
  CatalogApi(this._client);
  final ApiClient _client;

  Future<CatalogSnapshot> fetch({String? since, String? etag}) async {
    final suffix = since == null ? '' : '?since=${Uri.encodeQueryComponent(since)}';
    final response = await _client.get('/api/v1/catalogo$suffix', headers: {if (etag != null) 'if-none-match': etag});
    if (response.statusCode == 304) return const CatalogSnapshot.notModified();
    if (response.statusCode != 200) throw ApiException(response.statusCode, response.body);
    final json = response.json;
    return CatalogSnapshot(
      products: (json['data'] as List<dynamic>).cast<Map<String, dynamic>>(),
      version: json['version'] as String?,
      etag: response.headers.value('etag'),
    );
  }
}

class CatalogSnapshot {
  const CatalogSnapshot({required this.products, required this.version, required this.etag});
  const CatalogSnapshot.notModified() : products = const [], version = null, etag = null;
  final List<Map<String, dynamic>> products;
  final String? version;
  final String? etag;
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.body);
  final int statusCode;
  final String body;
}
