import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/cliente.dart';
import '../models/comprador_app.dart';

/// Servicio para consultar los compradores de Mercado al Toque que ya
/// compraron en este puesto. Son read-only: no se crean ni editan desde
/// Flutter.
///
/// El backend devuelve todos los clientes (propios + Mercado) en
/// `GET /api/v1/clientes`. Los compradores Mercado se identifican por
/// `origen == 'mercado'` y tienen `userId` no nulo.
class CompradoresAppService {
  CompradoresAppService(this._client);

  final ApiClient _client;

  /// Lista todos los compradores Mercado del puesto.
  ///
  /// Pide la lista completa de clientes y filtra los de origen Mercado.
  Future<List<CompradorApp>> listar() async {
    final data =
        await _client.get('/api/v1/clientes') as Map<String, dynamic>;
    final lista = (data['data'] as List)
        .whereType<Map<String, dynamic>>()
        .where((json) => json['origen'] == 'mercado')
        .map((json) {
      final cliente = Cliente.fromJson(json);
      return CompradorApp(
        id: cliente.userId ?? cliente.id,
        nombre: cliente.nombre,
        email: cliente.email,
        telefono: cliente.telefono,
        totalPedidos: 0,
        totalGastado: cliente.saldo >= 0 ? 0 : -cliente.saldo,
        verificado: cliente.activo,
        identidad: 'sin_documento',
      );
    }).toList();
    return lista;
  }

  /// Obtiene un comprador Mercado por su ID de cliente del puesto.
  ///
  /// El backend no tiene un endpoint específico; se busca en la lista
  /// completa filtrando por ID con prefijo `merc:`.
  Future<CompradorApp?> obtener(String id) async {
    final compradores = await listar();
    for (final c in compradores) {
      if (c.id == id) return c;
    }
    return null;
  }
}

final compradoresAppServiceProvider = Provider<CompradoresAppService>(
  (ref) => CompradoresAppService(ref.watch(apiClientProvider)),
);

final compradoresAppProvider = FutureProvider<List<CompradorApp>>(
  (ref) => ref.watch(compradoresAppServiceProvider).listar(),
);
