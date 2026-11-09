import '../../app.dart';
import 'api_marketplace.dart';
import 'grupos.dart';
import 'white_label.dart';

List<DestinoTorre> destinosTorreFase4() => [
      DestinoTorre(id: 'grupos', titulo: 'Grupos empresariales', grupo: 'Torre', builder: (api) => PantallaGrupos(api: api)),
      DestinoTorre(id: 'apiMarketplace', titulo: 'API Marketplace', grupo: 'Torre', builder: (api) => PantallaApiMarketplace(api: api)),
      DestinoTorre(id: 'whiteLabel', titulo: 'White-Label', grupo: 'Torre', builder: (api) => PantallaWhiteLabel(api: api)),
    ];
