/// Models for GET /api/v1/escritorio — paridad con web (escritorio.tsx).
///
/// Solo admin puede consumir estos datos; el backend valida el rol.
library;

class EscritorioResumen {
  const EscritorioResumen({
    required this.premium,
    required this.margen,
    required this.deudas,
    required this.cierres,
  });

  factory EscritorioResumen.fromJson(Map<String, dynamic> json) {
    final margenJson = json['margen'] as Map<String, dynamic>? ?? {};
    return EscritorioResumen(
      premium: json['premium'] as bool? ?? false,
      margen: MargenDia.fromJson(margenJson),
      deudas: (json['deudas'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(DeudaCliente.fromJson)
          .toList(),
      cierres: (json['cierres'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(CierreCaja.fromJson)
          .toList(),
    );
  }

  final bool premium;
  final MargenDia margen;
  final List<DeudaCliente> deudas;
  final List<CierreCaja> cierres;
}

class MargenDia {
  const MargenDia({
    required this.cobrado,
    required this.costo,
    required this.diferencia,
    required this.sinPrecio,
    required this.serie,
    required this.entradas,
  });

  factory MargenDia.fromJson(Map<String, dynamic> json) {
    return MargenDia(
      cobrado: _num(json['cobrado']),
      costo: _num(json['costo']),
      diferencia: _num(json['diferencia']),
      sinPrecio: (json['sinPrecio'] as num?)?.toInt() ?? 0,
      serie: (json['serie'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(SerieRow.fromJson)
          .toList(),
      entradas: (json['entradas'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(EntradaRemito.fromJson)
          .toList(),
    );
  }

  final double cobrado;
  final double costo;
  final double diferencia;
  final int sinPrecio;
  final List<SerieRow> serie;
  final List<EntradaRemito> entradas;
}

class SerieRow {
  const SerieRow({required this.dia, required this.cobrado, required this.costo});

  factory SerieRow.fromJson(Map<String, dynamic> json) {
    return SerieRow(
      dia: json['dia'] as String,
      cobrado: _num(json['cobrado']),
      costo: _num(json['costo']),
    );
  }

  final String dia;
  final double cobrado;
  final double costo;

  double get diferencia => cobrado - costo;
}

class EntradaRemito {
  const EntradaRemito({
    required this.id,
    required this.proveedor,
    required this.cuando,
    required this.costo,
    required this.lineas,
  });

  factory EntradaRemito.fromJson(Map<String, dynamic> json) {
    return EntradaRemito(
      id: json['id'] as String,
      proveedor: json['proveedor'] as String? ?? 'Sin proveedor',
      cuando: json['cuando'] as String,
      costo: _num(json['costo']),
      lineas: (json['lineas'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;
  final String proveedor;
  final String cuando;
  final double costo;
  final int lineas;
}

class DeudaCliente {
  const DeudaCliente({required this.id, required this.nombre, required this.saldo});

  factory DeudaCliente.fromJson(Map<String, dynamic> json) {
    return DeudaCliente(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      saldo: _num(json['saldo']),
    );
  }

  final String id;
  final String nombre;
  final double saldo;
}

class CierreCaja {
  const CierreCaja({
    required this.id,
    required this.cerradoAt,
    required this.esperado,
    required this.real,
    required this.diferencia,
    required this.notas,
    required this.quien,
  });

  factory CierreCaja.fromJson(Map<String, dynamic> json) {
    return CierreCaja(
      id: json['id'] as String,
      cerradoAt: json['cerradoAt'] as String,
      esperado: _num(json['esperado']),
      real: _num(json['real']),
      diferencia: _num(json['diferencia']),
      notas: json['notas'] as String? ?? '',
      quien: json['quien'] as String? ?? 'Sin nombre',
    );
  }

  final String id;
  final String cerradoAt;
  final double esperado;
  final double real;
  final double diferencia;
  final String notas;
  final String quien;
}

double _num(Object? value) {
  if (value == null) return 0;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString()) ?? 0;
}
