import 'package:flutter_test/flutter_test.dart';
import 'package:mercado_al_toque/models.dart';

void main() {
  group('MercadoActor', () {
    test('parsea comprador con identidad cargada', () {
      final actor = MercadoActor.fromJson({
        'id': 'usr_1',
        'nombre': 'Eva Compradora',
        'email': 'eva@test',
        'perfil': 'comprador',
        'estadoIdentidad': 'documentacion_cargada',
      });

      expect(actor.esComprador, isTrue);
      expect(actor.puedeComprar, isTrue);
      expect(actor.estadoCuenta, isNull);
      expect(actor.disponibilidad, isNull);
    });

    test('parsea cargador con extras snake_case de /yo', () {
      final actor = MercadoActor.fromJson({
        'id': 'usr_2',
        'nombre': 'Cari Cargador',
        'email': 'cari@test',
        'perfil': 'cargador',
        'estado_cuenta': 'activo',
        'disponibilidad': 'disponible',
        'puntos': 7,
        'score': 4.5,
      });

      expect(actor.esComprador, isFalse);
      expect(actor.estadoCuenta, 'activo');
      expect(actor.estaDisponible, isTrue);
      expect(actor.puntos, 7);
      expect(actor.score, 4.5);
    });

    test('comprador sin identidad no puede comprar', () {
      final actor = MercadoActor.fromJson({
        'id': 'usr_3',
        'nombre': 'Sin Dni',
        'email': 'sin@test',
        'perfil': 'comprador',
        'estadoIdentidad': 'pendiente',
      });

      expect(actor.puedeComprar, isFalse);
    });
  });

  group('PedidoComprador', () {
    const pedidoConfirmado = {
      'id': 'ped_1',
      'tenantId': 'tnt_1',
      'puesto': 'Frutas Roman',
      'estado': 'confirmado',
      'nota': 'sin bolsa',
      'medioPago': 'efectivo',
      'pagoEstado': 'pendiente',
      'items': [
        {
          'productoId': 'prd_1',
          'nombre': 'Banana',
          'cantidad': 2,
          'precioUnitario': 1500.5,
          'unidad': 'kg',
          'unidadLabel': 'kg',
          'subtotal': 3001,
        }
      ],
      'total': 3001,
      'bultos': 1,
      'tiempos': {'preparacion': 5, 'espera': 10, 'entrega': 3, 'total': 18},
      'createdAt': '2026-10-07T10:00:00.000Z',
      'confirmedAt': '2026-10-07T10:00:01.000Z',
    };

    test('parsea pedido confirmado con items y tiempos', () {
      final pedido = PedidoComprador.fromJson(pedidoConfirmado);

      expect(pedido.estado, EstadoPedidoComprador.confirmado);
      expect(pedido.total, 3001);
      expect(pedido.bultos, 1);
      expect(pedido.items.single.nombre, 'Banana');
      expect(pedido.items.single.precioUnitario, 1500.5);
      expect(pedido.tiempos.total, 18);
      expect(pedido.confirmedAt, isNotNull);
      expect(pedido.deliveredAt, isNull);
    });

    test('mapea cada estado que publica el backend al comprador', () {
      Map<String, dynamic> conEstado(String estado) => {
            ...pedidoConfirmado,
            'estado': estado,
          };

      expect(
        PedidoComprador.fromJson(conEstado('en_preparacion')).estado,
        EstadoPedidoComprador.enPreparacion,
      );
      expect(
        PedidoComprador.fromJson(conEstado('preparado')).estado,
        EstadoPedidoComprador.preparado,
      );
      expect(
        PedidoComprador.fromJson(conEstado('retirado')).estado,
        EstadoPedidoComprador.retirado,
      );
      expect(
        PedidoComprador.fromJson(conEstado('entregado')).estado,
        EstadoPedidoComprador.entregado,
      );
      expect(
        PedidoComprador.fromJson(conEstado('cancelado')).estado,
        EstadoPedidoComprador.cancelado,
      );
    });

    test('rechaza estado desconocido en lugar de colarse', () {
      expect(
        () => PedidoComprador.fromJson({
          ...pedidoConfirmado,
          'estado': 'volando',
        }),
        throwsFormatException,
      );
    });

    test('listFromJson ignora entradas malformadas', () {
      final pedidos = PedidoComprador.listFromJson([
        pedidoConfirmado,
        {'basura': true},
      ]);

      expect(pedidos, hasLength(1));
      expect(pedidos.single.id, 'ped_1');
    });
  });

  group('Recorrido', () {
    const recorridoAsignado = {
      'id': 'mre_1',
      'compradorId': 'usr_1',
      'compradorNombre': 'Eva Compradora',
      'compradorTelefono': '+54 9 11 1234',
      'cargadorId': 'usr_2',
      'cargador': 'Cari Cargador',
      'estado': 'asignado',
      'bultos': 3,
      'calificada': false,
      'paradas': [
        {
          'pedidoId': 'ped_1',
          'tenantId': 'tnt_1',
          'puesto': 'Frutas Roman',
          'bultos': 3,
          'estado': 'asignado',
        }
      ],
      'createdAt': '2026-10-07T11:00:00.000Z',
    };

    test('parsea recorrido con paradas y teléfono del comprador', () {
      final recorrido = Recorrido.fromJson(recorridoAsignado);

      expect(recorrido.estado, EstadoRecorrido.asignado);
      expect(recorrido.calificada, isFalse);
      expect(recorrido.compradorTelefono, '+54 9 11 1234');
      expect(recorrido.paradas.single.estado, EstadoParada.asignado);
      expect(recorrido.paradas.single.bultos, 3);
    });

    test('recorrido entregado y calificado', () {
      final recorrido = Recorrido.fromJson({
        ...recorridoAsignado,
        'estado': 'entregado',
        'calificada': true,
        'deliveredAt': '2026-10-07T12:00:00.000Z',
        'paradas': [
          {
            ...(recorridoAsignado['paradas'] as List).first
                as Map<String, dynamic>,
            'estado': 'entregado',
            'retiradoAt': '2026-10-07T11:30:00.000Z',
            'entregadoAt': '2026-10-07T12:00:00.000Z',
          }
        ],
      });

      expect(recorrido.estado, EstadoRecorrido.entregado);
      expect(recorrido.calificada, isTrue);
      expect(recorrido.paradas.single.estado, EstadoParada.entregado);
      expect(recorrido.paradas.single.retiradoAt, isNotNull);
    });

    test('rechaza estado de recorrido desconocido', () {
      expect(
        () => Recorrido.fromJson({
          ...recorridoAsignado,
          'estado': 'en_la_luna',
        }),
        throwsFormatException,
      );
    });
  });

  group('Puesto y Producto', () {
    test('puestos del listado', () {
      final puesto = Puesto.fromJson({
        'id': 'tnt_1',
        'nombre': 'Frutas Roman',
        'bajada': 'Frutas y verduras de estación',
      });

      expect(puesto.nombre, 'Frutas Roman');
      expect(puesto.bajada, isNotEmpty);
    });

    test('productos con precio numérico y stock', () {
      final producto = Producto.fromJson({
        'id': 'prd_1',
        'nombre': 'Pera',
        'precio': 1200,
        'disponible': 25.5,
        'unidad': 'kg',
        'unidadLabel': 'kg',
      });

      expect(producto.precio, 1200);
      expect(producto.disponible, 25.5);
    });

    test('precio como string del backend también parsea', () {
      final producto = Producto.fromJson({
        'id': 'prd_2',
        'nombre': 'Naranja',
        'precio': '900.25',
        'disponible': 0,
        'unidad': 'kg',
        'unidadLabel': 'kg',
      });

      expect(producto.precio, 900.25);
      expect(producto.disponible, 0);
    });

    test('campo faltante obligatorio falla con mensaje claro', () {
      expect(
        () => Puesto.fromJson({'id': 'tnt_1', 'bajada': ''}),
        throwsFormatException,
      );
    });
  });

  group('Cargador', () {
    test('parsea ficha del listado de cargadores', () {
      final cargador = Cargador.fromJson({
        'id': 'usr_2',
        'nombre': 'Cari Cargador',
        'nivel': 'Inicial',
        'puntos': 7,
        'score': 4.5,
        'recorridosCompletados': 7,
        'calificacion': 4.5,
      });

      expect(cargador.puntos, 7);
      expect(cargador.recorridosCompletados, 7);
      expect(cargador.calificacion, 4.5);
    });
  });

  group('RankingCargador', () {
    const sinMetricas = <String, dynamic>{'nombre': 'Sin Métricas'};

    test('parsea la ficha del ranking y numera por índice', () {
      final ranking = RankingCargador.listFromJson([
        {
          'id': 'usr_2',
          'nombre': 'Cari',
          'nivel': 'Oro',
          'puntos': 420,
          'score': 4.75,
          'recorridosCompletados': 38,
          'calificacion': 4.6,
        },
        {
          'id': 'usr_3',
          'nombre': 'Cacho',
          'nivel': 'Bronce',
          'puntos': 60,
          'score': 4.1,
          'recorridosCompletados': 9,
          'calificacion': 4,
        },
      ]);

      expect(ranking, hasLength(2));
      expect(ranking.first.puesto, 1);
      expect(ranking.last.puesto, 2);
      expect(ranking.first.nivel, 'Oro');
      expect(ranking.first.puntos, 420);
      expect(ranking.first.score, 4.75);
      expect(ranking.first.recorridosCompletados, 38);
      expect(ranking.first.calificacion, 4.6);
    });

    test('un campo ausente cae al valor por defecto', () {
      final item = RankingCargador.fromJson(sinMetricas, puesto: 7);

      expect(item.puesto, 7);
      expect(item.id, isEmpty);
      expect(item.nombre, 'Sin Métricas');
      expect(item.nivel, 'Inicial');
      expect(item.puntos, 0);
      expect(item.score, 0);
      expect(item.recorridosCompletados, 0);
      expect(item.calificacion, 0);
    });

    test('respeta el puesto del servidor y descarta entradas inválidas', () {
      final ranking = RankingCargador.listFromJson([
        {'puesto': 12, 'nombre': 'Cari', 'puntos': '40'},
        'basura',
        {'nombre': 'Cacho'},
      ]);

      expect(ranking, hasLength(2));
      expect(ranking.first.puesto, 12);
      expect(ranking.first.puntos, 40);
      expect(ranking.last.puesto, 2);
    });

    test('una respuesta sin listado devuelve vacío', () {
      expect(RankingCargador.listFromJson(null), isEmpty);
      expect(RankingCargador.listFromJson({'cargadores': []}), isEmpty);
    });
  });

  group('Aviso', () {
    const avisoLlegada = {
      'id': 'bnr_1',
      'tenantNombre': 'Frutas Roman',
      'plantilla': 'llegada',
      'titulo': 'Recién llegado',
      'detalle': 'Mandarinas de temporada',
      'precio': null,
      'unidadLabel': null,
      'endsOn': '2026-12-01',
    };

    test('parsea el aviso enriquecido con precio y unidad', () {
      final aviso = Aviso.fromJson({
        ...avisoLlegada,
        'plantilla': 'precio',
        'precio': 123.45,
        'unidadLabel': 'kg',
      });

      expect(aviso.id, 'bnr_1');
      expect(aviso.tenantNombre, 'Frutas Roman');
      expect(aviso.plantilla, 'precio');
      expect(aviso.titulo, 'Recién llegado');
      expect(aviso.detalle, 'Mandarinas de temporada');
      expect(aviso.precio, 123.45);
      expect(aviso.unidadLabel, 'kg');
      expect(aviso.endsOn, '2026-12-01');
    });

    test('precio y unidadLabel en null no rompen el parseo', () {
      final aviso = Aviso.fromJson(avisoLlegada);

      expect(aviso.precio, isNull);
      expect(aviso.unidadLabel, isNull);
    });

    test('un campo ausente cae al valor por defecto', () {
      final aviso = Aviso.fromJson({'titulo': 'Oferta'});

      expect(aviso.titulo, 'Oferta');
      expect(aviso.id, isEmpty);
      expect(aviso.tenantNombre, isEmpty);
      expect(aviso.plantilla, isEmpty);
      expect(aviso.detalle, isEmpty);
      expect(aviso.endsOn, isEmpty);
      expect(aviso.precio, isNull);
    });

    test('el precio numérico en string también parsea', () {
      expect(Aviso.fromJson({'precio': '900.25'}).precio, 900.25);
    });

    test('listFromJson descarta entradas inválidas y tolera basura', () {
      expect(Aviso.listFromJson([avisoLlegada, 'basura']), hasLength(1));
      expect(Aviso.listFromJson(null), isEmpty);
      expect(Aviso.listFromJson({'avisos': []}), isEmpty);
    });
  });

  group('Estados', () {
    test('fromWire de enums usa labels consistentes', () {
      expect(EstadoParada.retirado.wire, 'retirado');
      expect(EstadoParada.retirado.label, 'Retirado');
      expect(EstadoRecorrido.aceptado.wire, 'aceptado');
      expect(EstadoPedidoComprador.enPreparacion.wire, 'en_preparacion');
    });
  });

  group('DocumentoLegal', () {
    test('parsea listado B.1 con estado pendiente', () {
      final documento = DocumentoLegal.fromJson({
        'documentoId': 'terminos_comprador',
        'titulo': 'Términos del comprador',
        'tipo': 'terminos',
        'versionVigente': 3,
        'hash': 'abc123',
        'estado': 'pendiente',
      });

      expect(documento.pendiente, isTrue);
      expect(documento.versionVigente, 3);
      expect(documento.hash, 'abc123');
      expect(documento.fechaAceptacion, isNull);
    });

    test('parsea documento ya aceptado con versión aceptada', () {
      final documento = DocumentoLegal.fromJson({
        'documentoId': 'terminos_comprador',
        'titulo': 'Términos del comprador',
        'tipo': 'terminos',
        'versionVigente': 3,
        'hash': 'abc123',
        'estado': 'aceptado',
        'versionAceptada': 2,
        'fechaAceptacion': '2026-10-01T10:00:00.000Z',
      });

      expect(documento.pendiente, isFalse);
      expect(documento.versionAceptada, 2);
      expect(documento.fechaAceptacion, isNotNull);
    });

    test('listFromJson ignora entradas malformadas', () {
      final documentos = DocumentoLegal.listFromJson([
        {
          'documentoId': 'terminos_comprador',
          'titulo': 'Términos',
          'estado': 'pendiente',
        },
        {'basura': true},
      ]);

      expect(documentos, hasLength(1));
      expect(documentos.single.documentoId, 'terminos_comprador');
    });
  });

  group('DocumentoLegalContenido', () {
    test('parsea contenido B.2 en texto sin aceptación previa', () {
      final contenido = DocumentoLegalContenido.fromJson({
        'documentoId': 'terminos_comprador',
        'version': 3,
        'hash': 'abc123',
        'titulo': 'Términos del comprador',
        'fechaVigencia': '2026-10-01',
        'contenido': {'formato': 'texto', 'valor': 'Texto de los términos.'},
      });

      expect(contenido.version, 3);
      expect(contenido.hash, 'abc123');
      expect(contenido.formato, 'texto');
      expect(contenido.valor, 'Texto de los términos.');
      expect(contenido.miAceptacionVersion, isNull);
    });

    test('parsea miAceptacion y formato pdf_url', () {
      final contenido = DocumentoLegalContenido.fromJson({
        'documentoId': 'privacidad_comprador',
        'version': 1,
        'hash': 'def456',
        'titulo': 'Privacidad',
        'contenido': {
          'formato': 'pdf_url',
          'valor': 'https://example.com/p.pdf',
        },
        'miAceptacion': {'version': 1, 'fecha': '2026-10-02T09:00:00.000Z'},
      });

      expect(contenido.formato, 'pdf_url');
      expect(contenido.valor, 'https://example.com/p.pdf');
      expect(contenido.miAceptacionVersion, 1);
      expect(contenido.miAceptacionFecha, isNotNull);
    });
  });
}
