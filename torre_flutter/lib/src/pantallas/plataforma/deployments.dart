import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class _Opcion {
  const _Opcion(this.id, this.label);
  final String id;
  final String label;
}

class _Selector {
  _Selector(this.label, this.opciones, String inicial)
      : valor = opciones.any((o) => o.id == inicial) ? inicial : (opciones.isEmpty ? '' : opciones.first.id);

  final String label;
  final List<_Opcion> opciones;
  String valor;

  Widget field() => Desplegable(
        label: label,
        valor: _etiquetaActual(),
        opciones: [for (final o in opciones) o.label],
        onChanged: (v) => valor = opciones.firstWhere((o) => o.label == v).id,
      );

  String _etiquetaActual() {
    for (final o in opciones) {
      if (o.id == valor) return o.label;
    }
    return opciones.isEmpty ? '' : opciones.first.label;
  }
}

const List<_Opcion> _plataformas = [
  _Opcion('web', 'Web'),
  _Opcion('android', 'Android'),
  _Opcion('windows', 'Windows'),
];

/// Los mismos estados que muestra la web; 'deployed' y 'rolled_back' no se cargan a mano.
const Map<String, String> _estados = {
  'pending': 'Pendiente',
  'deployed': 'Publicado',
  'failed': 'Fallido',
  'rolled_back': 'Revertido',
};

const List<_Opcion> _estadosRegistro = [
  _Opcion('pending', 'Pendiente'),
  _Opcion('failed', 'Fallido observado'),
];

String _estado(String status) => _estados[status] ?? (status.isEmpty ? '—' : status);

class _DeploymentsDatos {
  _DeploymentsDatos(this.deployments, this.apps, this.tenants, this.versions);
  final List<dynamic> deployments;
  final List<dynamic> apps;
  final List<dynamic> tenants;
  final List<dynamic> versions;
}

class PantallaDeployments extends StatefulWidget {
  const PantallaDeployments({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaDeployments> createState() => _PantallaDeploymentsState();
}

class _PantallaDeploymentsState extends State<PantallaDeployments> {
  int _version = 0;

  Future<_DeploymentsDatos> _cargar() async {
    final deployments = await widget.api.fnLista('listDeployments');
    final apps = await widget.api.fnLista('listApps');
    final tenants = await widget.api.fnLista('listTenants');
    final versions = await widget.api.fnLista('listVersions');
    return _DeploymentsDatos(deployments, apps, tenants, versions);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_DeploymentsDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _DeploymentsVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _DeploymentsVista extends StatefulWidget {
  const _DeploymentsVista({required this.datos, required this.api, required this.onCambio});
  final _DeploymentsDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_DeploymentsVista> createState() => _DeploymentsVistaState();
}

class _DeploymentsVistaState extends State<_DeploymentsVista> {
  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final filas = widget.datos.deployments;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                'Torre anota el deployment. No instala el dispositivo. Publicado en infraestructura solo si el registro dice que se confirmó.',
                style: TextStyle(fontSize: 13, color: c.muted),
              ),
            ),
            const SizedBox(width: 10),
            BotonPrimario('Registrar', _formulario),
          ],
        ),
        const SizedBox(height: 14),
        if (filas.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final d in filas) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(d)),
      ],
    );
  }

  Widget _tarjeta(dynamic d) {
    final c = torreColorsOf(context);
    final confirmado = d['infraConfirmed'] == true;
    final tenant = texto(d['tenantName']);
    final detalle = [
      tenant.isEmpty ? 'General' : tenant,
      texto(d['platform']),
      _estado(texto(d['status'])),
      texto(d['origin']),
      texto(d['deployedAt']).isEmpty ? 'sin fecha' : texto(d['deployedAt']),
    ].join(' · ');
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${texto(d['appName'])} · ${texto(d['version'])}', style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(detalle, style: TextStyle(color: c.muted, fontSize: 12)),
          ),
          if (texto(d['notes']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(texto(d['notes']), style: TextStyle(color: c.inkSoft, fontSize: 13)),
            ),
          if (texto(d['logExcerpt']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(texto(d['logExcerpt']), style: TextStyle(color: c.muted, fontSize: 11)),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: confirmado ? c.okBg : (texto(d['status']) == 'failed' ? c.warnBg : c.paper2),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Text(
                  confirmado ? 'Infraestructura confirmó' : 'Publicado o anotado en Torre, sin confirmación',
                  style: TextStyle(fontSize: 12, color: confirmado ? c.ok : c.inkSoft),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _formulario() async {
    final apps = _Selector(
      'Aplicación',
      [for (final a in widget.datos.apps) _Opcion(texto(a['id']), texto(a['name']))],
      widget.datos.apps.isEmpty ? '' : texto(widget.datos.apps.first['id']),
    );
    final tenants = _Selector(
      'Tenant',
      [
        const _Opcion('', 'Sin tenant'),
        for (final t in widget.datos.tenants) _Opcion(texto(t['id']), texto(t['name'])),
      ],
      '',
    );
    final versions = _Selector(
      'Versión',
      [
        for (final v in widget.datos.versions)
          _Opcion(texto(v['id']), '${texto(v['appName'])} ${texto(v['version'])} ${texto(v['platform'])}'),
      ],
      widget.datos.versions.isEmpty ? '' : texto(widget.datos.versions.first['id']),
    );
    final plataforma = _Selector('Plataforma', _plataformas, 'web');
    final estado = _Selector('Estado', _estadosRegistro, 'pending');
    final notas = TextEditingController();
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Deployment',
      campos: [
        apps.field(),
        tenants.field(),
        versions.field(),
        plataforma.field(),
        estado.field(),
        Campo(controller: notas, label: 'Notas', lineas: 2),
      ],
      guardar: () => widget.api.fn('saveDeployment', <String, dynamic>{
        'appId': apps.valor,
        'tenantId': tenants.valor,
        'versionId': versions.valor,
        'platform': plataforma.valor,
        'status': estado.valor,
        'notes': notas.text.trim(),
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Deployment registrado');
    widget.onCambio();
  }
}
