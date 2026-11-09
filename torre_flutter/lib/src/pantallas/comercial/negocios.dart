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

class _NegociosDatos {
  _NegociosDatos(this.tenants, this.apps, this.clientes, this.planes);
  final List<dynamic> tenants;
  final List<dynamic> apps;
  final List<dynamic> clientes;
  final List<dynamic> planes;
}

class PantallaNegocios extends StatefulWidget {
  const PantallaNegocios({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaNegocios> createState() => _PantallaNegociosState();
}

class _PantallaNegociosState extends State<PantallaNegocios> {
  int _version = 0;

  Future<_NegociosDatos> _cargar() async {
    final tenants = await widget.api.fnLista('listTenants');
    final apps = await widget.api.fnLista('listApps');
    final clientes = await widget.api.fnLista('listClients');
    final planes = await widget.api.fnLista('listPlans');
    return _NegociosDatos(tenants, apps, clientes, planes);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_NegociosDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _NegociosVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _NegociosVista extends StatefulWidget {
  const _NegociosVista({required this.datos, required this.api, required this.onCambio});
  final _NegociosDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_NegociosVista> createState() => _NegociosVistaState();
}

class _NegociosVistaState extends State<_NegociosVista> {
  final _filtro = TextEditingController();

  @override
  void dispose() {
    _filtro.dispose();
    super.dispose();
  }

  List<dynamic> get _filas {
    final needle = _filtro.text.trim().toLowerCase();
    if (needle.isEmpty) return widget.datos.tenants;
    return widget.datos.tenants
        .where((t) => '${texto(t['name'])} ${texto(t['appName'])} ${texto(t['clientName'])}'.toLowerCase().contains(needle))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final filas = _filas;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _filtro,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(hintText: 'Filtrar'),
              ),
            ),
            const SizedBox(width: 10),
            BotonPrimario('Nuevo', () => _formulario(null)),
          ],
        ),
        const SizedBox(height: 14),
        if (filas.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final t in filas) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(t)),
      ],
    );
  }

  Widget _tarjeta(dynamic t) {
    final c = torreColorsOf(context);
    final activo = texto(t['status']) == 'active';
    final instalada = texto(t['installedVersion']);
    final marca = t['atrasado'] == true ? ' ⚠' : (instalada.isEmpty ? '' : ' ✓');
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(texto(t['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
              ChipEstado(activo ? 'Activo' : 'Inactivo', activo: activo),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text('${texto(t['appName'])} · ${texto(t['clientName'])}', style: TextStyle(color: c.muted, fontSize: 13)),
          ),
          LineaDato('Plan', texto(t['planName'])),
          LineaDato('Versión', instalada.isEmpty ? '' : '$instalada$marca'),
          LineaDato('Actividad', t['lastActivityAt'] == null ? '' : fmtFecha(t['lastActivityAt'])),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(onPressed: () => _formulario(t), child: const Text('Editar')),
              TextButton(
                onPressed: () => _desactivar(t),
                child: Text('Desactivar', style: TextStyle(color: c.terra)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _formulario(dynamic tenant) async {
    final c = torreColorsOf(context);
    final esEdicion = tenant != null;
    final nombre = TextEditingController(text: esEdicion ? texto(tenant['name']) : '');
    final slug = TextEditingController(text: esEdicion ? texto(tenant['slug']) : '');
    final version = TextEditingController(text: esEdicion ? texto(tenant['installedVersion']) : '');
    final referencia = TextEditingController(text: esEdicion ? texto(tenant['operationalTenantRef']) : '');
    final ownerEmail = TextEditingController();
    final ownerPassword = TextEditingController();
    final apps = _Selector(
      'Aplicación',
      [for (final a in widget.datos.apps) _Opcion(texto(a['id']), texto(a['name']))],
      esEdicion ? texto(tenant['appId']) : '',
    );
    final clientes = _Selector(
      'Cliente',
      [for (final x in widget.datos.clientes) _Opcion(texto(x['id']), texto(x['name']))],
      esEdicion ? texto(tenant['clientId']) : '',
    );
    final planes = _Selector(
      'Plan',
      [
        const _Opcion('', 'Sin plan'),
        for (final p in widget.datos.planes) _Opcion(texto(p['id']), texto(p['name'])),
      ],
      esEdicion ? texto(tenant['planId']) : '',
    );
    final estado = _Selector(
      'Estado',
      const [_Opcion('active', 'Activo'), _Opcion('inactive', 'Inactivo')],
      esEdicion ? texto(tenant['status']) : 'active',
    );
    final nota = TextStyle(fontSize: 12, color: c.muted);
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Ficha',
      campos: [
        apps.field(),
        clientes.field(),
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: slug, label: 'Slug'),
        planes.field(),
        estado.field(),
        Campo(controller: version, label: 'Versión instalada'),
        Campo(controller: referencia, label: 'Referencia operativa'),
        if (!esEdicion) ...[
          Campo(controller: ownerEmail, label: 'Mail del dueño'),
          Campo(controller: ownerPassword, label: 'Contraseña del dueño', clave: true),
          Text('Con ese mail entra a Mostrador. Después, en Usuarios, crea al vendedor y al cajero.', style: nota),
        ] else
          Text('La contraseña del puesto la cambia el dueño, no Torre.', style: nota),
      ],
      guardar: () => widget.api.fn('saveTenant', <String, dynamic>{
        if (esEdicion) 'id': texto(tenant['id']),
        'appId': apps.valor,
        'clientId': clientes.valor,
        'name': nombre.text,
        'slug': slug.text,
        'status': estado.valor,
        'planId': planes.valor,
        'installedVersion': version.text,
        'operationalTenantRef': referencia.text,
        'ownerEmail': esEdicion ? '' : ownerEmail.text,
        'ownerPassword': esEdicion ? '' : ownerPassword.text,
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Tenant guardado.');
    widget.onCambio();
  }

  Future<void> _desactivar(dynamic tenant) async {
    final ok = await confirmarTorre(context, 'Desactivar', 'Se desactiva ${texto(tenant['name'])}.');
    if (!ok || !mounted) return;
    try {
      await widget.api.fn('desactivarTenant', texto(tenant['id']));
      if (!mounted) return;
      aviso(context, 'Tenant desactivado.');
      widget.onCambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    }
  }
}
