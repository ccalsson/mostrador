/// Identidad visual del puesto servida por `GET /api/v1/marca`.
///
/// Los cinco campos son textos libres que el dueño edita desde la pantalla
/// de Identidad en el panel de administración.
class Marca {
  const Marca({
    required this.nombre,
    required this.bajada,
    required this.membrete,
    required this.pie,
    required this.fondo,
  });

  factory Marca.fromJson(Map<String, dynamic> json) => Marca(
        nombre: (json['nombre'] as String?) ?? '',
        bajada: (json['bajada'] as String?) ?? '',
        membrete: (json['membrete'] as String?) ?? '',
        pie: (json['pie'] as String?) ?? '',
        fondo: (json['fondo'] as String?) ?? '',
      );

  final String nombre;
  final String bajada;
  final String membrete;
  final String pie;
  final String fondo;

  Map<String, dynamic> toJson() => {
        'nombre': nombre,
        'bajada': bajada,
        'membrete': membrete,
        'pie': pie,
        'fondo': fondo,
      };
}
