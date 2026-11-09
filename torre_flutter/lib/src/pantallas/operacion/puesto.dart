import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _solapas = <String>[
  'Identidad',
  'Reputación',
  'Creativos',
  'Reposición',
  'Egresos',
  'Avisos',
  'Costos',
];

String _pesos(dynamic valor) => fmtMoneda(numero(valor), r'$');

String _estrellas(dynamic n) {
  final estrellas = numero(n).round().clamp(0, 5);
  return '${'★' * estrellas}${'☆' * (5 - estrellas)}';
}

class PantallaPuesto extends StatefulWidget {
  const PantallaPuesto({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaPuesto> createState() => _PantallaPuestoState();
}

class _PantallaPuestoState extends State<PantallaPuesto> {
  int _version = 0;
  final _filtro = TextEditingController();

  Future<List<dynamic>> _cargar() => widget.api.fnLista('paridadPuestos');

  @override
  void dispose() {
    _filtro.dispose();
    super.dispose();
  }

  List<dynamic> _filas(List<dynamic> puestos) {
    final aguja = _filtro.text.trim().toLowerCase();
    if (aguja.isEmpty) return puestos;
    return puestos
        .where((p) => '${texto(p['nombre'])} ${texto(p['bajada'])} ${texto(p['direccion'])}'.toLowerCase().contains(aguja))
        .toList();
  }

  Future<void> _abrir(String puestoId) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => _PuestoDetalle(
          api: widget.api,
          puestoId: puestoId,
          onCambio: () {
            if (mounted) setState(() => _version++);
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _filtro,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'Filtrar puestos'),
        ),
        const SizedBox(height: 14),
        VistaDatos<List<dynamic>>(
          key: ValueKey(_version),
          cargar: _cargar,
          builder: (context, puestos) {
            final filas = _filas(puestos);
            if (filas.isEmpty) {
              return Text(
                puestos.isEmpty ? 'No hay puestos cargados.' : 'Ningún puesto coincide con el filtro.',
                style: TextStyle(color: c.muted, fontSize: 13),
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('${filas.length} puestos', style: TextStyle(fontSize: 13, color: c.muted)),
                const SizedBox(height: 10),
                for (final p in filas) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(p)),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _tarjeta(dynamic p) {
    final c = torreColorsOf(context);
    final reputacion = texto(p['reputacion']);
    final avisos = numero(p['avisos']).round();
    final bajada = texto(p['bajada']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(texto(p['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600, fontSize: 15)),
              ),
              if (avisos > 0) ChipEstado('$avisos avisos'),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(bajada.isEmpty ? '—' : bajada, style: TextStyle(color: c.muted, fontSize: 12)),
          ),
          const SizedBox(height: 6),
          LineaDato('Reputación', reputacion.isEmpty ? 'Sin notas' : '$reputacion ★'),
          LineaDato('Créditos', texto(p['creditos'])),
          LineaDato('Piezas', texto(p['piezas'])),
          LineaDato('Egresos 30d', _pesos(p['egresos30d'])),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => _abrir(texto(p['id'])),
              child: const Text('Ver'),
            ),
          ),
        ],
      ),
    );
  }
}

class _PuestoDetalle extends StatefulWidget {
  const _PuestoDetalle({required this.api, required this.puestoId, required this.onCambio});
  final TorreApi api;
  final String puestoId;
  final VoidCallback onCambio;

  @override
  State<_PuestoDetalle> createState() => _PuestoDetalleState();
}

class _PuestoDetalleState extends State<_PuestoDetalle> {
  int _version = 0;
  String _solapa = _solapas.first;
  bool _ocupado = false;

  Future<Map<String, dynamic>> _cargar() =>
      widget.api.fnMapa('detallePuestoTorre', <String, dynamic>{'puestoId': widget.puestoId});

  void _cambio() {
    widget.onCambio();
    setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Del puesto'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: VistaDatos<Map<String, dynamic>>(
                key: ValueKey(_version),
                cargar: _cargar,
                builder: (context, d) => _contenido(context, d),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _contenido(BuildContext context, Map<String, dynamic> d) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          texto(d['nombre']),
          style: TextStyle(fontFamily: 'serif', fontSize: 20, fontWeight: FontWeight.w600, color: c.ink),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            for (final s in _solapas)
              ChoiceChip(
                label: Text(s),
                selected: _solapa == s,
                onSelected: (_) => setState(() => _solapa = s),
              ),
          ],
        ),
        const SizedBox(height: 14),
        if (_solapa == 'Identidad') _identidad(d),
        if (_solapa == 'Reputación') _reputacion(context, d['notas'] as List? ?? const []),
        if (_solapa == 'Creativos') _creativos(context, d['piezas'] as List? ?? const []),
        if (_solapa == 'Reposición') _reposicion(context, d['reposicion'] as List? ?? const []),
        if (_solapa == 'Egresos') _egresos(context, d['egresos'] as List? ?? const []),
        if (_solapa == 'Avisos') _avisos(context, d['avisos'] as List? ?? const []),
        if (_solapa == 'Costos') _costos(context, d['productos'] as List? ?? const []),
      ],
    );
  }

  // ── Identidad ─────────────────────────────────────────────────────────────
  Widget _identidad(Map<String, dynamic> d) {
    final c = torreColorsOf(context);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LineaDato('Nombre', texto(d['nombre'])),
          LineaDato('Bajada', texto(d['bajada'])),
          LineaDato('Dirección', texto(d['direccion'])),
          LineaDato('Pie del ticket', texto(d['pieTicket'])),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('El QR sale de nombre + dirección.', style: TextStyle(fontSize: 12, color: c.muted)),
          ),
          const SizedBox(height: 10),
          BotonPrimario('Guardar identidad', _ocupado ? null : () => _formularioIdentidad(d), ocupado: _ocupado),
        ],
      ),
    );
  }

  Future<void> _formularioIdentidad(Map<String, dynamic> d) async {
    final nombre = TextEditingController(text: texto(d['nombre']));
    final bajada = TextEditingController(text: texto(d['bajada']));
    final direccion = TextEditingController(text: texto(d['direccion']));
    final pieTicket = TextEditingController(text: texto(d['pieTicket']));
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Guardar identidad',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: bajada, label: 'Bajada'),
        Campo(controller: direccion, label: 'Dirección'),
        Campo(controller: pieTicket, label: 'Pie del ticket', lineas: 3),
      ],
      guardar: () {
        if (nombre.text.trim().isEmpty) throw TorreError('El nombre es obligatorio.');
        return widget.api.fn('guardarIdentidadTorre', <String, dynamic>{
          'puestoId': widget.puestoId,
          'nombre': nombre.text.trim(),
          'bajada': bajada.text.trim(),
          'direccion': direccion.text.trim(),
          'pieTicket': pieTicket.text.trim(),
        });
      },
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Identidad guardada');
    _cambio();
  }

  // ── Reputación ────────────────────────────────────────────────────────────
  Widget _reputacion(BuildContext context, List<dynamic> notas) {
    final c = torreColorsOf(context);
    if (notas.isEmpty) return _Vacio('Sin notas de compradores.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final n in notas)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Tarjeta(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Text(_estrellas(n['estrellas']), style: TextStyle(color: c.ambar, fontSize: 15)),
                      const Spacer(),
                      Text(texto(n['creadoAt']), style: TextStyle(color: c.muted, fontSize: 12)),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(texto(n['compradorNombre']), style: TextStyle(color: c.ink, fontSize: 14)),
                  ),
                  if (texto(n['comentario']).isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(texto(n['comentario']), style: TextStyle(color: c.muted, fontSize: 13)),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _ocupado ? null : () => _quitarComentario(texto(n['id'])),
                        child: Text('Quitar comentario', style: TextStyle(color: c.terra, fontSize: 13)),
                      ),
                    ),
                  ] else
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('Sin comentario', style: TextStyle(color: c.muted, fontSize: 12, fontStyle: FontStyle.italic)),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _quitarComentario(String notaId) async {
    if (!await confirmarTorre(context, 'Quitar comentario', 'Se borra el texto de la nota; las estrellas quedan.')) return;
    setState(() => _ocupado = true);
    try {
      await widget.api.fn('quitarComentarioTorre', <String, dynamic>{'notaId': notaId});
      if (!mounted) return;
      aviso(context, 'Comentario quitado');
      _cambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  // ── Creativos ─────────────────────────────────────────────────────────────
  Widget _creativos(BuildContext context, List<dynamic> piezas) {
    final c = torreColorsOf(context);
    if (piezas.isEmpty) return _Vacio('Sin piezas de marketing.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final p in piezas)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Tarjeta(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(texto(p['formato']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                      ChipEstado(texto(p['estado']), activo: texto(p['estado']) == 'listo'),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(texto(p['brief']), style: TextStyle(color: c.muted, fontSize: 13)),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(texto(p['createdAt']), style: TextStyle(color: c.muted, fontSize: 12)),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  // ── Reposición ────────────────────────────────────────────────────────────
  Widget _reposicion(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) {
      return _Vacio('Sin datos de reposición. No hay ventas recientes suficientes para calcular.');
    }
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final r in filas)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(child: Text(texto(r['nombre']), style: TextStyle(color: c.ink, fontSize: 14))),
                  Text('${texto(r['dias'])} días', style: TextStyle(color: c.muted, fontSize: 13)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── Egresos ───────────────────────────────────────────────────────────────
  Widget _egresos(BuildContext context, List<dynamic> egresos) {
    final c = torreColorsOf(context);
    if (egresos.isEmpty) return _Vacio('Sin egresos en los últimos 30 días.');
    var total = 0.0;
    for (final e in egresos) {
      total += numero(e['monto']);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text('Total: ${_pesos(total)}', style: TextStyle(color: c.ink, fontWeight: FontWeight.w600, fontSize: 15)),
        ),
        for (final e in egresos)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Tarjeta(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(texto(e['concepto']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                      Text(_pesos(e['monto']), style: TextStyle(color: c.ink, fontSize: 14)),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '${texto(e['categoria'])} · ${texto(e['creadoAt'])}',
                      style: TextStyle(color: c.muted, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  // ── Avisos ────────────────────────────────────────────────────────────────
  Widget _avisos(BuildContext context, List<dynamic> avisos) {
    final c = torreColorsOf(context);
    if (avisos.isEmpty) return _Vacio('Sin avisos activos.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final a in avisos)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Tarjeta(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(texto(a['placement']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                      ChipEstado(texto(a['status']), activo: texto(a['status']) == 'active'),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('${fmtFecha(a['startsOn'])} → ${fmtFecha(a['endsOn'])}', style: TextStyle(color: c.muted, fontSize: 12)),
                  ),
                  if (texto(a['notes']).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(texto(a['notes']), style: TextStyle(color: c.muted, fontSize: 12)),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  // ── Costos ────────────────────────────────────────────────────────────────
  Widget _costos(BuildContext context, List<dynamic> productos) {
    final c = torreColorsOf(context);
    final conCosto = productos.where((p) => p['costo'] != null).toList();
    final sinCosto = productos.where((p) => p['costo'] == null).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${conCosto.length} con costo cargado · ${sinCosto.length} sin costo',
          style: TextStyle(color: c.muted, fontSize: 13),
        ),
        const SizedBox(height: 10),
        if (sinCosto.isNotEmpty) ...[
          const _Subtitulo('Sin costo cargado'),
          Tarjeta(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final p in sinCosto)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(child: Text(texto(p['nombre']), overflow: TextOverflow.ellipsis, style: TextStyle(color: c.ink, fontSize: 14))),
                        Text(_pesos(p['precio']), style: TextStyle(color: c.muted, fontSize: 13)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],
        if (conCosto.isNotEmpty) ...[
          const _Subtitulo('Con costo cargado'),
          Tarjeta(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final p in conCosto)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(texto(p['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600, fontSize: 14)),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Expanded(child: Text('Precio ${_pesos(p['precio'])}', style: TextStyle(color: c.muted, fontSize: 12))),
                            Expanded(child: Text('Costo ${_pesos(p['costo'])}', style: TextStyle(color: c.muted, fontSize: 12))),
                            Expanded(
                              child: Text(
                                'Margen ${_pesos(numero(p['precio']) - numero(p['costo']))}',
                                textAlign: TextAlign.end,
                                style: TextStyle(color: c.ink, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _Subtitulo extends StatelessWidget {
  const _Subtitulo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(texto, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
    );
  }
}

class _Vacio extends StatelessWidget {
  const _Vacio(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(texto, style: TextStyle(color: c.muted, fontSize: 13)),
    );
  }
}
