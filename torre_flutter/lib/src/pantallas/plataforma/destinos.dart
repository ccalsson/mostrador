import 'sire.dart';
import '../../app.dart';
import 'apps.dart';
import 'auditoria.dart';
import 'configuracion.dart';
import 'deployments.dart';
import 'versiones.dart';

List<DestinoTorre> destinosPlataforma() => [
  DestinoTorre(id: 'sire', titulo: 'SIRE · Instituciones', grupo: 'Plataforma', builder: (api) => PantallaSire(api: api)),
  DestinoTorre(id: 'apps', titulo: 'Aplicaciones', grupo: 'Plataforma', builder: (api) => PantallaApps(api: api)),
  DestinoTorre(id: 'versiones', titulo: 'Versiones', grupo: 'Plataforma', builder: (api) => PantallaVersiones(api: api)),
  DestinoTorre(id: 'deployments', titulo: 'Deployments', grupo: 'Plataforma', builder: (api) => PantallaDeployments(api: api)),
  DestinoTorre(id: 'auditoria', titulo: 'Auditoría', grupo: 'Plataforma', builder: (api) => PantallaAuditoria(api: api)),
  DestinoTorre(id: 'configuracion', titulo: 'Configuración', grupo: 'Plataforma', builder: (api) => PantallaConfiguracion(api: api)),
];
