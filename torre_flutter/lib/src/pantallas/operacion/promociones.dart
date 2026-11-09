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

const _estadosPromocion = [
  _Opcion('draft', 'Borrador'),
  _Opcion('active', 'Activa'),
  _Opcion('archived', 'Archivada'),
];

String _iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _rango(dynamic desde, dynamic hasta) {
  final inicio = fmtFecha(desde);
  final fin = texto(hasta);
  return fin.isEmpty ? inicio : '$inicio → ${fmtFecha(fin)}';
}

class _PromosDatos {
  _PromosDatos(this.promociones, this.tenants);
  final Map<String, dynamic> promociones;
  final List<dynamic> tenants;

  List<dynamic> get plantillas => promociones['promotions'] as List? ?? const [];
  List<dynamic> get asignaciones => promociones['grants'] as List? ?? const [];
  List<dynamic> get ajustes => promociones['adjustments'] as List? ?? const [];
}

class PantallaPromociones extends StatefulWidget {
  const PantallaPromociones({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaPromociones> createState() => _PantallaPromocionesState();
}

class _PantallaPromocionesState extends State<PantallaPromociones> {
  int _version = 0;

  Future<_PromosDatos> _cargar() async {
    final promos = await widget.api.fnMapa('listPromotions');
    final tenants = await widget.api.fnLista('listTenants');
    return _PromosDatos(promos, tenants);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_PromosDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _PromocionesVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _PromocionesVista extends StatefulWidget {
  const _PromocionesVista({required this.datos, required this.api, required this.onCambio});
  final _PromosDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_PromocionesVista> createState() => _PromocionesVistaState();
}

class _PromocionesVistaState extends State<_PromocionesVista> {
  List<dynamic> get _activas => widget.datos.plantillas.where((p) => texto(p['status']) == 'active').toList();

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Una plantilla no beneficia a nadie hasta asignarla a un tenant. Al asignar, el servidor crea la bonificación, '
          'el congelamiento y la comisión aparte del precio contratado.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 16),
        _Encabezado(
          titulo: 'Plantillas (${widget.datos.plantillas.length})',
          accion: BotonPrimario('Nueva', _formularioPlantilla),
        ),
        if (widget.datos.plantillas.isEmpty)
          _Vacio('Todavía no hay plantillas de promoción.')
        else
          for (final p in widget.datos.plantillas) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjetaPlantilla(p)),
        const SizedBox(height: 16),
        _Subtitulo('Ajustes (${widget.datos.ajustes.length})'),
        if (widget.datos.ajustes.isEmpty)
          _Vacio('Todavía no hay bonificaciones, descuentos ni precios congelados.')
        else
          Tarjeta(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final a in widget.datos.ajustes) _lineaAjuste(a)])),
        const SizedBox(height: 16),
        _Encabezado(
          titulo: 'Asignaciones (${widget.datos.asignaciones.length})',
          accion: BotonPrimario(
            'Asignar',
            _activas.isEmpty || widget.datos.tenants.isEmpty ? null : _formularioAsignar,
          ),
        ),
        if (widget.datos.asignaciones.isEmpty)
          _Vacio('Ninguna promoción asignada todavía.')
        else
          Tarjeta(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final g in widget.datos.asignaciones) _lineaAsignacion(g)])),
      ],
    );
  }

  Widget _tarjetaPlantilla(dynamic p) {
    final c = torreColorsOf(context);
    final activa = texto(p['status']) == 'active';
    final descripcion = texto(p['description']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(texto(p['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
              ChipEstado(_etiquetaEstado(texto(p['status'])), activo: activa),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              descripcion.isEmpty ? texto(p['code']) : '${texto(p['code'])} · $descripcion',
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: SelectableText(texto(p['config']), style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: () => _formularioPlantilla(p), child: const Text('Editar')),
          ),
        ],
      ),
    );
  }

  Widget _lineaAjuste(dynamic a) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${texto(a['tenantName'])} · ${texto(a['kind'])}', style: TextStyle(color: c.ink, fontSize: 14)),
                Text(_rango(a['startsOn'], a['endsOn']), style: TextStyle(color: c.muted, fontSize: 12)),
              ],
            ),
          ),
          ChipEstado(_etiquetaEstado(texto(a['status'])), activo: texto(a['status']) == 'active'),
        ],
      ),
    );
  }

  Widget _lineaAsignacion(dynamic g) {
    final c = torreColorsOf(context);
    final condiciones = texto(g['conditions']);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(texto(g['tenantName']), style: TextStyle(color: c.ink, fontSize: 14)),
                Text(
                  condiciones.isEmpty ? _rango(g['startsOn'], g['endsOn']) : '${_rango(g['startsOn'], g['endsOn'])} · $condiciones',
                  style: TextStyle(color: c.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          ChipEstado(_etiquetaEstado(texto(g['status'])), activo: texto(g['status']) == 'active'),
        ],
      ),
    );
  }

  String _etiquetaEstado(String estado) {
    switch (estado) {
      case 'active':
        return 'Activa';
      case 'draft':
        return 'Borrador';
      case 'archived':
        return 'Archivada';
      default:
        return estado.isEmpty ? '—' : estado;
    }
  }

  Future<void> _formularioPlantilla([dynamic promo]) async {
    final esEdicion = promo != null;
    final code = TextEditingController(text: esEdicion ? texto(promo['code']) : '');
    final name = TextEditingController(text: esEdicion ? texto(promo['name']) : '');
    final description = TextEditingController(text: esEdicion ? texto(promo['description']) : '');
    final config = TextEditingController(text: esEdicion && texto(promo['config']).isNotEmpty ? texto(promo['config']) : '{}');
    final estado = _Selector('Estado', _estadosPromocion, esEdicion ? texto(promo['status']) : 'draft');
    final guardado = await mostrarFormulario(
      context,
      titulo: esEdicion ? 'Guardar cambios' : 'Guardar plantilla',
      campos: [
        Campo(controller: code, label: 'Código'),
        Campo(controller: name, label: 'Nombre'),
        Campo(controller: description, label: 'Descripción', lineas: 2),
        Campo(controller: config, label: 'Configuración JSON', lineas: 4),
        estado.field(),
      ],
      guardar: () => widget.api.fn('savePromotion', <String, dynamic>{
        if (esEdicion) 'id': texto(promo['id']),
        'code': code.text.trim(),
        'name': name.text.trim(),
        'description': description.text.trim(),
        'status': estado.valor,
        'config': config.text.trim().isEmpty ? '{}' : config.text.trim(),
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Promoción guardada');
    widget.onCambio();
  }

  Future<void> _formularioAsignar() async {
    final promocion = _Selector('Promoción activa', [for (final p in _activas) _Opcion(texto(p['id']), texto(p['name']))], '');
    final tenant = _Selector('Tenant', [for (final t in widget.datos.tenants) _Opcion(texto(t['id']), texto(t['name']))], '');
    final desde = TextEditingController(text: _iso(DateTime.now()));
    final hasta = TextEditingController();
    final condiciones = TextEditingController();
    final evidencia = TextEditingController();
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Asignar promoción',
      campos: [
        promocion.field(),
        tenant.field(),
        _CampoFecha(controller: desde, label: 'Desde'),
        _CampoFecha(controller: hasta, label: 'Hasta', permitirVacio: true),
        Campo(controller: condiciones, label: 'Condiciones', lineas: 2),
        Campo(controller: evidencia, label: 'Referencia del acuerdo'),
      ],
      guardar: () {
        final startsOn = desde.text.trim();
        if (startsOn.isEmpty) throw TorreError('«Desde» necesita una fecha (AAAA-MM-DD).');
        return widget.api.fn('grantPromotion', <String, dynamic>{
          'promotionId': promocion.valor,
          'tenantId': tenant.valor,
          'startsOn': startsOn,
          'endsOn': hasta.text.trim(),
          'conditions': condiciones.text.trim(),
          'evidenceRef': evidencia.text.trim(),
        });
      },
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Asignada a ese tenant');
    widget.onCambio();
  }
}

class _CampoFecha extends StatelessWidget {
  const _CampoFecha({required this.controller, required this.label, this.permitirVacio = false});
  final TextEditingController controller;
  final String label;
  final bool permitirVacio;

  Future<void> _elegir(BuildContext context) async {
    final actual = DateTime.tryParse(controller.text.trim());
    final inicial = actual ?? DateTime.now();
    final elegida = await showDatePicker(
      context: context,
      initialDate: inicial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (elegida != null) controller.text = _iso(elegida);
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: Campo(controller: controller, label: label, ayuda: 'AAAA-MM-DD')),
        IconButton(
          tooltip: 'Elegir fecha',
          onPressed: () => _elegir(context),
          icon: const Icon(Icons.calendar_today_outlined, size: 20),
        ),
        if (permitirVacio)
          IconButton(
            tooltip: 'Sin fecha',
            onPressed: () => controller.text = '',
            icon: const Icon(Icons.clear, size: 20),
          ),
      ],
    );
  }
}

class _Encabezado extends StatelessWidget {
  const _Encabezado({required this.titulo, required this.accion});
  final String titulo;
  final Widget accion;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(child: Text(titulo, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink))),
          SizedBox(width: 150, child: accion),
        ],
      ),
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
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(texto, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink)),
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
