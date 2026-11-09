import '../../app.dart';
import 'bi.dart';
import 'marketing.dart';
import 'reglas.dart';

List<DestinoTorre> destinosTorreFase3() => [
      DestinoTorre(id: 'reglas', titulo: 'Motor de reglas', grupo: 'Torre', builder: (api) => PantallaReglas(api: api)),
      DestinoTorre(id: 'bi', titulo: 'BI y forecast', grupo: 'Torre', builder: (api) => PantallaBi(api: api)),
      DestinoTorre(id: 'marketing', titulo: 'Marketing automation', grupo: 'Torre', builder: (api) => PantallaMarketing(api: api)),
    ];
