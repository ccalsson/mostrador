import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

Map<String, dynamic> _mapa(dynamic v) =>
    v is Map<String, dynamic> ? v : (v is Map ? v.map((k, val) => MapEntry(k.toString(), val)) : <String, dynamic>{});

List<dynamic> _lista(dynamic v) => v is List ? v : const [];

String _idCorto(dynamic v) {
  final s = texto(v);
  return s.length > 8 ? s.substring(0, 8) : s;
}

class PantallaGrupos extends StatefulWidget {
  const PantallaGrupos({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaGrupos> createState() => _PantallaGruposState();
}

class _PantallaGruposState extends State<PantallaGrupos> {
  int _version = 0;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('listarGrupos');

  void _abrir(Map<String, dynamic> grupo) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => _DetalleGrupo(
          api: widget.api,
          grupo: grupo,
          onCambio: () {
            if (mounted) setState(() => _version++);
          },
        ),
      ),
    );
  }

  Future<void> _nuevo() async {
    if (await _formularioGrupo(context, widget.api, null) && mounted) setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Consolidado de clientes, tenants y facturación por grupo empresarial.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Align(alignment: Alignment.centerLeft, child: BotonPrimario('Nuevo grupo', _nuevo)),
        const SizedBox(height: 14),
        VistaDatos<List<dynamic>>(
          key: ValueKey('grupos-$_version'),
          cargar: _cargar,
          builder: (context, grupos) {
            if (grupos.isEmpty) {
              return Text('No hay grupos empresariales todavía.', style: TextStyle(color: c.muted, fontSize: 13));
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('${grupos.length} grupos', style: TextStyle(fontSize: 12, color: c.muted)),
                const SizedBox(height: 8),
                for (final g in grupos)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => _abrir(_mapa(g)),
                      child: Tarjeta(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(texto(g['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600, fontSize: 15)),
                            if (texto(g['descripcion']).isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  texto(g['descripcion']),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: c.muted, fontSize: 12),
                                ),
                              ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(child: Text('${texto(g['clientesCount'])} clientes', style: TextStyle(color: c.muted, fontSize: 12))),
                                Expanded(child: Text('${texto(g['tenantsCount'])} tenants', style: TextStyle(color: c.muted, fontSize: 12))),
                                Text(fmtMoneda(g['revenueTotal']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600, fontSize: 13)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

typedef _DatosGrupo = ({Map<String, dynamic> grupo, List<dynamic> clientes, List<dynamic> disponibles});

class _DetalleGrupo extends StatefulWidget {
  const _DetalleGrupo({required this.api, required this.grupo, required this.onCambio});
  final TorreApi api;
  final Map<String, dynamic> grupo;
  final VoidCallback onCambio;

  @override
  State<_DetalleGrupo> createState() => _DetalleGrupoState();
}

class _DetalleGrupoState extends State<_DetalleGrupo> {
  int _version = 0;
  String _seleccionado = '';
  bool _ocupado = false;

  String get _grupoId => texto(widget.grupo['id']);

  Future<_DatosGrupo> _cargar() async {
    final resultados = await Future.wait<Object>(<Future<Object>>[
      widget.api.fnMapa('detalleGrupo', <String, dynamic>{'id': _grupoId}),
      widget.api.fnLista('listarClientesParaGrupo'),
    ]);
    final detalle = _mapa(resultados[0]);
    final disponibles = _lista(resultados[1]).where((c) => texto(c['grupoId']) != _grupoId).toList();
    return (grupo: _mapa(detalle['grupo']), clientes: _lista(detalle['clientes']), disponibles: disponibles);
  }

  void _cambio() {
    widget.onCambio();
    setState(() {
      _seleccionado = '';
      _version++;
    });
  }

  Future<void> _editar(Map<String, dynamic> grupo) async {
    if (await _formularioGrupo(context, widget.api, grupo)) _cambio();
  }

  Future<void> _eliminar() async {
    if (!await confirmarTorre(context, 'Eliminar grupo', '${texto(widget.grupo['nombre'])} se elimina. Primero hay que desasignar sus clientes.')) return;
    try {
      await widget.api.fn('eliminarGrupo', <String, dynamic>{'id': _grupoId});
      if (!mounted) return;
      aviso(context, 'Grupo eliminado.');
      Navigator.pop(context);
    } catch (e) {
      if (mounted) aviso(context, '$e');
    }
  }

  Future<void> _asignar() async {
    if (_seleccionado.isEmpty) return;
    setState(() => _ocupado = true);
    try {
      await widget.api.fn('asignarClienteAGrupo', <String, dynamic>{'clienteId': _seleccionado, 'grupoId': _grupoId});
      if (!mounted) return;
      aviso(context, 'Cliente asignado.');
      _cambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _desasignar(String clienteId) async {
    if (!await confirmarTorre(context, 'Desasignar cliente', 'El cliente queda fuera del grupo.')) return;
    try {
      await widget.api.fn('desasignarCliente', <String, dynamic>{'clienteId': clienteId});
      if (!mounted) return;
      aviso(context, 'Cliente desasignado.');
      _cambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(texto(widget.grupo['nombre']), overflow: TextOverflow.ellipsis),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: VistaDatos<_DatosGrupo>(
                key: ValueKey('grupo-$_version'),
                cargar: _cargar,
                autoRefrescar: false,
                builder: _cuerpo,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _cuerpo(BuildContext context, _DatosGrupo d) {
    final c = torreColorsOf(context);
    final grupo = d.grupo;
    final opciones = _opciones(d.disponibles, _nombreDeCliente);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Creado por ${texto(grupo['creadoPor'])}',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: c.muted, fontSize: 12),
              ),
            ),
            TextButton(onPressed: _ocupado ? null : () => _editar(grupo), child: const Text('Editar')),
            TextButton(onPressed: _ocupado ? null : _eliminar, child: Text('Eliminar', style: TextStyle(color: c.terra))),
          ],
        ),
        KpiGrilla([
          ('Clientes', texto(grupo['clientesCount'])),
          ('Tenants activos', texto(grupo['tenantsCount'])),
          ('Revenue total', fmtMoneda(grupo['revenueTotal'])),
          ('Creado', fmtFecha(grupo['createdAt'])),
        ]),
        if (texto(grupo['descripcion']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(texto(grupo['descripcion']), style: TextStyle(color: c.muted, fontSize: 13)),
          ),
        const SizedBox(height: 14),
        if (opciones.isNotEmpty)
          Tarjeta(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Asignar cliente', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                const SizedBox(height: 8),
                Desplegable(
                  label: 'Cliente',
                  valor: _seleccionado.isEmpty ? _ninguna : _etiquetaDe(opciones, _seleccionado),
                  opciones: [_ninguna, for (final o in opciones) o.label],
                  onChanged: (v) => setState(() => _seleccionado = v == _ninguna ? '' : opciones.firstWhere((o) => o.label == v).id),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: SizedBox(width: 150, child: BotonPrimario('Asignar', _seleccionado.isEmpty ? null : _asignar, ocupado: _ocupado)),
                ),
              ],
            ),
          ),
        const SizedBox(height: 14),
        Text('Clientes del grupo', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
        const SizedBox(height: 8),
        if (d.clientes.isEmpty)
          Text('Este grupo no tiene clientes asignados.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final cli in d.clientes)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Tarjeta(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(texto(cli['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                          Text(
                            '${texto(cli['businessName']).isEmpty ? 'Sin razón social' : texto(cli['businessName'])} · '
                            '${texto(cli['tenantsCount'])} tenants · ${fmtMoneda(cli['revenue'])}',
                            style: TextStyle(color: c.muted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    ChipEstado(texto(cli['status']) == 'active' ? 'Activo' : 'Inactivo', activo: texto(cli['status']) == 'active'),
                    IconButton(
                      tooltip: 'Desasignar',
                      icon: Icon(Icons.link_off, size: 20, color: c.terra),
                      onPressed: () => _desasignar(texto(cli['id'])),
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  static const _ninguna = 'Seleccionar…';
}

class _Opcion {
  const _Opcion(this.id, this.label);
  final String id;
  final String label;
}

/// Etiquetas legibles; si dos filas comparten nombre se agrega el id para no
/// asignar al cliente equivocado al resolver la etiqueta.
List<_Opcion> _opciones(List<dynamic> filas, String Function(dynamic fila) etiqueta) {
  final vistas = <String>{};
  final repetidas = <String>{};
  for (final f in filas) {
    final e = etiqueta(f);
    if (!vistas.add(e)) repetidas.add(e);
  }
  final out = <_Opcion>[];
  for (final f in filas) {
    final e = etiqueta(f);
    final id = texto(f['id']);
    out.add(_Opcion(id, repetidas.contains(e) ? '$e · ${_idCorto(id)}' : e));
  }
  return out;
}

String _etiquetaDe(List<_Opcion> opciones, String id) {
  for (final o in opciones) {
    if (o.id == id) return o.label;
  }
  return '';
}

String _nombreDeCliente(dynamic fila) {
  final negocio = texto(fila['businessName']);
  final nombre = texto(fila['nombre']);
  return negocio.isEmpty ? nombre : '$nombre ($negocio)';
}

Future<bool> _formularioGrupo(BuildContext context, TorreApi api, Map<String, dynamic>? grupo) async {
  final esEdicion = grupo != null;
  final id = esEdicion ? texto(grupo['id']) : '';
  final nombre = TextEditingController(text: esEdicion ? texto(grupo['nombre']) : '');
  final descripcion = TextEditingController(text: esEdicion ? texto(grupo['descripcion']) : '');
  return mostrarFormulario(
    context,
    titulo: esEdicion ? 'Editar grupo' : 'Nuevo grupo empresarial',
    campos: [
      Campo(controller: nombre, label: 'Nombre'),
      Campo(controller: descripcion, label: 'Descripción', lineas: 3),
    ],
    guardar: () => esEdicion
        ? api.fn('actualizarGrupo', <String, dynamic>{'id': id, 'nombre': nombre.text, 'descripcion': descripcion.text})
        : api.fn('crearGrupo', <String, dynamic>{'nombre': nombre.text, 'descripcion': descripcion.text}),
  );
}
