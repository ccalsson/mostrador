import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mercado_al_toque/market_api.dart';
import 'package:mercado_al_toque/models.dart';

/// `MercadoApi` sin storage: la sesión se resuelve en el servidor y estas
/// pruebas sólo miran la ruta y el parseo.
class _ApiSinToken extends MercadoApi {
  _ApiSinToken(http.Client client) : super(client: client);

  @override
  Future<String?> readToken() async => null;
}

MercadoApi _conRespuesta(String body, {int status = 200}) => _ApiSinToken(
  MockClient(
    (request) async => http.Response(
      body,
      status,
      headers: {'content-type': 'application/json'},
    ),
  ),
);

void main() {
  test(
    'listarRankingCargadores pide GET ranking y parsea el listado',
    () async {
      final pedidos = <http.BaseRequest>[];
      final api = _ApiSinToken(
        MockClient((request) async {
          pedidos.add(request);
          return http.Response(
            '{"cargadores":['
            '{"id":"usr_2","nombre":"Cari","nivel":"Oro","puntos":420,'
            '"score":4.75,"recorridosCompletados":38,"calificacion":4.6},'
            '{"id":"usr_3","nombre":"Cacho","nivel":"Bronce","puntos":60,'
            '"score":4.1,"recorridosCompletados":9,"calificacion":3}'
            ']}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final List<RankingCargador> ranking;
      try {
        ranking = await api.listarRankingCargadores();
      } finally {
        api.close();
      }

      expect(pedidos.single.method, 'GET');
      expect(pedidos.single.url.path.endsWith('/ranking'), isTrue);
      expect(pedidos.single.headers['authorization'], isNull);
      expect(ranking.map((item) => item.puesto), [1, 2]);
      expect(ranking.first.nombre, 'Cari');
      expect(ranking.first.nivel, 'Oro');
      expect(ranking.first.calificacion, 4.6);
    },
  );

  test(
    'acepta la forma legado {ranking: [...}] con puesto del servidor',
    () async {
      final api = _conRespuesta(
        '{"ranking":[{"puesto":9,"nombre":"Cari","puntos":420}]}',
      );
      try {
        final ranking = await api.listarRankingCargadores();
        expect(ranking.single.puesto, 9);
        expect(ranking.single.puntos, 420);
      } finally {
        api.close();
      }
    },
  );

  test('un listado vacío no es un error', () async {
    final api = _conRespuesta('{"cargadores":[]}');
    try {
      expect(await api.listarRankingCargadores(), isEmpty);
    } finally {
      api.close();
    }
  });

  test('un 500 llega como MercadoApiException', () async {
    final api = _conRespuesta('{"message":"Caída del servidor."}', status: 500);
    try {
      await expectLater(
        api.listarRankingCargadores(),
        throwsA(
          isA<MercadoApiException>()
              .having((e) => e.message, 'message', 'Caída del servidor.')
              .having((e) => e.kind, 'kind', ApiErrorKind.servidor),
        ),
      );
    } finally {
      api.close();
    }
  });
}
