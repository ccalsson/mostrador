import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/cliente.dart';
import '../models/comprador_app.dart';

/// Estadísticas detalladas de un comprador de la app en este puesto.
class EstadisticasCompradorApp {
  const EstadisticasCompradorApp({
    required this.pedidos,
    required this.total,
    required this.cobrados,
    required this.enCurso,
    required this.anulados,
    this.ultimo,
    required this.formas,
  });

  final int pedidos;
  final double total;
  final int cobrados;
  final int enCurso;
  final int anulados;
  final String? ultimo;
  final List<FormaPagoStat> formas;

  factory EstadisticasCompradorApp.fromJson(Map<String, dynamic> json) {
    return EstadisticasCompradorApp(
      pedidos: (json['pedidos'] as num?)?.toInt() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
      cobrados: (json['cobrados'] as num?)?.toInt() ?? 0,
      enCurso: (json['enCurso'] as num?)?.toInt() ?? 0,
      anulados: (json['anulados'] as num?)?.toInt() ?? 0,
      ultimo: json['ultimo'] as String?,
      formas: (json['formas'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(FormaPagoStat.fromJson)
          .toList(),
    );
  }
}

/// Estadística por forma de pago.
class FormaPagoStat {
  const FormaPagoStat({
    required this.forma,
    required this.cantidad,
    required this.total,
  });

  final String forma;
  final int cantidad;
  final double total;

  factory FormaPagoStat.fromJson(Map<String, dynamic> json) {
    return FormaPagoStat(
      forma: json['forma'] as String? ?? 'sin_informar',
      cantidad: (json['cantidad'] as num?)?.toInt() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// Comprador de la app con datos enriquecidos (userId, enLista, etc.).
class CompradorAppDetalle {
  const CompradorAppDetalle({
    required this.userId,
    required this.email,
    required this.nombre,
    this.telefono,
    required this.identidad,
    this.clienteId,
    required this.pedidos,
    required this.enLista,
  });

  final String userId;
  final String email;
  final String nombre;
  final String? telefono;
  final String identidad;
  final String? clienteId;
  final int pedidos;
  final bool enLista;

  factory CompradorAppDetalle.fromJson(Map<String, dynamic> json) {
    return CompradorAppDetalle(
      userId: json['userId'] as String,
      email: json['email'] as String? ?? '',
      nombre: json['nombre'] as String? ?? '',
      telefono: json['telefono'] as String?,
      identidad: json['identidad'] as String? ?? 'sin_documento',
      clienteId: json['clienteId'] as String?,
      pedidos: (json['pedidos'] as num?)?.toInt() ?? 0,
      enLista: json['enLista'] as bool? ?? false,
    );
  }
}

/// Servicio para gestionar los compradores de Mercado al Toque del puesto.
///
/// Consume los endpoints de compradores-app del API v1:
/// - GET /api/v1/compradores-app (lista con detalles)
/// - GET /api/v1/compradores-app/:userId/estadisticas
/// - POST /api/v1/compradores-app/:userId/sumar
/// - PATCH /api/v1/compradores-app/:userId
class CompradoresAppService {
  CompradoresAppService(this._client);

  final ApiClient _client;

  /// Lista todos los compradores Mercado del puesto con datos enriquecidos.
  ///
  /// Usa el endpoint dedicado GET /api/v1/compradores-app si está disponible,
  /// si no hace fallback al filtro por origen en GET /api/v1/clientes.
  Future<List<CompradorAppDetalle>> listarDetallado({String? busca}) async {
    try {
      final data = await _client.get(
        '/api/v1/compradores-app',
        query: busca != null && busca.isNotEmpty ? {'busca': busca} : null,
      ) as Map<String, dynamic>;
      final lista = (data['data'] as Map<String, dynamic>)['compradores']
          as List<dynamic>;
      return lista
          .cast<Map<String, dynamic>>()
          .map(CompradorAppDetalle.fromJson)
          .toList();
    } catch (_) {
      // Fallback: usar el endpoint de clientes y filtrar por origen mercado.
      return listar().then(
        (compradores) => compradores
            .map(
              (c) => CompradorAppDetalle(
                userId: c.id,
                email: c.email ?? '',
                nombre: c.nombre,
                telefono: c.telefono,
                identidad: c.identidad,
                pedidos: c.totalPedidos,
                enLista: false,
              ),
            )
            .toList(),
      );
    }
  }

  /// Lista todos los compradores Mercado del puesto (modelo simple).
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

  /// Obtiene un comprador Mercado por su ID.
  Future<CompradorApp?> obtener(String id) async {
    final compradores = await listar();
    for (final c in compradores) {
      if (c.id == id) return c;
    }
    return null;
  }

  /// Estadísticas detalladas de un comprador en este puesto.
  ///
  /// `GET /api/v1/compradores-app/:userId/estadisticas`
  Future<EstadisticasCompradorApp> obtenerEstadisticas(String userId) async {
    final data = await _client.get(
      '/api/v1/compradores-app/$userId/estadisticas',
    ) as Map<String, dynamic>;
    return EstadisticasCompradorApp.fromJson(
      data['data'] as Map<String, dynamic>,
    );
  }

  /// Agrega un comprador de la app a la lista de clientes del puesto.
  ///
  /// `POST /api/v1/compradores-app/:userId/sumar`
  Future<String> sumarComprador(String userId) async {
    final data = await _client.post(
      '/api/v1/compradores-app/$userId/sumar',
    ) as Map<String, dynamic>;
    return (data['data'] as Map<String, dynamic>)['id'] as String;
  }

  /// Actualiza los datos editables de un comprador de la app.
  ///
  /// `PATCH /api/v1/compradores-app/:userId`
  Future<void> actualizarComprador(
    String userId, {
    required String nombre,
    String? telefono,
    String? direccion,
  }) async {
    await _client.patch(
      '/api/v1/compradores-app/$userId',
      body: {
        'nombre': nombre,
        'telefono': ?telefono,
        'direccion': ?direccion,
      },
    );
  }
}

final compradoresAppServiceProvider = Provider<CompradoresAppService>(
  (ref) => CompradoresAppService(ref.watch(apiClientProvider)),
);

final compradoresAppProvider = FutureProvider<List<CompradorApp>>(
  (ref) => ref.watch(compradoresAppServiceProvider).listar(),
);

final compradoresAppDetalladoProvider =
    FutureProvider.family<List<CompradorAppDetalle>, String?>((ref, busca) {
  return ref.watch(compradoresAppServiceProvider).listarDetallado(busca: busca);
});

final estadisticasCompradorProvider =
    FutureProvider.family<EstadisticasCompradorApp, String>((ref, userId) {
  return ref
      .watch(compradoresAppServiceProvider)
      .obtenerEstadisticas(userId);
});
