import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _numero(dynamic v) {
  if (v == null) return '';
  if (v is num) return v == v.roundToDouble() ? v.toInt().toString() : v.toString();
  return texto(v);
}

/// Como `monto` de la web: "USD 12 · ARS 300", o "0" sin monedas.
String _monto(dynamic total) {
  if (total is! Map || total.isEmpty) return '0';
  return total.entries.map((e) => '${texto(e.key)} ${_numero(e.value)}').join(' · ');
}

String _catalogo(dynamic p) {
  final bits = <String>[];
  void put(String label, dynamic usd, dynamic ars) {
    final partes = [
      if (usd != null) 'USD ${_numero(usd)}',
      if (ars != null) 'ARS ${_numero(ars)}',
    ];
    if (partes.isNotEmpty) bits.add('$label ${partes.join(' / ')}');
  }

  put('implementación', p['setupUsd'], p['setupArs']);
  put('recurrente', p['recurringUsd'], p['recurringArs']);
  put('único', p['onceUsd'], p['onceArs']);
  return bits.isEmpty ? 'sin precio en el catálogo' : bits.join(' · ');
}

class _Opcion {
  const _Opcion(this.id, this.label);
  final String id;
  final String label;
}

class _Selector {
  _Selector(this.label, this.opciones, String inicial, {this.alCambiar})
      : valor = opciones.any((o) => o.id == inicial) ? inicial : (opciones.isEmpty ? '' : opciones.first.id);

  final String label;
  final List<_Opcion> opciones;
  final ValueChanged<String>? alCambiar;
  String valor;

  Widget field() => Desplegable(
        label: label,
        valor: _etiquetaActual(),
        opciones: [for (final o in opciones) o.label],
        onChanged: (v) {
          valor = opciones.firstWhere((o) => o.label == v).id;
          alCambiar?.call(valor);
        },
      );

  String _etiquetaActual() {
    for (final o in opciones) {
      if (o.id == valor) return o.label;
    }
    return opciones.isEmpty ? '' : opciones.first.label;
  }
}

class _ServiciosDatos {
  _ServiciosDatos(this.tenants, this.products, this.chosen, this.servicios);
  final List<dynamic> tenants;
  final List<dynamic> products;
  final String chosen;
  final Map<String, dynamic> servicios;

  List<dynamic> get lines => servicios['lines'] as List? ?? const [];
  List<dynamic> get branches => servicios['branches'] as List? ?? const [];
}

class PantallaServicios extends StatefulWidget {
  const PantallaServicios({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaServicios> createState() => _PantallaServiciosState();
}

class _PantallaServiciosState extends State<PantallaServicios> {
  int _version = 0;
  String? _tenantElegido;

  Future<_ServiciosDatos> _cargar() async {
    final tenants = await widget.api.fnLista('listTenants');
    final products = await widget.api.fnLista('listProducts');
    final elegido = _tenantElegido != null && tenants.any((t) => texto(t['id']) == _tenantElegido)
        ? _tenantElegido!
        : (tenants.isEmpty ? '' : texto(tenants.first['id']));
    final servicios = elegido.isEmpty ? <String, dynamic>{} : await widget.api.fnMapa('serviciosDeTenant', elegido);
    return _ServiciosDatos(tenants, products, elegido, servicios);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_ServiciosDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _ServiciosVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
        onTenant: (id) => setState(() {
          _tenantElegido = id;
          _version++;
        }),
      ),
    );
  }
}

class _ServiciosVista extends StatefulWidget {
  const _ServiciosVista({required this.datos, required this.api, required this.onCambio, required this.onTenant});
  final _ServiciosDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;
  final ValueChanged<String> onTenant;

  @override
  State<_ServiciosVista> createState() => _ServiciosVistaState();
}

class _ServiciosVistaState extends State<_ServiciosVista> {
  final _cantidad = TextEditingController(text: '1');
  final _notas = TextEditingController();
  final _moneda = _Selector('Moneda del contrato', const [_Opcion('USD', 'USD'), _Opcion('ARS', 'ARS')], 'USD');
  bool _ocupado = false;

  @override
  void dispose() {
    _cantidad.dispose();
    _notas.dispose();
    super.dispose();
  }

  List<dynamic> get _ofrecidos =>
      widget.datos.products.where((p) => texto(p['status']) == 'active' && texto(p['kind']) != 'commission').toList();

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final datos = widget.datos;
    final tenantOptions = [for (final t in datos.tenants) _Opcion(texto(t['id']), texto(t['name']))];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (tenantOptions.isEmpty)
          Text('No hay negocios.', style: TextStyle(color: c.muted))
        else
          _Selector('Tenant', tenantOptions, datos.chosen, alCambiar: widget.onTenant).field(),
        const SizedBox(height: 12),
        Text('Mensual contratado: ${_monto(datos.servicios['monthly'])}', style: TextStyle(color: c.ink, fontSize: 14)),
        const SizedBox(height: 4),
        Text('A cobrar ahora: ${_monto(datos.servicios['monthlyDue'])}', style: TextStyle(color: c.ink, fontSize: 14)),
        const SizedBox(height: 16),
        _Subtitulo('Contratado'),
        if (datos.lines.isEmpty)
          Text('Sin líneas contratadas.', style: TextStyle(color: c.muted))
        else
          for (final l in datos.lines) Padding(padding: const EdgeInsets.only(bottom: 8), child: _linea(l)),
        const SizedBox(height: 8),
        _Subtitulo('Sucursales'),
        if (datos.branches.isEmpty)
          Text('Sin sucursales.', style: TextStyle(color: c.muted))
        else
          for (final b in datos.branches)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '${texto(b['name'])} · ${b['included'] == true ? 'incluida' : 'adicional'} · ${texto(b['status'])}',
                style: TextStyle(color: c.inkSoft, fontSize: 13),
              ),
            ),
        const SizedBox(height: 16),
        _Subtitulo('Contratar'),
        Text(
          'El precio de catálogo se muestra para elegir. El importe de la línea lo fija el servidor. '
          'Publicidad solo habilita el espacio: el dueño publica el banner en Mostrador.',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
        const SizedBox(height: 10),
        _moneda.field(),
        const SizedBox(height: 10),
        Campo(
          controller: _cantidad,
          label: 'Cantidad',
          teclado: const TextInputType.numberWithOptions(decimal: true),
        ),
        const SizedBox(height: 10),
        Campo(controller: _notas, label: 'Notas'),
        const SizedBox(height: 12),
        for (final p in _ofrecidos) Padding(padding: const EdgeInsets.only(bottom: 8), child: _producto(p)),
      ],
    );
  }

  Widget _linea(dynamic l) {
    final c = torreColorsOf(context);
    final activa = texto(l['status']) == 'active';
    final detalle = <String>[
      '${_numero(l['quantity'])} × ${texto(l['currency'])} ${_numero(l['unitPrice'])}',
      texto(l['charge']),
      texto(l['frequency']),
      if (l['amountDue'] != l['subtotal']) 'a cobrar ${texto(l['currency'])} ${_numero(l['amountDue'])}',
      if (l['frozen'] == true) 'precio congelado',
      if (texto(l['startsOn']).isNotEmpty) 'desde ${texto(l['startsOn'])}',
      if (texto(l['endsOn']).isNotEmpty) 'hasta ${texto(l['endsOn'])}',
      if (texto(l['nextDue']).isNotEmpty) 'próximo ${texto(l['nextDue'])}',
      if (texto(l['notes']).isNotEmpty) texto(l['notes']),
    ].join(' · ');
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${texto(l['productName'])}${texto(l['charge']) == 'setup' ? ' · implementación' : ''}',
                  style: TextStyle(color: c.ink, fontWeight: FontWeight.w600),
                ),
              ),
              ChipEstado(texto(l['status']), activo: activa),
            ],
          ),
          const SizedBox(height: 4),
          Text(detalle, style: TextStyle(color: c.muted, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _producto(dynamic p) {
    final c = torreColorsOf(context);
    final kind = texto(p['kind']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${texto(p['name'])} · $kind · ${texto(p['slug'])}',
            style: TextStyle(color: c.ink, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(_catalogo(p), style: TextStyle(color: c.muted, fontSize: 12)),
          const SizedBox(height: 8),
          if (kind == 'branch' || kind == 'commission')
            Text(
              kind == 'branch' ? 'Alta en Sucursales' : 'Condición en el catálogo',
              style: TextStyle(color: c.muted, fontSize: 12),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SizedBox(
                  width: 150,
                  child: BotonPrimario('Contratar', _ocupado || widget.datos.chosen.isEmpty ? null : () => _contratar(p), ocupado: _ocupado),
                ),
                if (kind == 'addon')
                  TextButton(onPressed: _ocupado ? null : () => _reemplazar(p), child: const Text('Reemplazar')),
              ],
            ),
        ],
      ),
    );
  }

  Future<void> _contratar(dynamic p) async {
    setState(() => _ocupado = true);
    try {
      final res = await widget.api.fnMapa('contratarProducto', <String, dynamic>{
        'tenantId': widget.datos.chosen,
        'productId': texto(p['id']),
        'currency': _moneda.valor,
        'quantity': _cantidadNumero(),
        'start': _iso(DateTime.now()),
        'notes': _notas.text.trim(),
        'contentRef': '',
      });
      if (!mounted) return;
      final note = texto(res['note']);
      aviso(context, note.isNotEmpty ? note : 'Mensual: ${_monto(res['monthly'])}');
      widget.onCambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _reemplazar(dynamic p) async {
    dynamic activa;
    for (final l in widget.datos.lines) {
      if (texto(l['kind']) == 'addon' && texto(l['status']) == 'active' && texto(l['charge']) == 'recurring') {
        activa = l;
        break;
      }
    }
    if (activa == null) {
      aviso(context, 'No hay un add-on activo para reemplazar.');
      return;
    }
    final ok = await confirmarTorre(
      context,
      'Reemplazar servicio',
      '¿Reemplazar ${texto(activa['productName'])} por ${texto(p['name'])}? El precio viejo queda en la línea cerrada.',
    );
    if (!ok || !mounted) return;
    setState(() => _ocupado = true);
    try {
      await widget.api.fn('reemplazarProducto', <String, dynamic>{
        'lineId': texto(activa['id']),
        'productId': texto(p['id']),
        'currency': _moneda.valor,
      });
      if (!mounted) return;
      aviso(context, 'Servicio reemplazado');
      widget.onCambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  int _cantidadNumero() {
    final n = numero(_cantidad.text);
    return n < 1 ? 1 : n.round();
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
      child: Text(texto, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink)),
    );
  }
}
