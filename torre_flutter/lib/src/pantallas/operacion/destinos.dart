import '../../app.dart';
import 'legal.dart';
import 'mercado.dart';
import 'procesadores.dart';
import 'promociones.dart';
import 'puesto.dart';
import 'super_al_toque.dart';

List<DestinoTorre> destinosOperacion() => [
      DestinoTorre(id: 'mercado', titulo: 'Mostrador y Mercado', grupo: 'Operación', builder: (api) => PantallaMercado(api: api)),
      DestinoTorre(id: 'puesto', titulo: 'Del puesto', grupo: 'Operación', builder: (api) => PantallaPuesto(api: api)),
      DestinoTorre(id: 'super-al-toque', titulo: 'Super al Toque', grupo: 'Operación', builder: (api) => PantallaSuperAlToque(api: api)),
      DestinoTorre(id: 'legal', titulo: 'Documentos y contratos', grupo: 'Legal', builder: (api) => PantallaLegal(api: api)),
      DestinoTorre(id: 'procesadores', titulo: 'Procesadores', grupo: 'Legal', builder: (api) => PantallaProcesadores(api: api)),
      DestinoTorre(id: 'promociones', titulo: 'Promociones', grupo: 'Comercial', builder: (api) => PantallaPromociones(api: api)),
    ];
