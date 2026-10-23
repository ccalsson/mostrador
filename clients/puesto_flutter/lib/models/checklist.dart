/// Item de checklist de entrega (`checklist_items` en el backend).
///
/// Cada pedido puede tener items de verificacion que deben marcarse como
/// completados antes de entregar. El backend valida que todos esten completados
/// al momento de entregar.
class ChecklistItem {
  const ChecklistItem({
    required this.id,
    required this.pedidoId,
    required this.descripcion,
    required this.completado,
    required this.createdAt,
  });

  final String id;
  final String pedidoId;
  final String descripcion;
  final bool completado;
  final String createdAt;

  factory ChecklistItem.fromJson(Map<String, dynamic> json) {
    return ChecklistItem(
      id: json['id'] as String,
      pedidoId: json['pedidoId'] as String,
      descripcion: json['descripcion'] as String? ?? '',
      completado: json['completado'] as bool? ?? false,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}

/// Plantilla de checklist (`checklist_templates` en el backend).
///
/// Permite crear rapidamente los mismos items para varios pedidos. Solo los
/// administradores pueden crear plantillas; todos los roles pueden aplicarlas.
class ChecklistTemplate {
  const ChecklistTemplate({
    required this.id,
    required this.nombre,
    required this.items,
    required this.activo,
    required this.createdAt,
  });

  final String id;
  final String nombre;
  final List<String> items;
  final bool activo;
  final String createdAt;

  factory ChecklistTemplate.fromJson(Map<String, dynamic> json) {
    return ChecklistTemplate(
      id: json['id'] as String,
      nombre: json['nombre'] as String? ?? '',
      items: [
        for (final item in (json['items'] as List? ?? const []))
          item as String,
      ],
      activo: json['activo'] as bool? ?? true,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}
