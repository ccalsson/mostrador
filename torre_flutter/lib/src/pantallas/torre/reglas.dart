import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class _Opcion {
  const _Opcion(this.id, this.label);
  final String id;
  final String label;
}

class _Eleccion {
  _Eleccion(this.label, this.opciones, String inicial)
      : id = opciones.any((o) => o.id == inicial) ? inicial : (opciones.isEmpty ? '' : opciones.first.id);

  final String label;
  final List<_Opcion> opciones;
  String id;

  Widget field() => Desplegable(
        label: label,
        valor: etiqueta(opciones, id),
        opciones: [for (final o in opciones) o.label],
        onChanged: (v) => id = opciones.firstWhere((o) => o.label == v).id,
      );

  static String etiqueta(List<_Opcion> opciones, String id) {
    for (final o in opciones) {
      if (o.id == id) return o.label;
    }
    return id.isEmpty ? '—' : id;
  }
}

const _condiciones = [
  _Opcion('stock_bajo', 'Stock bajo'),
  _Opcion('pago_vencido', 'Pago vencido'),
  _Opcion('caja_negativa', 'Caja negativa'),
  _Opcion('revenue_drop', 'Caída de ingresos'),
];

const _acciones = [
  _Opcion('alerta', 'Alerta'),
  _Opcion('notificacion', 'Notificación'),
  _Opcion('flag', 'Flag'),
];

String _resumenCondicion(dynamic condicion) {
  final tipo = texto(condicion['tipo']);
  final umbral = numero(condicion['umbral']).toInt();
  final dias = numero(condicion['periodoDias']).toInt();
  switch (tipo) {
    case 'stock_bajo':
      return 'Stock ≤ $umbral% del mínimo';
    case 'pago_vencido':
      return 'Pagos vencidos más de ${dias <= 0 ? 7 : dias} días';
    case 'caja_negativa':
      return 'Caja negativa en los últimos ${dias <= 0 ? 30 : dias} días';
    case 'revenue_drop':
      return 'Ingresos caen más de $umbral% contra los ${dias <= 0 ? 30 : dias} días anteriores';
    default:
      return _Eleccion.etiqueta(_condiciones, tipo);
  }
}

String _resumenAccion(dynamic accion) {
  final destino = texto(accion['destino']);
  final tipo = _Eleccion.etiqueta(_acciones, texto(accion['tipo']));
  final mensaje = texto(accion['mensaje']);
  return destino.isEmpty ? '$tipo: $mensaje' : '$tipo → $destino: $mensaje';
}

String _momento(dynamic v) {
  final iso = texto(v);
  if (iso.length < 16) return fmtFecha(iso);
  return '${fmtFecha(iso)} ${iso.substring(11, 16)}';
}

class _Interruptor extends StatefulWidget {
  const _Interruptor({required this.label, required this.inicial, required this.onCambio});
  final String label;
  final bool inicial;
  final ValueChanged<bool> onCambio;

  @override
  State<_Interruptor> createState() => _InterruptorState();
}

class _InterruptorState extends State<_Interruptor> {
  late bool _valor = widget.inicial;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return SwitchListTile.adaptive(
      value: _valor,
      onChanged: (v) {
        setState(() => _valor = v);
        widget.onCambio(v);
      },
      title: Text(widget.label, style: TextStyle(color: c.ink, fontSize: 14)),
      activeThumbColor: c.leaf,
      contentPadding: EdgeInsets.zero,
    );
  }
}

class PantallaReglas extends StatefulWidget {
  const PantallaReglas({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaReglas> createState() => _PantallaReglasState();
}

class _PantallaReglasState extends State<PantallaReglas> {
  int _tab = 0;
  int _version = 0;
  List<dynamic>? _resultados;
  bool _ocupado = false;
  String? _ocupada;

  Map<String, dynamic> _payload(dynamic regla, {bool? activo}) => <String, dynamic>{
        'id': texto(regla['id']),
        'nombre': texto(regla['nombre']),
        'descripcion': texto(regla['descripcion']),
        'condicion': regla['condicion'],
        'accion': regla['accion'],
        'activo': activo ?? regla['activo'] == true,
      };

  void _cambio() => setState(() => _version++);

  Future<void> _alternar(dynamic regla, bool activo) async {
    final id = texto(regla['id']);
    setState(() => _ocupada = id);
    try {
      await widget.api.fn('actualizarRegla', _payload(regla, activo: activo));
      if (!mounted) return;
      _cambio();
    } catch (e) {
      if (!mounted) return;
      aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupada = null);
    }
  }

  Future<void> _borrar(dynamic regla) async {
    if (!await confirmarTorre(context, 'Eliminar regla', '¿Eliminar "${texto(regla['nombre'])}"? También se borra su log.')) return;
    setState(() => _ocupada = texto(regla['id']));
    try {
      await widget.api.fn('eliminarRegla', <String, dynamic>{'id': texto(regla['id'])});
      if (!mounted) return;
      aviso(context, 'Regla eliminada.');
      _cambio();
    } catch (e) {
      if (!mounted) return;
      aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupada = null);
    }
  }

  Future<void> _evaluar() async {
    setState(() => _ocupado = true);
    try {
      final res = await widget.api.fnLista('evaluarReglasAhora');
      if (!mounted) return;
      setState(() => _resultados = res);
      aviso(context, res.where((r) => r['disparada'] == true).isEmpty
          ? 'Ninguna regla se disparó.'
          : '${res.where((r) => r['disparada'] == true).length} de ${res.length} reglas disparadas.');
    } catch (e) {
      if (!mounted) return;
      aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _formulario(BuildContext context, dynamic regla) async {
    final esEdicion = regla != null;
    final nombre = TextEditingController(text: esEdicion ? texto(regla['nombre']) : '');
    final descripcion = TextEditingController(text: esEdicion ? texto(regla['descripcion']) : '');
    final condicion = _Eleccion('Condición', _condiciones, esEdicion ? texto(regla['condicion']['tipo']) : 'stock_bajo');
    final umbral = TextEditingController(text: esEdicion ? texto(regla['condicion']['umbral']) : '80');
    final periodo = TextEditingController(text: esEdicion && regla['condicion']['periodoDias'] != null ? texto(regla['condicion']['periodoDias']) : '7');
    final accion = _Eleccion('Acción', _acciones, esEdicion ? texto(regla['accion']['tipo']) : 'alerta');
    final destino = TextEditingController(text: esEdicion ? texto(regla['accion']['destino']) : 'global');
    final mensaje = TextEditingController(text: esEdicion ? texto(regla['accion']['mensaje']) : '');
    var activa = esEdicion ? regla['activo'] == true : true;

    final guardado = await mostrarFormulario(
      context,
      titulo: esEdicion ? 'Editar regla' : 'Nueva regla',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: descripcion, label: 'Descripción', lineas: 2),
        condicion.field(),
        Campo(controller: umbral, label: 'Umbral (%)', teclado: const TextInputType.numberWithOptions(decimal: true)),
        Campo(controller: periodo, label: 'Período (días)', teclado: const TextInputType.numberWithOptions(signed: true)),
        accion.field(),
        Campo(controller: destino, label: 'Destino'),
        Campo(controller: mensaje, label: 'Mensaje', lineas: 2),
        _Interruptor(label: 'Activa', inicial: activa, onCambio: (v) => activa = v),
      ],
      guardar: () => widget.api.fn(esEdicion ? 'actualizarRegla' : 'crearRegla', <String, dynamic>{
        if (esEdicion) 'id': texto(regla['id']),
        'nombre': nombre.text.trim(),
        'descripcion': descripcion.text.trim(),
        'condicion': <String, dynamic>{
          'tipo': condicion.id,
          'umbral': numero(umbral.text),
          'periodoDias': periodo.text.trim().isEmpty ? null : numero(periodo.text),
        },
        'accion': <String, dynamic>{
          'tipo': accion.id,
          'destino': destino.text.trim(),
          'mensaje': mensaje.text.trim(),
        },
        'activo': activa,
      }),
    );
    for (final c in [nombre, descripcion, umbral, periodo, destino, mensaje]) {
      c.dispose();
    }
    if (!guardado || !context.mounted) return;
    aviso(context, esEdicion ? 'Regla actualizada.' : 'Regla creada.');
    _cambio();
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Reglas SI/ENTONCES sobre stock, caja, pagos e ingresos de todo el ecosistema.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('Reglas')),
            ButtonSegment(value: 1, label: Text('Ejecución')),
            ButtonSegment(value: 2, label: Text('Log')),
          ],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
        const SizedBox(height: 14),
        if (_tab == 0)
          VistaDatos<List<dynamic>>(
            key: ValueKey('reglas-$_version'),
            cargar: () => widget.api.fnLista('listarReglas'),
            autoRefrescar: false,
            builder: _lista,
          )
        else if (_tab == 1)
          _ejecucion(context)
        else
          VistaDatos<List<dynamic>>(
            key: ValueKey('reglas-log-$_version'),
            cargar: () => widget.api.fnLista('listarLogReglas', <String, dynamic>{'limite': 100}),
            builder: _log,
          ),
      ],
    );
  }

  Widget _lista(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text('${filas.length} regla(s)', style: TextStyle(fontSize: 12, color: c.muted))),
            SizedBox(width: 150, child: BotonPrimario('Nueva regla', () => _formulario(context, null))),
          ],
        ),
        const SizedBox(height: 10),
        if (filas.isEmpty)
          Text('No hay reglas definidas. Creá una para empezar.', style: TextStyle(fontSize: 13, color: c.muted))
        else
          for (final r in filas)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _Regla(
                regla: r,
                ocupada: _ocupada == texto(r['id']),
                onAlternar: (v) => _alternar(r, v),
                onEditar: () => _formulario(context, r),
                onBorrar: () => _borrar(r),
              ),
            ),
      ],
    );
  }

  Widget _ejecucion(BuildContext context) {
    final c = torreColorsOf(context);
    final resultados = _resultados;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SizedBox(width: 240, child: BotonPrimario('Evaluar ahora', _ocupado ? null : _evaluar, ocupado: _ocupado)),
        ),
        const SizedBox(height: 8),
        Text(
          'Ejecuta las reglas activas contra los datos de este momento y deja registro en el log.',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
        const SizedBox(height: 14),
        if (resultados == null)
          Text('Todavía no evaluaste nada en esta sesión.', style: TextStyle(fontSize: 13, color: c.muted))
        else if (resultados.isEmpty)
          Text('No hay reglas activas para evaluar.', style: TextStyle(fontSize: 13, color: c.muted))
        else
          for (final r in resultados)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _Resultado(r),
            ),
      ],
    );
  }

  Widget _log(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) {
      return Text('Sin evaluaciones registradas todavía.', style: TextStyle(fontSize: 13, color: c.muted));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${filas.length} evaluaciones', style: TextStyle(fontSize: 12, color: c.muted)),
        const SizedBox(height: 8),
        for (final r in filas.take(200))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Resultado(r, muestraFecha: true),
          ),
      ],
    );
  }
}

class _Regla extends StatelessWidget {
  const _Regla({required this.regla, required this.ocupada, required this.onAlternar, required this.onEditar, required this.onBorrar});
  final dynamic regla;
  final bool ocupada;
  final ValueChanged<bool> onAlternar;
  final VoidCallback onEditar;
  final VoidCallback onBorrar;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final activa = regla['activo'] == true;
    final descripcion = texto(regla['descripcion']);
    return Opacity(
      opacity: activa ? 1 : 0.65,
      child: Tarjeta(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(texto(regla['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                      if (descripcion.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(descripcion, style: TextStyle(color: c.muted, fontSize: 12)),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Switch.adaptive(value: activa, onChanged: ocupada ? null : onAlternar, activeThumbColor: c.leaf),
              ],
            ),
            const SizedBox(height: 8),
            Text('SI ${_resumenCondicion(regla['condicion'])}', style: TextStyle(color: c.inkSoft, fontSize: 13)),
            const SizedBox(height: 2),
            Text('ENTONCES ${_resumenAccion(regla['accion'])}', style: TextStyle(color: c.muted, fontSize: 13)),
            const SizedBox(height: 6),
            Row(
              children: [
                TextButton(onPressed: ocupada ? null : onEditar, child: const Text('Editar')),
                const SizedBox(width: 6),
                TextButton(
                  onPressed: ocupada ? null : onBorrar,
                  child: Text('Eliminar', style: TextStyle(color: c.terra)),
                ),
                if (ocupada) ...[
                  const Spacer(),
                  SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.muted)),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Resultado extends StatelessWidget {
  const _Resultado(this.r, {this.muestraFecha = false});
  final dynamic r;
  final bool muestraFecha;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final disparada = r['disparada'] == true;
    final color = disparada ? c.terra : c.leaf;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: disparada ? c.warnBg : c.okBg,
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(texto(r['reglaNombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
              ),
              ChipEstado(disparada ? 'Disparada' : 'OK', activo: !disparada),
            ],
          ),
          const SizedBox(height: 4),
          Text(texto(r['detalle']), style: TextStyle(color: c.inkSoft, fontSize: 13)),
          const SizedBox(height: 4),
          Text(
            muestraFecha ? 'Evaluado ${_momento(r['evaluadoAt'])}' : 'Ahora',
            style: TextStyle(color: c.muted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
