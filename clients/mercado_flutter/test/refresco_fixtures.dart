import 'dart:async';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mercado_al_toque/market_api.dart';
import 'package:mercado_al_toque/models.dart';
import 'package:mercado_al_toque/screens/stands_screen.dart';

Future<http.Response> _sinRed(http.BaseRequest request) =>
    throw StateError('La prueba no debe salir a la red');

/// API falsa con un contador por endpoint: en estas pruebas importa cuántas
/// veces se pidió cada lista, además de lo que devolvió.
class ApiFake extends MercadoApi {
  ApiFake({
    this.puestos = const [],
    this.avisos = const [],
    this.catalogo = const [],
    this.pedidos = const [],
    this.recorridos = const [],
    this.pedido,
  }) : super(client: MockClient(_sinRed));

  List<Puesto> puestos;
  List<Aviso> avisos;
  List<Producto> catalogo;
  List<PedidoComprador> pedidos;
  List<Recorrido> recorridos;
  PedidoComprador? pedido;

  /// Puesto, deja colgado cada endpoint: así se comprueba que el sondeo y el
  /// gesto del usuario no apilan dos recargas.
  Completer<void>? freno;

  int puestosLlamadas = 0;
  int avisosLlamadas = 0;
  int catalogoLlamadas = 0;
  int pedidosLlamadas = 0;
  int recorridosLlamadas = 0;
  int pedidoLlamadas = 0;

  Future<void> _esperarFreno() async {
    final freno = this.freno;
    if (freno != null) await freno.future;
  }

  @override
  Future<List<Puesto>> listarPuestos({bool force = false}) async {
    puestosLlamadas++;
    await _esperarFreno();
    return puestos;
  }

  @override
  Future<List<Aviso>> listarAvisos() async {
    avisosLlamadas++;
    await _esperarFreno();
    return avisos;
  }

  @override
  Future<ProductRead> products(String tenantId, {bool force = false}) async {
    catalogoLlamadas++;
    await _esperarFreno();
    return ProductRead(
      products: catalogo,
      readAt: DateTime(2026, 10, 7, 10),
      isStale: false,
    );
  }

  @override
  Future<List<PedidoComprador>> listarPedidosComprador() async {
    pedidosLlamadas++;
    await _esperarFreno();
    return pedidos;
  }

  @override
  Future<List<Recorrido>> listarRecorridos() async {
    recorridosLlamadas++;
    await _esperarFreno();
    return recorridos;
  }

  @override
  Future<PedidoComprador> obtenerPedidoComprador(String pedidoId) async {
    pedidoLlamadas++;
    await _esperarFreno();
    return pedido ?? pedidoComprador();
  }
}

/// API que siempre falla: así se ve que el sondeo no suelta la excepción.
class ApiSinRed extends MercadoApi {
  ApiSinRed() : super(client: MockClient(_sinRed));

  int recorridosLlamadas = 0;

  @override
  Future<List<Recorrido>> listarRecorridos() async {
    recorridosLlamadas++;
    throw const MercadoApiException(
      'No hay conexión con el servidor.',
      kind: ApiErrorKind.red,
    );
  }
}

const puestoFijo = Puesto(
  id: 'tnt_1',
  nombre: 'Frutas Roman',
  bajada: 'Frutas de estación',
);

const avisoPrecio = Aviso(
  id: 'bnr_1',
  tenantNombre: 'Puesto La Verde',
  plantilla: 'precio',
  titulo: 'Bajo precio',
  detalle: 'Banana por kilo',
  precio: 123.45,
  unidadLabel: 'kg',
  endsOn: '2026-11-30',
);

const banana = Producto(
  id: 'prd_1',
  nombre: 'Banana',
  precio: 1500.5,
  disponible: 12,
  unidad: 'kg',
  unidadLabel: 'kg',
);

PedidoComprador pedidoComprador({String estado = 'confirmado'}) =>
    PedidoComprador.fromJson({
      'id': 'ped_1',
      'tenantId': 'tnt_1',
      'puesto': 'Frutas Roman',
      'estado': estado,
      'nota': '',
      'medioPago': 'efectivo',
      'pagoEstado': 'pendiente',
      'items': const <Map<String, dynamic>>[],
      'total': 3001,
      'bultos': 1,
      'tiempos': {'preparacion': 5, 'espera': 10, 'entrega': 3, 'total': 18},
      'createdAt': '2026-10-07T10:00:00.000Z',
    });

Recorrido recorrido({String estado = 'asignado'}) => Recorrido.fromJson({
  'id': 'rec_1',
  'compradorId': 'usr_1',
  'compradorNombre': 'Ana Pérez',
  'compradorTelefono': '9 11 5555-5555',
  'cargadorId': 'usr_2',
  'cargador': 'Carlos Gómez',
  'estado': estado,
  'bultos': 2,
  'calificada': false,
  'paradas': [
    {
      'pedidoId': 'ped_1',
      'tenantId': 'tnt_1',
      'puesto': 'Frutas Roman',
      'bultos': 2,
      'estado': 'asignado',
    },
  ],
  'createdAt': '2026-10-07T10:00:00.000Z',
});

MercadoActor cargadorActor() => MercadoActor.fromJson({
  'id': 'usr_2',
  'nombre': 'Carlos Gómez',
  'email': 'cargador@test',
  'perfil': 'cargador',
  'disponibilidad': 'disponible',
});

MercadoActor compradorActor() => MercadoActor.fromJson({
  'id': 'usr_1',
  'nombre': 'Ana Pérez',
  'email': 'ana@test',
  'perfil': 'comprador',
  'estadoIdentidad': 'documentacion_cargada',
});

void _noAgrega({
  required String tenantId,
  required String tenantName,
  required Producto product,
  required DateTime readAt,
  required bool stale,
}) {}

/// Las pantallas van en el Scaffold que usan en la app: ListTile exige un
/// Material por encima.
Widget anclado(Widget screen) => MaterialApp(home: Scaffold(body: screen));

Widget puestosScreen(ApiFake api, Duration cada) => anclado(
  StandsScreen(
    api: api,
    actor: compradorActor(),
    refrescoCada: cada,
    onAdd: _noAgrega,
  ),
);
