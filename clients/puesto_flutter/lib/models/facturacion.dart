class AfipConfig {
  const AfipConfig({
    required this.cuit,
    required this.razonSocial,
    required this.domicilio,
    required this.condicion,
    required this.puntoVenta,
    required this.inicioActividades,
    required this.iibb,
    required this.alicuota,
    required this.ambiente,
    required this.certCargado,
    required this.keyCargada,
    required this.lista,
    required this.habilitada,
  });

  final String cuit;
  final String razonSocial;
  final String domicilio;
  final String condicion;
  final int puntoVenta;
  final String inicioActividades;
  final String iibb;
  final double alicuota;
  final String ambiente;
  final bool certCargado;
  final bool keyCargada;
  final bool lista;
  final bool habilitada;

  factory AfipConfig.fromJson(Map<String, dynamic> json) => AfipConfig(
        cuit: json['cuit'] as String? ?? '',
        razonSocial: json['razonSocial'] as String? ?? '',
        domicilio: json['domicilio'] as String? ?? '',
        condicion: json['condicion'] as String? ?? '',
        puntoVenta: (json['puntoVenta'] as num?)?.toInt() ?? 0,
        inicioActividades: json['inicioActividades'] as String? ?? '',
        iibb: json['iibb'] as String? ?? '',
        alicuota: (json['alicuota'] as num?)?.toDouble() ?? 0,
        ambiente: json['ambiente'] as String? ?? 'homo',
        certCargado: json['certCargado'] as bool? ?? false,
        keyCargada: json['keyCargada'] as bool? ?? false,
        lista: json['lista'] as bool? ?? false,
        habilitada: json['habilitada'] as bool? ?? false,
      );

  static const vacio = AfipConfig(
    cuit: '',
    razonSocial: '',
    domicilio: '',
    condicion: '',
    puntoVenta: 0,
    inicioActividades: '',
    iibb: '',
    alicuota: 21,
    ambiente: 'homo',
    certCargado: false,
    keyCargada: false,
    lista: false,
    habilitada: false,
  );

  String get condicionLabel => switch (condicion) {
        'ri' => 'IVA Responsable Inscripto',
        'monotributo' => 'Responsable Monotributo',
        'exento' => 'IVA Sujeto Exento',
        'consumidor_final' => 'Consumidor Final',
        _ => condicion,
      };

  String get ambienteLabel =>
      ambiente == 'prod' ? 'Producción' : 'Homologación';
}

class FacturaLinea {
  const FacturaLinea({
    required this.nombre,
    required this.cantidad,
    required this.unidad,
    required this.neto,
    required this.iva,
    required this.total,
  });

  final String nombre;
  final double cantidad;
  final String unidad;
  final double neto;
  final double iva;
  final double total;

  factory FacturaLinea.fromJson(Map<String, dynamic> json) => FacturaLinea(
        nombre: json['nombre'] as String? ?? '',
        cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0,
        unidad: json['unidad'] as String? ?? '',
        neto: (json['neto'] as num?)?.toDouble() ?? 0,
        iva: (json['iva'] as num?)?.toDouble() ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
      );
}

class Factura {
  const Factura({
    required this.id,
    required this.cobroId,
    required this.origenId,
    required this.cbteTipo,
    required this.nombre,
    required this.puntoVenta,
    required this.numero,
    required this.fecha,
    required this.receptorNombre,
    required this.receptorCondicion,
    required this.emisorRazon,
    required this.emisorCuit,
    required this.emisorDomicilio,
    required this.emisorCondicion,
    required this.emisorIibb,
    required this.emisorInicio,
    required this.ambiente,
    required this.neto,
    required this.iva,
    required this.total,
    required this.alicuota,
    required this.cae,
    required this.caeVto,
    required this.estado,
    required this.error,
    required this.lineas,
    required this.qr,
    required this.qrUrl,
  });

  final String id;
  final String? cobroId;
  final String? origenId;
  final int cbteTipo;
  final String nombre;
  final int puntoVenta;
  final int? numero;
  final String fecha;
  final String? receptorNombre;
  final String? receptorCondicion;
  final String? emisorRazon;
  final String? emisorCuit;
  final String? emisorDomicilio;
  final String? emisorCondicion;
  final String? emisorIibb;
  final String? emisorInicio;
  final String ambiente;
  final double neto;
  final double iva;
  final double total;
  final double alicuota;
  final String? cae;
  final String? caeVto;
  final String estado;
  final String? error;
  final List<FacturaLinea> lineas;
  final String? qr;
  final String? qrUrl;

  bool get esNotaCredito => [3, 8, 13].contains(cbteTipo);

  String get numeroFiscal {
    if (numero == null) return '—';
    final pv = puntoVenta.toString().padLeft(4, '0');
    final n = numero.toString().padLeft(8, '0');
    return '$pv-$n';
  }

  factory Factura.fromJson(Map<String, dynamic> json) => Factura(
        id: json['id'] as String? ?? '',
        cobroId: json['cobroId'] as String?,
        origenId: json['origenId'] as String?,
        cbteTipo: (json['cbteTipo'] as num?)?.toInt() ?? 0,
        nombre: json['nombre'] as String? ?? '',
        puntoVenta: (json['puntoVenta'] as num?)?.toInt() ?? 0,
        numero: (json['numero'] as num?)?.toInt(),
        fecha: json['fecha'] as String? ?? '',
        receptorNombre: json['receptorNombre'] as String?,
        receptorCondicion: json['receptorCondicion'] as String?,
        emisorRazon: json['emisorRazon'] as String?,
        emisorCuit: json['emisorCuit'] as String?,
        emisorDomicilio: json['emisorDomicilio'] as String?,
        emisorCondicion: json['emisorCondicion'] as String?,
        emisorIibb: json['emisorIibb'] as String?,
        emisorInicio: json['emisorInicio'] as String?,
        ambiente: json['ambiente'] as String? ?? 'homo',
        neto: (json['neto'] as num?)?.toDouble() ?? 0,
        iva: (json['iva'] as num?)?.toDouble() ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
        alicuota: (json['alicuota'] as num?)?.toDouble() ?? 0,
        cae: json['cae'] as String?,
        caeVto: json['caeVto'] as String?,
        estado: json['estado'] as String? ?? '',
        error: json['error'] as String?,
        lineas: [
          for (final item in (json['lineas'] as List? ?? const []))
            FacturaLinea.fromJson(item as Map<String, dynamic>),
        ],
        qr: json['qr'] as String?,
        qrUrl: json['qrUrl'] as String?,
      );
}

class CobroPendiente {
  const CobroPendiente({
    required this.id,
    required this.monto,
    required this.createdAt,
    required this.cliente,
    required this.numero,
    required this.error,
  });

  final String id;
  final double monto;
  final String createdAt;
  final String cliente;
  final int? numero;
  final String? error;

  factory CobroPendiente.fromJson(Map<String, dynamic> json) =>
      CobroPendiente(
        id: json['id'] as String? ?? '',
        monto: (json['monto'] as num?)?.toDouble() ?? 0,
        createdAt: json['createdAt'] as String? ?? '',
        cliente: json['cliente'] as String? ?? '',
        numero: (json['numero'] as num?)?.toInt(),
        error: json['error'] as String?,
      );
}

class FacturacionPanel {
  const FacturacionPanel({
    required this.config,
    required this.pendientes,
    required this.emitidas,
  });

  final AfipConfig config;
  final List<CobroPendiente> pendientes;
  final List<Factura> emitidas;

  factory FacturacionPanel.fromJson(Map<String, dynamic> json) =>
      FacturacionPanel(
        config: AfipConfig.fromJson(
            json['config'] as Map<String, dynamic>? ?? const {}),
        pendientes: [
          for (final item in (json['pendientes'] as List? ?? const []))
            CobroPendiente.fromJson(item as Map<String, dynamic>),
        ],
        emitidas: [
          for (final item in (json['emitidas'] as List? ?? const []))
            Factura.fromJson(item as Map<String, dynamic>),
        ],
      );
}

class AfipProbarResultado {
  const AfipProbarResultado({
    required this.app,
    required this.db,
    required this.auth,
    required this.login,
  });

  final String? app;
  final String? db;
  final String? auth;
  final bool login;

  factory AfipProbarResultado.fromJson(Map<String, dynamic> json) =>
      AfipProbarResultado(
        app: json['app'] as String?,
        db: json['db'] as String?,
        auth: json['auth'] as String?,
        login: json['login'] as bool? ?? false,
      );
}
