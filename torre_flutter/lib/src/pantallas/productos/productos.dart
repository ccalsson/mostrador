import 'dart:convert';

import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _tipos = <String, String>{
  'base_product': 'Producto base',
  'addon': 'Add-on',
  'branch': 'Sucursal',
  'subscription': 'Suscripción',
  'advertising': 'Publicidad',
  'messaging': 'Mensajería',
  'commission': 'Comisión',
  'free': 'Sin cargo',
};

const _modalidades = <String, String>{
  'once': 'Único',
  'recurring': 'Recurrente',
  'commission': 'Comisión',
  'free': 'Sin cargo',
};

const _frecuencias = <String, String>{
  'once': 'Única',
  'monthly': 'Mensual',
  'yearly': 'Anual',
};

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

/// Como `textoArs` de la web: oficial × 1,05 para arriba al próximo $100.
String _textoArs(dynamic usd, dynamic venta) {
  if (usd == null || venta == null) return '';
  final cotizacion = numero(venta);
  if (!(cotizacion > 0)) return '';
  final margen = numero(usd) * cotizacion * 1.05;
  final total = (margen / 100).ceilToDouble() * 100;
  return '\$${fmtMoneda(total).replaceAll(RegExp(r',00$'), '')}';
}

String _numero(dynamic v) {
  if (v == null) return '';
  if (v is num) return v == v.roundToDouble() ? v.toInt().toString() : v.toString();
  return texto(v);
}

String _precioTexto(String v) {
  final limpio = v.trim();
  if (limpio.isEmpty) return '';
  final n = numero(limpio);
  return n == n.roundToDouble() ? n.toInt().toString() : n.toString();
}

String _catalogo(dynamic p, dynamic venta) {
  String par(String titulo, dynamic usd) {
    if (usd == null) return '';
    final pesos = _textoArs(usd, venta);
    return '$titulo USD ${_numero(usd)}${pesos.isEmpty ? '' : ' · $pesos'}';
  }

  final partes = [
    par('impl.', p['setupUsd']),
    par('abono', p['recurringUsd']),
    par('único', p['onceUsd']),
  ].where((x) => x.isNotEmpty).toList();
  return partes.isEmpty ? 'sin precio' : partes.join(' · ');
}

String _pista(dynamic configJson) {
  final crudo = texto(configJson);
  if (crudo.isEmpty) return '';
  Object? decodificado;
  try {
    decodificado = jsonDecode(crudo);
  } catch (_) {
    return '';
  }
  if (decodificado is! Map) return '';
  final cfg = decodificado;
  final percentMin = cfg['percentMin'];
  final partes = [
    texto(cfg['family']),
    texto(cfg['placement']),
    cfg['sends'] == null ? '' : '${_numero(cfg['sends'])} envíos',
    percentMin == null ? '' : '${_numero(percentMin)}–${_numero(cfg['percentMax'] ?? percentMin)}%',
  ].where((x) => x.isNotEmpty).toList();
  return partes.join(' · ');
}

String _tipoLabel(String kind) => _tipos[kind] ?? kind;

class _ProductosDatos {
  _ProductosDatos(this.productos, this.cambio, this.apps);
  final List<dynamic> productos;
  final Map<String, dynamic> cambio;
  final List<dynamic> apps;

  dynamic get venta => (cambio['dolar'] as Map?)?['venta'];
}

class PantallaProductos extends StatefulWidget {
  const PantallaProductos({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaProductos> createState() => _PantallaProductosState();
}

class _PantallaProductosState extends State<PantallaProductos> {
  int _version = 0;

  Future<_ProductosDatos> _cargar() async {
    final productos = await widget.api.fnLista('listProducts');
    final cambio = await widget.api.fnMapa('leerMedioPago');
    final apps = await widget.api.fnLista('listApps');
    return _ProductosDatos(productos, cambio, apps);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_ProductosDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _ProductosVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _ProductosVista extends StatelessWidget {
  const _ProductosVista({required this.datos, required this.api, required this.onCambio});
  final _ProductosDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final dolar = datos.cambio['dolar'];
    final detalle = dolar == null
        ? '. Sin cotización, no se convierte.'
        : ' (${texto(dolar['source'])} ${_numero(dolar['venta'])}).';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Catálogo en dólares. El peso sale del mismo oficial que ve el mostrador$detalle '
          'Cambiar un precio no reescribe contratos ya firmados.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Align(alignment: Alignment.centerLeft, child: BotonPrimario('Nuevo', () => _formulario(context, null))),
        const SizedBox(height: 14),
        if (datos.productos.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final p in datos.productos)
            Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(context, p)),
      ],
    );
  }

  Widget _tarjeta(BuildContext context, dynamic p) {
    final c = torreColorsOf(context);
    final activo = texto(p['status']) == 'active';
    final pista = _pista(p['configJson']);
    final etiqueta = _tipoLabel(texto(p['kind']));
    final slug = texto(p['slug']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(texto(p['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              [etiqueta, slug, pista].where((x) => x.isNotEmpty).join(' · '),
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(child: Text(_catalogo(p, datos.venta), style: TextStyle(color: c.inkSoft, fontSize: 13))),
              ChipEstado(texto(p['status']), activo: activo),
              TextButton(onPressed: () => _formulario(context, p), child: const Text('Editar')),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _formulario(BuildContext context, dynamic producto) async {
    final esEdicion = producto != null;
    final nombre = TextEditingController(text: esEdicion ? texto(producto['name']) : '');
    final slug = TextEditingController(text: esEdicion ? texto(producto['slug']) : '');
    final descripcion = TextEditingController(text: esEdicion ? texto(producto['description']) : '');
    final setupUsd = TextEditingController(text: esEdicion ? _numero(producto['setupUsd']) : '');
    final setupArs = TextEditingController(text: esEdicion ? _numero(producto['setupArs']) : '');
    final recurringUsd = TextEditingController(text: esEdicion ? _numero(producto['recurringUsd']) : '');
    final recurringArs = TextEditingController(text: esEdicion ? _numero(producto['recurringArs']) : '');
    final onceUsd = TextEditingController(text: esEdicion ? _numero(producto['onceUsd']) : '');
    final onceArs = TextEditingController(text: esEdicion ? _numero(producto['onceArs']) : '');
    final unidad = TextEditingController(text: esEdicion ? texto(producto['unitLabel']) : '');
    final config = TextEditingController(text: esEdicion ? texto(producto['configJson']) : '{}');
    final tipo = _Selector(
      'Tipo',
      [for (final e in _tipos.entries) _Opcion(e.key, e.value)],
      esEdicion ? texto(producto['kind']) : 'addon',
    );
    final aplicacion = _Selector(
      'Aplicación',
      [
        const _Opcion('', 'Sin aplicación'),
        for (final a in datos.apps) _Opcion(texto(a['id']), texto(a['name'])),
      ],
      esEdicion ? texto(producto['appId']) : '',
    );
    final modalidad = _Selector(
      'Modalidad',
      [for (final e in _modalidades.entries) _Opcion(e.key, e.value)],
      esEdicion ? texto(producto['billing']) : 'recurring',
    );
    final frecuencia = _Selector(
      'Frecuencia',
      [for (final e in _frecuencias.entries) _Opcion(e.key, e.value)],
      esEdicion ? texto(producto['frequency']) : 'monthly',
    );
    final estado = _Selector(
      'Estado',
      const [_Opcion('active', 'Activo'), _Opcion('archived', 'Archivado')],
      esEdicion ? texto(producto['status']) : 'active',
    );
    final numeric = const TextInputType.numberWithOptions(decimal: true);
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Ficha',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: slug, label: 'Slug'),
        Campo(controller: descripcion, label: 'Descripción', lineas: 2),
        tipo.field(),
        aplicacion.field(),
        modalidad.field(),
        frecuencia.field(),
        Campo(controller: setupUsd, label: 'Implementación USD', teclado: numeric),
        Campo(controller: setupArs, label: 'Implementación ARS', teclado: numeric),
        Campo(controller: recurringUsd, label: 'Recurrente USD', teclado: numeric),
        Campo(controller: recurringArs, label: 'Recurrente ARS', teclado: numeric),
        Campo(controller: onceUsd, label: 'Único USD', teclado: numeric),
        Campo(controller: onceArs, label: 'Único ARS', teclado: numeric),
        Campo(controller: unidad, label: 'Unidad'),
        Campo(controller: config, label: 'Configuración JSON', lineas: 3),
        estado.field(),
      ],
      guardar: () => api.fn('saveProduct', <String, dynamic>{
        if (esEdicion) 'id': texto(producto['id']),
        'name': nombre.text.trim(),
        'slug': slug.text.trim(),
        'description': descripcion.text.trim(),
        'kind': tipo.valor,
        'appId': aplicacion.valor,
        'billing': modalidad.valor,
        'frequency': frecuencia.valor,
        'setupUsd': _precioTexto(setupUsd.text),
        'setupArs': _precioTexto(setupArs.text),
        'recurringUsd': _precioTexto(recurringUsd.text),
        'recurringArs': _precioTexto(recurringArs.text),
        'onceUsd': _precioTexto(onceUsd.text),
        'onceArs': _precioTexto(onceArs.text),
        'unitLabel': unidad.text.trim(),
        'config': config.text.trim(),
        'status': estado.valor,
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Producto guardado.');
    onCambio();
  }
}
