import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mercado_al_toque/market_api.dart';
import 'package:mercado_al_toque/models.dart';
import 'package:mercado_al_toque/screens/buyer_orders_screen.dart';
import 'package:mercado_al_toque/screens/courier_screen.dart';
import 'package:mercado_al_toque/screens/order_detail_screen.dart';
import 'package:mercado_al_toque/screens/profile_screen.dart';
import 'package:mercado_al_toque/screens/stands_screen.dart';

Future<http.Response> _fueraDeRed(http.BaseRequest request) async =>
    throw StateError('La prueba no debe salir a la red');

/// Extiende MercadoApi y responde datos fijos: las pantallas se prueban sin
/// red y sin secure storage (ninguna llamada toca los métodos con storage).
class ApiFalsa extends MercadoApi {
  ApiFalsa({this.puestos = const [], this.catalogo = const []})
    : super(client: MockClient(_fueraDeRed));

  final List<Puesto> puestos;
  final List<Producto> catalogo;

  @override
  Future<List<Puesto>> listarPuestos({bool force = false}) async => puestos;

  @override
  Future<ProductRead> products(String tenantId, {bool force = false}) async =>
      ProductRead(
        products: catalogo,
        readAt: DateTime(2026, 10, 7, 10),
        isStale: false,
      );

  @override
  Future<List<PedidoComprador>> listarPedidosComprador() async => pedidosFijos;

  @override
  Future<List<Recorrido>> listarRecorridos() async => recorridosFijos;

  @override
  Future<List<Cargador>> listarCargadores() async => const [];

  @override
  Future<PedidoComprador> obtenerPedidoComprador(String pedidoId) async =>
      PedidoComprador.fromJson(pedidoMap(estado: 'confirmado'));

  @override
  Future<List<DocumentoLegal>> listarDocumentosLegales() async {
    final error = errorListado;
    if (error != null) throw error;
    return documentosFijos;
  }

  @override
  Future<DocumentoLegalContenido> obtenerDocumentoLegal(
    String documentoId, {
    bool force = false,
  }) async => contenidoFijo!;

  @override
  Future<Map<String, dynamic>> aceptarDocumentoLegal({
    required String userId,
    required String documentoId,
    required int version,
    required String hash,
  }) async {
    final error = errorAceptar;
    if (error != null) throw error;
    aceptaciones.add((documentoId: documentoId, version: version, hash: hash));
    return {
      'documentoId': documentoId,
      'version': version,
      'estado': 'aceptado',
      'fecha': '2026-10-07T12:00:00.000Z',
    };
  }
}

const puestoFijo = Puesto(
  id: 'tnt_1',
  nombre: 'Frutas Roman',
  bajada: 'Frutas de estación',
);

const banana = Producto(
  id: 'prd_1',
  nombre: 'Banana',
  precio: 1500.5,
  disponible: 12,
  unidad: 'kg',
  unidadLabel: 'kg',
);

Map<String, dynamic> pedidoMap({String id = 'ped_1', String estado = 'preparado'}) =>
    {
      'id': id,
      'tenantId': 'tnt_1',
      'puesto': 'Frutas Roman',
      'estado': estado,
      'nota': '',
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
        },
      ],
      'total': 3001,
      'bultos': 1,
      'tiempos': {'preparacion': 5, 'espera': 10, 'entrega': 3, 'total': 18},
      'createdAt': '2026-10-07T10:00:00.000Z',
    };

Map<String, dynamic> recorridoMap({
  String id = 'rec_1',
  String estado = 'asignado',
  String estadoParada = 'asignado',
}) => {
  'id': id,
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
      'estado': estadoParada,
    },
  ],
  'createdAt': '2026-10-07T10:00:00.000Z',
};

List<PedidoComprador> pedidosFijos = [];
List<Recorrido> recorridosFijos = [];
List<DocumentoLegal> documentosFijos = const [];
DocumentoLegalContenido? contenidoFijo;
MercadoApiException? errorListado;
MercadoApiException? errorAceptar;
final aceptaciones = <({String documentoId, int version, String hash})>[];

Map<String, dynamic> cargadorPerfilMap() => {
  'id': 'usr_2',
  'nombre': 'Carlos Gómez',
  'email': 'cargador@test',
  'perfil': 'cargador',
  'pais': 'AR',
};

const documentoPendienteFijo = DocumentoLegal(
  documentoId: 'terminos_cuenta',
  titulo: 'Términos de la cuenta',
  tipo: 'terminos',
  versionVigente: 3,
  hash: 'abc123',
  estado: 'pendiente',
);

const contenidoFijoV3 = DocumentoLegalContenido(
  documentoId: 'terminos_cuenta',
  version: 3,
  hash: 'abc123',
  titulo: 'Términos de la cuenta',
  formato: 'texto',
  valor: 'Texto de los términos.',
);

MercadoActor cargadorActor() => MercadoActor.fromJson({
  'id': 'usr_2',
  'nombre': 'Carlos Gómez',
  'email': 'cargador@test',
  'perfil': 'cargador',
  'disponibilidad': 'disponible',
});

/// Las pantallas van embebidas en el Scaffold de market_home: los tests
/// reproducen ese anclaje para tener el Material que ListTile exige.
Widget anclado(Widget screen) => MaterialApp(home: Scaffold(body: screen));

void main() {
  setUp(() {
    pedidosFijos = [];
    recorridosFijos = [];
    documentosFijos = const [];
    contenidoFijo = null;
    errorListado = null;
    errorAceptar = null;
    aceptaciones.clear();
  });

  testWidgets('StandsScreen lista puestos y agrega producto con stock', (
    tester,
  ) async {
    Producto? agregado;
    await tester.pumpWidget(
      anclado(
        StandsScreen(
          api: ApiFalsa(puestos: [puestoFijo], catalogo: [banana]),
          onAdd: ({required tenantId, required tenantName, required product, required readAt, required stale}) =>
              agregado = product,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Frutas Roman'), findsOneWidget);
    await tester.tap(find.text('Frutas Roman'));
    await tester.pumpAndSettle();

    expect(find.text('Banana'), findsOneWidget);
    expect(find.textContaining('Disponible: 12'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add_shopping_cart));
    expect(agregado?.id, 'prd_1');
  });

  testWidgets('StandsScreen deshabilita el alta sin stock', (tester) async {
    var llamadas = 0;
    await tester.pumpWidget(
      anclado(
        StandsScreen(
          api: ApiFalsa(
            puestos: [puestoFijo],
            catalogo: [
              const Producto(
                id: 'prd_1',
                nombre: 'Banana',
                precio: 1500.5,
                disponible: 0,
                unidad: 'kg',
                unidadLabel: 'kg',
              ),
            ],
          ),
          onAdd: ({required tenantId, required tenantName, required product, required readAt, required stale}) =>
              llamadas++,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Frutas Roman'));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.add_shopping_cart));
    expect(llamadas, 0);
  });

  testWidgets('CourierScreen muestra sólo acciones válidas por estado', (
    tester,
  ) async {
    recorridosFijos = [
      Recorrido.fromJson(recorridoMap(id: 'rec_1')),
      Recorrido.fromJson(
        recorridoMap(id: 'rec_2', estado: 'aceptado', estadoParada: 'aceptado'),
      ),
      Recorrido.fromJson(
        recorridoMap(id: 'rec_3', estado: 'aceptado', estadoParada: 'retirado'),
      ),
    ];
    await tester.pumpWidget(
      anclado(CourierScreen(api: ApiFalsa(), actor: cargadorActor())),
    );
    await tester.pumpAndSettle();

    expect(find.text('Disponible para recorridos'), findsOneWidget);
    expect(find.text('Aceptar'), findsOneWidget);
    expect(find.text('Rechazar'), findsOneWidget);
    expect(find.text('Retiré'), findsOneWidget);
    expect(find.text('Entregué'), findsOneWidget);
  });

  testWidgets('BuyerOrdersScreen habilita armar recorrido al seleccionar', (
    tester,
  ) async {
    pedidosFijos = [
      PedidoComprador.fromJson(pedidoMap(id: 'ped_1', estado: 'preparado')),
      PedidoComprador.fromJson(pedidoMap(id: 'ped_2', estado: 'confirmado')),
    ];
    await tester.pumpWidget(
      anclado(BuyerOrdersScreen(api: ApiFalsa(), actor: cargadorActor())),
    );
    await tester.pumpAndSettle();

    expect(find.text('Preparados para retiro'), findsOneWidget);
    final boton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Armar recorrido con estos pedidos'),
    );
    expect(boton.onPressed, isNull);

    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    final botonActivo = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Armar recorrido con estos pedidos'),
    );
    expect(botonActivo.onPressed, isNotNull);
  });

  testWidgets('OrderDetailScreen muestra estado, items e hitos', (tester) async {
    await tester.pumpWidget(
      anclado(OrderDetailScreen(api: ApiFalsa(), pedidoId: 'ped_1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Confirmado'), findsOneWidget);
    expect(find.text('Banana'), findsOneWidget);
    expect(find.text('Tiempos estimados'), findsOneWidget);
    expect(find.text('Pedido creado'), findsOneWidget);

    // Desmonta para cancelar el timer de seguimiento antes de cerrar el test.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Perfil lista documentos legales y acepta la versión vigente', (
    tester,
  ) async {
    documentosFijos = [documentoPendienteFijo];
    contenidoFijo = contenidoFijoV3;
    await tester.pumpWidget(
      anclado(
        ProfileScreen(
          api: ApiFalsa(),
          actor: cargadorPerfilMap(),
          onRefresh: () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Términos de la cuenta'), findsOneWidget);
    expect(find.text('Pendiente'), findsOneWidget);

    await tester.tap(find.byKey(const Key('legal_doc_terminos_cuenta')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('legal_hoja')), findsOneWidget);
    expect(find.text('Texto de los términos.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('legal_aceptar')));
    await tester.pumpAndSettle();

    expect(aceptaciones, hasLength(1));
    expect(aceptaciones.single.documentoId, 'terminos_cuenta');
    expect(aceptaciones.single.version, 3);
    expect(aceptaciones.single.hash, 'abc123');
    expect(find.text('Aceptaste la versión 3.'), findsOneWidget);
    expect(find.byKey(const Key('legal_hoja')), findsNothing);
  });

  testWidgets('Perfil avisa cuando aún no hay documentos publicados', (
    tester,
  ) async {
    errorListado = const MercadoApiException(
      'Sin documentos publicados.',
      statusCode: 404,
    );
    await tester.pumpWidget(
      anclado(
        ProfileScreen(
          api: ApiFalsa(),
          actor: cargadorPerfilMap(),
          onRefresh: () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('estarán disponibles cuando el puesto los publique'),
      findsOneWidget,
    );
    expect(find.byType(ListTile), findsNothing);
  });

  testWidgets('Hoja legal con 409 muestra el mensaje del backend y reconsulta', (
    tester,
  ) async {
    documentosFijos = [documentoPendienteFijo];
    contenidoFijo = contenidoFijoV3;
    errorAceptar = const MercadoApiException(
      'La versión cambió: ahora hay una más reciente.',
      statusCode: 409,
    );
    await tester.pumpWidget(
      anclado(
        ProfileScreen(
          api: ApiFalsa(),
          actor: cargadorPerfilMap(),
          onRefresh: () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('legal_doc_terminos_cuenta')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('legal_aceptar')));
    await tester.pumpAndSettle();

    expect(find.text('La versión cambió: ahora hay una más reciente.'),
        findsOneWidget);
    expect(find.byKey(const Key('legal_hoja')), findsOneWidget);
    expect(find.text('Texto de los términos.'), findsOneWidget);
  });
}
