// Modelos tipados del canal Mercado al Toque.
//
// Los valores de estado reflejan EXACTAMENTE lo que emite el backend
// (`app/src/lib/server/mercado.ts`): `buyerOrderState` para pedidos del
// comprador, y `mercado_recorridos` / `mercado_recorrido_pedidos` para
// recorridos y paradas. No inventar estados: si el backend agrega uno,
// se agrega acá y en los tests.

class MercadoActor {
  const MercadoActor({
    required this.id,
    required this.nombre,
    required this.email,
    required this.perfil,
    this.estadoIdentidad,
    this.estadoCuenta,
    this.disponibilidad,
    this.puntos,
    this.score,
  });

  final String id;
  final String nombre;
  final String email;

  /// 'comprador' o 'cargador' — lo resuelve el backend, nunca el cliente.
  final String perfil;

  /// Solo comprador: 'pendiente' | 'documentacion_cargada'.
  final String? estadoIdentidad;

  /// Solo cargador: 'activo' | ...
  final String? estadoCuenta;

  /// Solo cargador: 'disponible' | 'no_disponible'.
  final String? disponibilidad;
  final int? puntos;
  final double? score;

  bool get esComprador => perfil == 'comprador';

  /// El backend rechaza el checkout sin identidad cargada; el botón de
  /// comprar se habilita solo con este estado.
  bool get puedeComprar =>
      esComprador && estadoIdentidad == 'documentacion_cargada';

  bool get estaDisponible => disponibilidad == 'disponible';

  factory MercadoActor.fromJson(Map<String, dynamic> json) => MercadoActor(
        id: _str(json, 'id'),
        nombre: _str(json, 'nombre'),
        email: _str(json, 'email'),
        perfil: _str(json, 'perfil'),
        estadoIdentidad: _strOpt(json['estadoIdentidad']),
        estadoCuenta: _strOpt(json['estadoCuenta'] ?? json['estado_cuenta']),
        disponibilidad: _strOpt(json['disponibilidad']),
        puntos: _intOpt(json['puntos']),
        score: _doubleOpt(json['score']),
      );
}

class Puesto {
  const Puesto({
    required this.id,
    required this.nombre,
    required this.bajada,
  });

  final String id;
  final String nombre;
  final String bajada;

  factory Puesto.fromJson(Map<String, dynamic> json) => Puesto(
        id: _str(json, 'id'),
        nombre: _str(json, 'nombre'),
        bajada: _strOpt(json['bajada']) ?? '',
      );
}

class Producto {
  const Producto({
    required this.id,
    required this.nombre,
    required this.precio,
    required this.disponible,
    required this.unidad,
    required this.unidadLabel,
  });

  final String id;
  final String nombre;
  final double precio;

  /// Disponibilidad que expone el backend; nunca se recalcula en el cliente.
  final double disponible;
  final String unidad;
  final String unidadLabel;

  factory Producto.fromJson(Map<String, dynamic> json) => Producto(
        id: _str(json, 'id'),
        nombre: _str(json, 'nombre'),
        precio: _double(json['precio']),
        disponible: _double(json['disponible']),
        unidad: _strOpt(json['unidad']) ?? '',
        unidadLabel: _strOpt(json['unidadLabel']) ?? '',
      );
}

/// Estados de pedido tal como los publica el backend para el comprador
/// (buyerOrderState en mercado.ts).
enum EstadoPedidoComprador {
  confirmado('confirmado', 'Confirmado'),
  enPreparacion('en_preparacion', 'En preparación'),
  preparado('preparado', 'Preparado para retiro'),
  retirado('retirado', 'Retirado'),
  entregado('entregado', 'Entregado'),
  cancelado('cancelado', 'Cancelado');

  const EstadoPedidoComprador(this.wire, this.label);

  final String wire;
  final String label;

  static EstadoPedidoComprador fromWire(String value) => values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw FormatException('Estado de pedido desconocido: $value'),
      );
}

class LineaPedido {
  const LineaPedido({
    required this.productoId,
    required this.nombre,
    required this.cantidad,
    required this.precioUnitario,
    required this.unidad,
    required this.unidadLabel,
    required this.subtotal,
  });

  final String productoId;
  final String nombre;
  final double cantidad;
  final double precioUnitario;
  final String unidad;
  final String unidadLabel;
  final double subtotal;

  factory LineaPedido.fromJson(Map<String, dynamic> json) => LineaPedido(
        productoId: _str(json, 'productoId'),
        nombre: _str(json, 'nombre'),
        cantidad: _double(json['cantidad']),
        precioUnitario: _double(json['precioUnitario']),
        unidad: _strOpt(json['unidad']) ?? '',
        unidadLabel: _strOpt(json['unidadLabel']) ?? '',
        subtotal: _double(json['subtotal']),
      );
}

class TiemposPedido {
  const TiemposPedido({
    this.preparacion,
    this.espera,
    this.entrega,
    this.total,
  });

  final int? preparacion;
  final int? espera;
  final int? entrega;
  final int? total;

  factory TiemposPedido.fromJson(Map<String, dynamic> json) => TiemposPedido(
        preparacion: _intOpt(json['preparacion']),
        espera: _intOpt(json['espera']),
        entrega: _intOpt(json['entrega']),
        total: _intOpt(json['total']),
      );
}

class PedidoComprador {
  const PedidoComprador({
    required this.id,
    required this.tenantId,
    required this.puesto,
    required this.estado,
    required this.nota,
    required this.medioPago,
    required this.pagoEstado,
    required this.items,
    required this.total,
    required this.bultos,
    required this.tiempos,
    required this.createdAt,
    this.confirmedAt,
    this.preparationStartedAt,
    this.preparedAt,
    this.pickedUpAt,
    this.deliveredAt,
  });

  final String id;
  final String tenantId;
  final String puesto;
  final EstadoPedidoComprador estado;
  final String nota;
  final String medioPago;
  final String pagoEstado;
  final List<LineaPedido> items;
  final double total;
  final double bultos;
  final TiemposPedido tiempos;
  final String createdAt;
  final String? confirmedAt;
  final String? preparationStartedAt;
  final String? preparedAt;
  final String? pickedUpAt;
  final String? deliveredAt;

  factory PedidoComprador.fromJson(Map<String, dynamic> json) => PedidoComprador(
        id: _str(json, 'id'),
        tenantId: _str(json, 'tenantId'),
        puesto: _str(json, 'puesto'),
        estado: EstadoPedidoComprador.fromWire(_str(json, 'estado')),
        nota: _strOpt(json['nota']) ?? '',
        medioPago: _strOpt(json['medioPago']) ?? '',
        pagoEstado: _strOpt(json['pagoEstado']) ?? '',
        items: _lista(json['items'], LineaPedido.fromJson),
        total: _double(json['total']),
        bultos: _double(json['bultos']),
        tiempos: TiemposPedido.fromJson(_map(json['tiempos'])),
        createdAt: _strOpt(json['createdAt']) ?? '',
        confirmedAt: _strOpt(json['confirmedAt']),
        preparationStartedAt: _strOpt(json['preparationStartedAt']),
        preparedAt: _strOpt(json['preparedAt']),
        pickedUpAt: _strOpt(json['pickedUpAt']),
        deliveredAt: _strOpt(json['deliveredAt']),
      );

  static List<PedidoComprador> listFromJson(dynamic value) =>
      _listaSegura(value, PedidoComprador.fromJson);
}

class Cargador {
  const Cargador({
    required this.id,
    required this.nombre,
    required this.nivel,
    required this.puntos,
    required this.score,
    required this.recorridosCompletados,
    required this.calificacion,
  });

  final String id;
  final String nombre;
  final String nivel;
  final int puntos;
  final double score;
  final int recorridosCompletados;
  final double calificacion;

  factory Cargador.fromJson(Map<String, dynamic> json) => Cargador(
        id: _str(json, 'id'),
        nombre: _str(json, 'nombre'),
        nivel: _strOpt(json['nivel']) ?? 'Inicial',
        puntos: _intOpt(json['puntos']) ?? 0,
        score: _double(json['score']),
        recorridosCompletados: _intOpt(json['recorridosCompletados']) ?? 0,
        calificacion: _double(json['calificacion']),
      );
}

/// Estados de recorrido (mercado_recorridos.estado en el backend).
enum EstadoRecorrido {
  asignado('asignado', 'Asignado'),
  aceptado('aceptado', 'Aceptado'),
  rechazado('rechazado', 'Rechazado'),
  entregado('entregado', 'Entregado');

  const EstadoRecorrido(this.wire, this.label);

  final String wire;
  final String label;

  static EstadoRecorrido fromWire(String value) => values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw FormatException('Estado de recorrido desconocido: $value'),
      );
}

/// Estados de parada (mercado_recorrido_pedidos.estado en el backend).
enum EstadoParada {
  asignado('asignado', 'Asignado'),
  aceptado('aceptado', 'Aceptado'),
  retirado('retirado', 'Retirado'),
  entregado('entregado', 'Entregado');

  const EstadoParada(this.wire, this.label);

  final String wire;
  final String label;

  static EstadoParada fromWire(String value) => values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw FormatException('Estado de parada desconocido: $value'),
      );
}

class ParadaRecorrido {
  const ParadaRecorrido({
    required this.pedidoId,
    required this.tenantId,
    required this.puesto,
    required this.bultos,
    required this.estado,
    this.retiradoAt,
    this.entregadoAt,
  });

  final String pedidoId;
  final String tenantId;
  final String puesto;
  final double bultos;
  final EstadoParada estado;
  final String? retiradoAt;
  final String? entregadoAt;

  factory ParadaRecorrido.fromJson(Map<String, dynamic> json) => ParadaRecorrido(
        pedidoId: _str(json, 'pedidoId'),
        tenantId: _str(json, 'tenantId'),
        puesto: _str(json, 'puesto'),
        bultos: _double(json['bultos']),
        estado: EstadoParada.fromWire(_str(json, 'estado')),
        retiradoAt: _strOpt(json['retiradoAt']),
        entregadoAt: _strOpt(json['entregadoAt']),
      );
}

class Recorrido {
  const Recorrido({
    required this.id,
    required this.compradorId,
    required this.compradorNombre,
    required this.compradorTelefono,
    required this.cargadorId,
    required this.cargador,
    required this.estado,
    required this.bultos,
    required this.calificada,
    required this.paradas,
    required this.createdAt,
    this.deliveredAt,
  });

  final String id;
  final String compradorId;
  final String compradorNombre;
  final String compradorTelefono;
  final String cargadorId;
  final String cargador;
  final EstadoRecorrido estado;
  final double bultos;
  final bool calificada;
  final List<ParadaRecorrido> paradas;
  final String createdAt;
  final String? deliveredAt;

  factory Recorrido.fromJson(Map<String, dynamic> json) => Recorrido(
        id: _str(json, 'id'),
        compradorId: _str(json, 'compradorId'),
        compradorNombre: _str(json, 'compradorNombre'),
        compradorTelefono: _strOpt(json['compradorTelefono']) ?? '',
        cargadorId: _str(json, 'cargadorId'),
        cargador: _str(json, 'cargador'),
        estado: EstadoRecorrido.fromWire(_str(json, 'estado')),
        bultos: _double(json['bultos']),
        calificada: json['calificada'] == true,
        paradas: _lista(json['paradas'], ParadaRecorrido.fromJson),
        createdAt: _strOpt(json['createdAt']) ?? '',
        deliveredAt: _strOpt(json['deliveredAt']),
      );

  static List<Recorrido> listFromJson(dynamic value) =>
      _listaSegura(value, Recorrido.fromJson);
}

class Calificacion {
  const Calificacion({
    required this.id,
    required this.recorridoId,
    required this.estrellas,
    required this.comentario,
  });

  final String id;
  final String recorridoId;
  final int estrellas;
  final String comentario;

  factory Calificacion.fromJson(Map<String, dynamic> json) => Calificacion(
        id: _str(json, 'id'),
        recorridoId: _str(json, 'recorridoId'),
        estrellas: _intOpt(json['estrellas']) ?? 0,
        comentario: _strOpt(json['comentario']) ?? '',
      );
}

/// Documentos legales de la cuenta del canal (Parte B del contrato de
/// suscripción y legal). El backend resuelve qué ve cada perfil; la app
/// muestra los códigos tal como llegan y nunca decide vigencia ni hash.
class DocumentoLegal {
  const DocumentoLegal({
    required this.documentoId,
    required this.titulo,
    required this.tipo,
    required this.versionVigente,
    required this.hash,
    required this.estado,
    this.fechaAceptacion,
    this.versionAceptada,
  });

  final String documentoId;
  final String titulo;
  final String tipo;
  final int versionVigente;
  final String hash;

  /// 'pendiente' | 'aceptado' tal como lo emite el backend (contrato B.1).
  final String estado;
  final String? fechaAceptacion;
  final int? versionAceptada;

  bool get pendiente => estado == 'pendiente';

  factory DocumentoLegal.fromJson(Map<String, dynamic> json) => DocumentoLegal(
        documentoId: _str(json, 'documentoId'),
        titulo: _str(json, 'titulo'),
        tipo: _strOpt(json['tipo']) ?? '',
        versionVigente: _intOpt(json['versionVigente']) ?? 0,
        hash: _strOpt(json['hash']) ?? '',
        estado: _str(json, 'estado'),
        fechaAceptacion: _strOpt(json['fechaAceptacion']),
        versionAceptada: _intOpt(json['versionAceptada']),
      );

  static List<DocumentoLegal> listFromJson(dynamic value) =>
      _listaSegura(value, DocumentoLegal.fromJson);
}

/// Contenido de la versión vigente de un documento (contrato B.2). Toda copia
/// local conserva documentoId + version + hash: si el backend informa otra
/// vigente (409 al aceptar), la app descarta la copia y reconsulta.
class DocumentoLegalContenido {
  const DocumentoLegalContenido({
    required this.documentoId,
    required this.version,
    required this.hash,
    required this.titulo,
    required this.formato,
    required this.valor,
    this.fechaVigencia,
    this.miAceptacionVersion,
    this.miAceptacionFecha,
  });

  final String documentoId;
  final int version;
  final String hash;
  final String titulo;

  /// 'texto' | 'html' | 'pdf_url' tal como lo define el contrato B.2.
  final String formato;
  final String valor;
  final String? fechaVigencia;
  final int? miAceptacionVersion;
  final String? miAceptacionFecha;

  factory DocumentoLegalContenido.fromJson(Map<String, dynamic> json) {
    final contenido = _map(json['contenido']);
    final mi = _map(json['miAceptacion']);
    return DocumentoLegalContenido(
      documentoId: _str(json, 'documentoId'),
      version: _intOpt(json['version']) ?? 0,
      hash: _strOpt(json['hash']) ?? '',
      titulo: _strOpt(json['titulo']) ?? '',
      formato: _strOpt(contenido['formato']) ?? 'texto',
      valor: _strOpt(contenido['valor']) ?? '',
      fechaVigencia: _strOpt(json['fechaVigencia']),
      miAceptacionVersion: _intOpt(mi['version']),
      miAceptacionFecha: _strOpt(mi['fecha']),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers de parsing. Si el backend envía otra cosa, falla rápido con un
// mensaje claro en lugar de propagar nulls silenciosos.
// ---------------------------------------------------------------------------

Map<String, dynamic> _map(dynamic value) =>
    value is Map<String, dynamic> ? value : <String, dynamic>{};

List<T> _lista<T>(dynamic value, T Function(Map<String, dynamic>) parse) {
  if (value is! List) return const [];
  return value
      .whereType<Map<String, dynamic>>()
      .map(parse)
      .toList(growable: false);
}

/// Listado de primer nivel: omite entradas malformadas en lugar de romper
/// toda la pantalla por una sola fila corrupta.
List<T> _listaSegura<T>(dynamic value, T Function(Map<String, dynamic>) parse) {
  if (value is! List) return const [];
  final result = <T>[];
  for (final entry in value) {
    if (entry is! Map<String, dynamic>) continue;
    try {
      result.add(parse(entry));
    } on FormatException {
      continue;
    }
  }
  return List.unmodifiable(result);
}

String _str(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String && value.isNotEmpty) return value;
  throw FormatException('Campo faltante o inválido: $key');
}

String? _strOpt(dynamic value) => value is String && value.isNotEmpty ? value : null;

double _double(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) {
    final parsed = double.tryParse(value);
    if (parsed != null) return parsed;
  }
  throw FormatException('Número inválido');
}

int? _intOpt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  if (value is String) return int.tryParse(value);
  return null;
}

double? _doubleOpt(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}
