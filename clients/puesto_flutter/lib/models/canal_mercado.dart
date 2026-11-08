class CanalMercado {
  const CanalMercado({
    required this.activo,
    required this.presencia,
    required this.tier,
    required this.cuentaCorriente,
    required this.packs,
    required this.avisos,
    required this.comision,
  });

  factory CanalMercado.fromJson(Map<String, dynamic> json) {
    return CanalMercado(
      activo: json['activo'] == true,
      presencia: json['presencia'] == true,
      tier: json['tier'] as String? ?? '',
      cuentaCorriente: json['cuentaCorriente'] == true,
      packs: (json['packs'] as num?)?.toInt() ?? 0,
      avisos: (json['avisos'] as num?)?.toInt() ?? 0,
      comision: (json['comision'] as num?)?.toDouble() ?? 0,
    );
  }

  final bool activo;
  final bool presencia;
  final String tier;
  final bool cuentaCorriente;
  final int packs;
  final int avisos;
  final double comision;
}
