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

const _segmentos = [
  _Opcion('todos', 'Todos los usuarios'),
  _Opcion('compradores', 'Compradores'),
  _Opcion('inactivos_30d', 'Inactivos 30 días'),
  _Opcion('inactivos_60d', 'Inactivos 60 días'),
  _Opcion('frecuentes', 'Compradores frecuentes'),
];

const _eventos = [
  _Opcion('registro', 'Registro de cuenta'),
  _Opcion('primera_compra', 'Primera compra'),
  _Opcion('inactividad_7d', 'Inactividad 7 días'),
  _Opcion('inactividad_30d', 'Inactividad 30 días'),
  _Opcion('cumpleanos', 'Cumpleaños'),
];

const _condicionesOferta = [
  _Opcion('carrito_abandonado', 'Carrito abandonado'),
  _Opcion('compra_repetida', 'Compra repetida'),
  _Opcion('ticket_alto', 'Ticket alto'),
  _Opcion('cliente_nuevo', 'Cliente nuevo'),
];

class _Etiqueta extends StatelessWidget {
  const _Etiqueta(this.etiqueta, this.color);
  final String etiqueta;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(28)),
      child: Text(etiqueta, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

class _CampoFecha extends StatelessWidget {
  const _CampoFecha({required this.controller, required this.label});
  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      readOnly: true,
      decoration: InputDecoration(
        labelText: label,
        helperText: 'Opcional · vacío deja la campaña en borrador',
        suffixIcon: IconButton(
          tooltip: 'Limpiar',
          icon: const Icon(Icons.clear, size: 18),
          onPressed: () => controller.text = '',
        ),
      ),
      onTap: () async {
        final hoy = DateTime.now();
        final elegido = await showDatePicker(
          context: context,
          initialDate: DateTime.tryParse(controller.text) ?? hoy,
          firstDate: hoy,
          lastDate: DateTime(hoy.year + 2),
        );
        if (elegido == null) return;
        controller.text = '${elegido.year.toString().padLeft(4, '0')}-${elegido.month.toString().padLeft(2, '0')}-${elegido.day.toString().padLeft(2, '0')}';
      },
    );
  }
}

class PantallaMarketing extends StatefulWidget {
  const PantallaMarketing({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaMarketing> createState() => _PantallaMarketingState();
}

class _PantallaMarketingState extends State<PantallaMarketing> {
  int _tab = 0;
  int _version = 0;
  String? _ocupada;

  Future<List<dynamic>> _cargarLista() {
    switch (_tab) {
      case 0:
        return widget.api.fnLista('listarCampanias');
      case 1:
        return widget.api.fnLista('listarSecuencias');
      default:
        return widget.api.fnLista('listarOfertas');
    }
  }

  Future<void> _accion(String fn, String id, String ok) async {
    setState(() => _ocupada = id);
    try {
      await widget.api.fn(fn, <String, dynamic>{'id': id});
      if (!mounted) return;
      aviso(context, ok);
      setState(() => _version++);
    } catch (e) {
      if (!mounted) return;
      aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupada = null);
    }
  }

  Future<void> _enviarCampania(dynamic c) async {
    if (!await confirmarTorre(context, 'Enviar campaña', 'Se marca como enviada a "${_Eleccion.etiqueta(_segmentos, texto(c['segmento']))}".')) {
      return;
    }
    await _accion('enviarCampania', texto(c['id']), 'Campaña enviada.');
  }

  Future<void> _cancelarCampania(dynamic c) async {
    if (!await confirmarTorre(context, 'Cancelar campaña', 'La campaña deja de estar programada.')) return;
    await _accion('cancelarCampania', texto(c['id']), 'Campaña cancelada.');
  }

  Future<void> _formularioCampania() async {
    final nombre = TextEditingController();
    final segmento = _Eleccion('Segmento', _segmentos, 'todos');
    final titulo = TextEditingController();
    final cuerpo = TextEditingController();
    final programado = TextEditingController();
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Nueva campaña push',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        segmento.field(),
        Campo(controller: titulo, label: 'Título del push'),
        Campo(controller: cuerpo, label: 'Cuerpo del push', lineas: 3),
        _CampoFecha(controller: programado, label: 'Programar para'),
      ],
      guardar: () => widget.api.fn('crearCampania', <String, dynamic>{
        'nombre': nombre.text.trim(),
        'segmento': segmento.id,
        'titulo': titulo.text.trim(),
        'cuerpo': cuerpo.text.trim(),
        'programadoAt': programado.text.trim().isEmpty ? '' : programado.text.trim(),
      }),
    );
    for (final c in [nombre, titulo, cuerpo, programado]) {
      c.dispose();
    }
    if (!guardado || !mounted) return;
    aviso(context, 'Campaña creada.');
    setState(() => _version++);
  }

  Future<void> _formularioSecuencia() async {
    final nombre = TextEditingController();
    final evento = _Eleccion('Evento trigger', _eventos, 'registro');
    final asunto = TextEditingController();
    final contenido = TextEditingController();
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Nueva secuencia de email',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        evento.field(),
        Campo(controller: asunto, label: 'Asunto'),
        Campo(controller: contenido, label: 'Contenido', lineas: 5),
      ],
      guardar: () => widget.api.fn('crearSecuencia', <String, dynamic>{
        'nombre': nombre.text.trim(),
        'eventoTrigger': evento.id,
        'asunto': asunto.text.trim(),
        'contenido': contenido.text.trim(),
      }),
    );
    for (final c in [nombre, asunto, contenido]) {
      c.dispose();
    }
    if (!guardado || !mounted) return;
    aviso(context, 'Secuencia creada.');
    setState(() => _version++);
  }

  Future<void> _formularioOferta() async {
    final nombre = TextEditingController();
    final condicion = _Eleccion('Condición', _condicionesOferta, 'carrito_abandonado');
    final descuento = TextEditingController(text: '10');
    final mensaje = TextEditingController();
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Nueva oferta automática',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        condicion.field(),
        Campo(controller: descuento, label: 'Descuento (%)', teclado: const TextInputType.numberWithOptions(decimal: true)),
        Campo(controller: mensaje, label: 'Mensaje', lineas: 3),
      ],
      guardar: () => widget.api.fn('crearOferta', <String, dynamic>{
        'nombre': nombre.text.trim(),
        'condicion': condicion.id,
        'descuentoPct': numero(descuento.text),
        'mensaje': mensaje.text.trim(),
      }),
    );
    for (final c in [nombre, descuento, mensaje]) {
      c.dispose();
    }
    if (!guardado || !mounted) return;
    aviso(context, 'Oferta creada.');
    setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Campañas push, secuencias de email y ofertas automáticas para toda la base de clientes.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        VistaDatos<Map<String, dynamic>>(
          key: ValueKey('marketing-resumen-$_version'),
          cargar: () => widget.api.fnMapa('marketingResumen'),
          builder: (context, r) {
            final campanias = (r['campanias'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
            final secuencias = (r['secuencias'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
            final ofertas = (r['ofertas'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
            return KpiGrilla([
              ('Campañas', texto(campanias['total'])),
              ('Programadas', texto(campanias['activas'])),
              ('Enviadas', texto(campanias['enviadas'])),
              ('Pendientes', texto(campanias['pendientes'])),
              ('Secuencias activas', '${texto(secuencias['activas'])} de ${texto(secuencias['total'])}'),
              ('Ofertas activas', '${texto(ofertas['activas'])} de ${texto(ofertas['total'])}'),
            ]);
          },
        ),
        const SizedBox(height: 14),
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('Campañas')),
            ButtonSegment(value: 1, label: Text('Secuencias')),
            ButtonSegment(value: 2, label: Text('Ofertas')),
          ],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
        const SizedBox(height: 14),
        VistaDatos<List<dynamic>>(
          key: ValueKey('marketing-$_tab-$_version'),
          cargar: _cargarLista,
          autoRefrescar: false,
          builder: _lista,
        ),
      ],
    );
  }

  Widget _lista(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    final nueva = switch (_tab) {
      0 => ('Nueva campaña', _formularioCampania),
      1 => ('Nueva secuencia', _formularioSecuencia),
      _ => ('Nueva oferta', _formularioOferta),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text('${filas.length} item(s)', style: TextStyle(fontSize: 12, color: c.muted))),
            SizedBox(width: 170, child: BotonPrimario(nueva.$1, nueva.$2)),
          ],
        ),
        const SizedBox(height: 10),
        if (filas.isEmpty)
          Text('No hay nada creado todavía.', style: TextStyle(fontSize: 13, color: c.muted))
        else
          for (final f in filas)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: switch (_tab)
                {
                  0 => _Campania(
                      f,
                      ocupada: _ocupada == texto(f['id']),
                      onEnviar: () => _enviarCampania(f),
                      onCancelar: () => _cancelarCampania(f),
                    ),
                  1 => _Secuencia(f, ocupada: _ocupada == texto(f['id']), onToggle: () => _toggleSecuencia(f)),
                  _ => _Oferta(f, ocupada: _ocupada == texto(f['id']), onToggle: () => _toggleOferta(f)),
                },
            ),
      ],
    );
  }

  Future<void> _toggleSecuencia(dynamic s) =>
      _accion('toggleSecuencia', texto(s['id']), s['activo'] == true ? 'Secuencia desactivada.' : 'Secuencia activada.');

  Future<void> _toggleOferta(dynamic o) =>
      _accion('toggleOferta', texto(o['id']), o['activo'] == true ? 'Oferta desactivada.' : 'Oferta activada.');
}

class _Campania extends StatelessWidget {
  const _Campania(this.campania, {required this.ocupada, required this.onEnviar, required this.onCancelar});
  final dynamic campania;
  final bool ocupada;
  final VoidCallback onEnviar;
  final VoidCallback onCancelar;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final estado = texto(campania['estado']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(texto(campania['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
              _Etiqueta(_estadoEtiqueta(estado), _estadoColor(c, estado)),
            ],
          ),
          const SizedBox(height: 4),
          Text('Segmento: ${_Eleccion.etiqueta(_segmentos, texto(campania['segmento']))}', style: TextStyle(color: c.muted, fontSize: 12)),
          const SizedBox(height: 6),
          Text(texto(campania['titulo']), style: TextStyle(color: c.ink, fontSize: 14)),
          const SizedBox(height: 2),
          Text(texto(campania['cuerpo']), style: TextStyle(color: c.muted, fontSize: 13)),
          const SizedBox(height: 6),
          Text(_pie(campania), style: TextStyle(color: c.muted, fontSize: 11)),
          if (puedeActuarse(estado)) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                SizedBox(width: 120, child: BotonPrimario('Enviar', ocupada ? null : onEnviar, ocupado: ocupada)),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: ocupada ? null : onCancelar,
                  child: Text('Cancelar', style: TextStyle(color: c.terra)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static bool puedeActuarse(String estado) => estado == 'borrador' || estado == 'programada';

  static String _estadoEtiqueta(String estado) {
    switch (estado) {
      case 'borrador':
        return 'Borrador';
      case 'programada':
        return 'Programada';
      case 'enviada':
        return 'Enviada';
      case 'cancelada':
        return 'Cancelada';
      default:
        return estado;
    }
  }

  static Color _estadoColor(TorreColors c, String estado) {
    switch (estado) {
      case 'programada':
        return c.ambar;
      case 'enviada':
        return c.leaf;
      case 'cancelada':
        return c.terra;
      default:
        return c.muted;
    }
  }

  static String _pie(dynamic campania) {
    final enviados = numero(campania['enviadosCount']);
    final programado = texto(campania['programadoAt']);
    final enviado = texto(campania['enviadoAt']);
    final partes = <String>[];
    if (enviados > 0) partes.add('Enviados: ${enviados.toStringAsFixed(0)}');
    if (programado.isNotEmpty) partes.add('Programada ${_momento(programado)}');
    if (enviado.isNotEmpty) partes.add('Enviada ${_momento(enviado)}');
    return partes.isEmpty ? 'Creada ${fmtFecha(campania['createdAt'])}' : partes.join(' · ');
  }
}

String _momento(dynamic v) {
  final iso = texto(v);
  if (iso.length < 16) return fmtFecha(iso);
  return '${fmtFecha(iso)} ${iso.substring(11, 16)}';
}

class _Secuencia extends StatelessWidget {
  const _Secuencia(this.s, {required this.ocupada, required this.onToggle});
  final dynamic s;
  final bool ocupada;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final activa = s['activo'] == true;
    return Opacity(
      opacity: activa ? 1 : 0.65,
      child: Tarjeta(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(texto(s['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                Switch.adaptive(value: activa, onChanged: ocupada ? null : (_) => onToggle(), activeThumbColor: c.leaf),
              ],
            ),
            const SizedBox(height: 4),
            Text('Trigger: ${_Eleccion.etiqueta(_eventos, texto(s['eventoTrigger']))}', style: TextStyle(color: c.muted, fontSize: 12)),
            const SizedBox(height: 6),
            Text(texto(s['asunto']), style: TextStyle(color: c.ink, fontSize: 14)),
            const SizedBox(height: 2),
            Text(
              texto(s['contenido']),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.muted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _Oferta extends StatelessWidget {
  const _Oferta(this.o, {required this.ocupada, required this.onToggle});
  final dynamic o;
  final bool ocupada;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final activa = o['activo'] == true;
    return Opacity(
      opacity: activa ? 1 : 0.65,
      child: Tarjeta(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(texto(o['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                _Etiqueta('${numero(o['descuentoPct']).toStringAsFixed(0)}% off', c.terra),
                const SizedBox(width: 8),
                Switch.adaptive(value: activa, onChanged: ocupada ? null : (_) => onToggle(), activeThumbColor: c.leaf),
              ],
            ),
            const SizedBox(height: 4),
            Text('Condición: ${_Eleccion.etiqueta(_condicionesOferta, texto(o['condicion']))}', style: TextStyle(color: c.muted, fontSize: 12)),
            const SizedBox(height: 6),
            Text(texto(o['mensaje']), style: TextStyle(color: c.muted, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
