/// Comprador de Mercado al Toque que compró en este puesto.
///
/// Son filas read-only: no se pueden editar desde Flutter. Viven en la tabla
/// `mercado_compradores` del backend y se muestran en "Clientes app".
class CompradorApp {
  const CompradorApp({
    required this.id,
    required this.nombre,
    this.email,
    this.telefono,
    this.totalPedidos = 0,
    this.totalGastado = 0,
    this.primeraCompra,
    this.ultimaCompra,
    this.verificado = false,
    this.identidad = 'sin_documento',
  });

  final String id;
  final String nombre;
  final String? email;
  final String? telefono;
  final int totalPedidos;
  final double totalGastado;
  final String? primeraCompra;
  final String? ultimaCompra;
  final bool verificado;

  /// Estado de verificación de identidad: 'sin_documento',
  /// 'documentacion_cargada', 'aprobada', 'rechazada'.
  final String identidad;

  factory CompradorApp.fromJson(Map<String, dynamic> json) {
    return CompradorApp(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      email: json['email'] as String?,
      telefono: json['telefono'] as String?,
      totalPedidos: (json['totalPedidos'] as num?)?.toInt() ?? 0,
      totalGastado: (json['totalGastado'] as num?)?.toDouble() ?? 0,
      primeraCompra: json['primeraCompra'] as String?,
      ultimaCompra: json['ultimaCompra'] as String?,
      verificado: json['verificado'] as bool? ?? false,
      identidad: json['identidad'] as String? ?? 'sin_documento',
    );
  }
}
