import '../../app.dart';
import 'clientes.dart';
import 'finanzas.dart';
import 'negocios.dart';
import 'planes.dart';
import 'suscripciones.dart';

List<DestinoTorre> destinosComercial() => [
  DestinoTorre(id: 'tenants', titulo: 'Negocios', grupo: 'Comercial', builder: (api) => PantallaNegocios(api: api)),
  DestinoTorre(id: 'clientes', titulo: 'Clientes', grupo: 'Comercial', builder: (api) => PantallaClientes(api: api)),
  DestinoTorre(id: 'planes', titulo: 'Planes', grupo: 'Comercial', builder: (api) => PantallaPlanes(api: api)),
  DestinoTorre(id: 'suscripciones', titulo: 'Suscripciones', grupo: 'Comercial', builder: (api) => PantallaSuscripciones(api: api)),
  DestinoTorre(id: 'finanzas', titulo: 'Finanzas', grupo: 'Comercial', builder: (api) => PantallaFinanzas(api: api)),
];
