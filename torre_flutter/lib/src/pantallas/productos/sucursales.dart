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

class _SucursalesDatos {
  _SucursalesDatos(this.branches, this.tenants);
  final List<dynamic> branches;
  final List<dynamic> tenants;
}

class PantallaSucursales extends StatefulWidget {
  const PantallaSucursales({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaSucursales> createState() => _PantallaSucursalesState();
}

class _PantallaSucursalesState extends State<PantallaSucursales> {
  int _version = 0;

  Future<_SucursalesDatos> _cargar() async {
    final branches = await widget.api.fnLista('listBranches');
    final tenants = await widget.api.fnLista('listTenants');
    return _SucursalesDatos(branches, tenants);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_SucursalesDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _SucursalesVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _SucursalesVista extends StatelessWidget {
  const _SucursalesVista({required this.datos, required this.api, required this.onCambio});
  final _SucursalesDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'La primera sucursal cubierta por el producto base no se cobra. Cada activa de más suma la línea de '
          'sucursal extra que calcula el servidor, al precio ya contratado.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: BotonPrimario('Nueva', () => _formulario(context, null)),
        ),
        const SizedBox(height: 14),
        if (datos.branches.isEmpty)
          Text('Sin sucursales.', style: TextStyle(color: c.muted))
        else
          for (final b in datos.branches) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(context, b)),
      ],
    );
  }

  Widget _tarjeta(BuildContext context, dynamic b) {
    final c = torreColorsOf(context);
    final activa = texto(b['status']) == 'active';
    final incluida = b['included'] == true;
    final detalle = [
      texto(b['tenantName']),
      texto(b['slug']),
      if (texto(b['address']).isNotEmpty) texto(b['address']),
    ].join(' · ');
    final fechas = [
      'desde ${texto(b['openedOn'])}',
      if (texto(b['closedOn']).isNotEmpty) 'cerrada ${texto(b['closedOn'])}',
    ].join(' · ');
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(texto(b['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(padding: const EdgeInsets.only(top: 2), child: Text(detalle, style: TextStyle(color: c.muted, fontSize: 12))),
          Padding(padding: const EdgeInsets.only(top: 2), child: Text(fechas, style: TextStyle(color: c.muted, fontSize: 12))),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ChipEstado(incluida ? 'Incluida' : 'Adicional', activo: incluida),
              ChipEstado(activa ? 'Activa' : 'Inactiva', activo: activa),
              TextButton(onPressed: () => _formulario(context, b), child: const Text('Editar')),
              TextButton(
                onPressed: () => _cambiarEstado(context, b),
                child: Text(activa ? 'Desactivar' : 'Activar', style: TextStyle(color: activa ? c.terra : c.ok)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _formulario(BuildContext context, dynamic branch) async {
    if (datos.tenants.isEmpty) {
      aviso(context, 'No hay negocios para asignar la sucursal.');
      return;
    }
    final esEdicion = branch != null;
    final nombre = TextEditingController(text: esEdicion ? texto(branch['name']) : '');
    final slug = TextEditingController(text: esEdicion ? texto(branch['slug']) : '');
    final direccion = TextEditingController(text: esEdicion ? texto(branch['address']) : '');
    final tenantId = esEdicion ? texto(branch['tenantId']) : texto(datos.tenants.first['id']);
    final tenant = _Selector(
      'Tenant',
      [for (final t in datos.tenants) _Opcion(texto(t['id']), texto(t['name']))],
      tenantId,
    );
    final nota = TextStyle(fontSize: 12, color: torreColorsOf(context).muted);
    Map<String, dynamic>? resultado;
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Ficha',
      campos: [
        if (esEdicion)
          Text(
            'Tenant: ${_nombreTenant(tenantId)}. La sucursal no se muda de tenant.',
            style: nota,
          )
        else
          tenant.field(),
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: slug, label: 'Slug'),
        Campo(controller: direccion, label: 'Dirección o referencia'),
      ],
      guardar: () async {
        resultado = await api.fnMapa('saveBranch', <String, dynamic>{
          if (esEdicion) 'id': texto(branch['id']),
          'tenantId': esEdicion ? tenantId : tenant.valor,
          'name': nombre.text.trim(),
          'slug': slug.text.trim(),
          'address': direccion.text.trim(),
        });
      },
    );
    if (!guardado || !context.mounted) return;
    final extras = resultado == null ? 0 : numero(resultado!['extras']).toInt();
    aviso(context, extras > 0 ? 'Guardada. Sucursales extra facturables: $extras.' : 'Guardada. Esta sucursal queda incluida.');
    onCambio();
  }

  String _nombreTenant(String id) {
    for (final t in datos.tenants) {
      if (texto(t['id']) == id) return texto(t['name']);
    }
    return id;
  }

  Future<void> _cambiarEstado(BuildContext context, dynamic b) async {
    final activa = texto(b['status']) == 'active';
    final next = activa ? 'inactive' : 'active';
    if (activa && !await confirmarTorre(context, 'Desactivar sucursal', '¿Desactivar ${texto(b['name'])}?')) return;
    try {
      await api.fn('setBranchStatus', <String, dynamic>{'id': texto(b['id']), 'status': next});
      if (!context.mounted) return;
      aviso(context, next == 'inactive' ? 'Sucursal desactivada.' : 'Sucursal activada.');
      onCambio();
    } catch (e) {
      if (context.mounted) aviso(context, '$e');
    }
  }
}
