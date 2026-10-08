import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';

/// Identidad del puesto servida por `GET /api/tenant` (endpoint público).
class IdentidadTenant {
  const IdentidadTenant({required this.nombre, required this.bajada});

  final String nombre;
  final String bajada;
}

const _identidadPorDefecto = IdentidadTenant(nombre: 'Mostrador', bajada: '');

final tenantProvider = FutureProvider<IdentidadTenant>((ref) async {
  final client = ref.watch(apiClientProvider);
  try {
    final data = await client.get('/api/tenant');
    if (data is Map && data['nombre'] is String && (data['nombre'] as String).isNotEmpty) {
      final bajada = data['bajada'];
      return IdentidadTenant(
        nombre: data['nombre'] as String,
        bajada: bajada is String ? bajada : '',
      );
    }
  } on Exception {
    // Sin branding remoto se usa la identidad local; no bloquea el login.
  }
  return _identidadPorDefecto;
});
