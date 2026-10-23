class Sucursal {
  const Sucursal({
    required this.id,
    required this.nombre,
    required this.referencia,
    required this.esMatriz,
    required this.activa,
    required this.esActual,
  });

  factory Sucursal.fromJson(Map<String, dynamic> json) => Sucursal(
    id: json['id'] as String,
    nombre: json['nombre'] as String,
    referencia: json['referencia'] as String,
    esMatriz: json['esMatriz'] as bool,
    activa: json['activa'] as bool,
    esActual: json['esActual'] as bool,
  );

  final String id;
  final String nombre;
  final String referencia;
  final bool esMatriz;
  final bool activa;
  final bool esActual;
}

class CruceSucursal {
  const CruceSucursal({
    required this.id,
    required this.nombre,
    required this.ventas,
    required this.tickets,
    required this.stockBajo,
  });

  factory CruceSucursal.fromJson(Map<String, dynamic> json) => CruceSucursal(
    id: json['id'] as String,
    nombre: json['nombre'] as String,
    ventas: (json['ventas'] as num).toDouble(),
    tickets: (json['tickets'] as num).toInt(),
    stockBajo: (json['stockBajo'] as num).toInt(),
  );

  final String id;
  final String nombre;
  final double ventas;
  final int tickets;
  final int stockBajo;
}

class ProductoMatriz {
  const ProductoMatriz({
    required this.id,
    required this.nombre,
    required this.stock,
  });

  factory ProductoMatriz.fromJson(Map<String, dynamic> json) => ProductoMatriz(
    id: json['id'] as String,
    nombre: json['nombre'] as String,
    stock: (json['stock'] as num).toDouble(),
  );

  final String id;
  final String nombre;
  final double stock;
}

class PanelSucursales {
  const PanelSucursales({
    required this.incluidas,
    required this.extras,
    required this.cupo,
    required this.usadas,
    required this.puedeCrear,
    required this.esDueno,
    required this.sucursales,
    required this.cruce,
    required this.productos,
  });

  factory PanelSucursales.fromJson(Map<String, dynamic> json) =>
      PanelSucursales(
        incluidas: (json['incluidas'] as num).toInt(),
        extras: (json['extras'] as num).toInt(),
        cupo: (json['cupo'] as num).toInt(),
        usadas: (json['usadas'] as num).toInt(),
        puedeCrear: json['puedeCrear'] as bool,
        esDueno: json['esDueno'] as bool,
        sucursales: (json['sucursales'] as List)
            .map((e) => Sucursal.fromJson(e as Map<String, dynamic>))
            .toList(),
        cruce: (json['cruce'] as List)
            .map((e) => CruceSucursal.fromJson(e as Map<String, dynamic>))
            .toList(),
        productos: (json['productos'] as List)
            .map((e) => ProductoMatriz.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final int incluidas;
  final int extras;
  final int cupo;
  final int usadas;
  final bool puedeCrear;
  final bool esDueno;
  final List<Sucursal> sucursales;
  final List<CruceSucursal> cruce;
  final List<ProductoMatriz> productos;
}
