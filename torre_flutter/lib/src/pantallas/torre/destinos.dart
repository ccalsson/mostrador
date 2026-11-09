import '../../app.dart';
import 'catalogo.dart';
import 'cliente360.dart';
import 'destinos_fase3.dart';
import 'destinos_fase4.dart';
import 'ejecutivo.dart';
import 'financiero.dart';
import 'inventario.dart';
import 'usuarios.dart';

List<DestinoTorre> destinosTorre() => [
      DestinoTorre(id: 'ejecutivo', titulo: 'Dashboard ejecutivo', grupo: 'Torre', builder: (api) => PantallaEjecutivo(api: api)),
      DestinoTorre(id: 'cliente360', titulo: 'Cliente 360°', grupo: 'Torre', builder: (api) => PantallaCliente360(api: api)),
      DestinoTorre(id: 'financiero', titulo: 'Control financiero', grupo: 'Torre', builder: (api) => PantallaFinanciero(api: api)),
      DestinoTorre(id: 'catalogo', titulo: 'Catálogo unificado', grupo: 'Torre', builder: (api) => PantallaCatalogo(api: api)),
      DestinoTorre(id: 'inventario', titulo: 'Inventario cross-canal', grupo: 'Torre', builder: (api) => PantallaInventario(api: api)),
      DestinoTorre(id: 'usuarios', titulo: 'Usuarios centralizados', grupo: 'Torre', builder: (api) => PantallaUsuarios(api: api)),
      ...destinosTorreFase3(),
      ...destinosTorreFase4(),
    ];
