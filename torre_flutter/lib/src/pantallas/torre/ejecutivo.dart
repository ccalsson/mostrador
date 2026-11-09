import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class PantallaEjecutivo extends StatefulWidget {
  const PantallaEjecutivo({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaEjecutivo> createState() => _PantallaEjecutivoState();
}

class _PantallaEjecutivoState extends State<PantallaEjecutivo> {
  static const _rangos = [(1, 'Hoy'), (7, '7 días'), (30, '30 días')];
  int _dias = 1;

  Future<Map<String, dynamic>> _cargar() => widget.api.fnMapa('dashboardEjecutivo', <String, dynamic>{'dias': _dias});

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Visión cross-app de ventas, usuarios y operación en un solo pantallazo.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            for (final (valor, etiqueta) in _rangos)
              ChoiceChip(
                label: Text(etiqueta),
                selected: _dias == valor,
                onSelected: (_) => setState(() => _dias = valor),
              ),
          ],
        ),
        const SizedBox(height: 14),
        VistaDatos<Map<String, dynamic>>(
          key: ValueKey('ejecutivo-$_dias'),
          cargar: _cargar,
          builder: (context, d) => _contenido(context, d),
        ),
      ],
    );
  }

  Widget _contenido(BuildContext context, Map<String, dynamic> d) {
    final c = torreColorsOf(context);
    final revenue = d['revenue'] as Map? ?? const {};
    final usuarios = d['usuariosActivos'] as Map? ?? const {};
    final enCurso = d['pedidosEnCurso'] as Map? ?? const {};
    final top = d['topProductos'] as List? ?? const [];
    final alertas = d['alertas'] as List? ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Subtitulo('Ingresos'),
        KpiGrilla([
          ('Total · ${_plata(d['revenueTotal'])}', 'últimos ${texto(d['dias'])} días'),
          ('Mostrador', _plata(revenue['mostrador'])),
          ('Mercado al Toque', _plata(revenue['mercado'])),
          ('Super al Toque', _plata(revenue['superAlToque'])),
          ('Materiales Ya', _plata(revenue['materialesYa'])),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Usuarios activos'),
        KpiGrilla([
          ('Total', texto(usuarios['total'])),
          ('Staff', texto(usuarios['staff'])),
          ('Clientes', texto(usuarios['clientes'])),
          ('Compradores', texto(usuarios['compradores'])),
          ('Cargadores', texto(usuarios['cargadores'])),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Pedidos en curso'),
        KpiGrilla([
          ('Total', texto(enCurso['total'])),
          ('Enviados', texto(enCurso['enviados'])),
          ('En preparación', texto(enCurso['enPreparacion'])),
          ('Listos', texto(enCurso['listos'])),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Top productos'),
        if (top.isEmpty)
          Text('Sin ventas en este período.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final p in top)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Tarjeta(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(texto(p['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    ),
                    Text('${texto(p['cantidad'])} u · ${_plata(p['total'])}', style: TextStyle(color: c.muted, fontSize: 13)),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 10),
        _Subtitulo('Alertas (${alertas.length})'),
        const SizedBox(height: 8),
        if (alertas.isEmpty)
          Text('Nada pendiente.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final a in alertas)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    ChipEstado(_tipoAlerta(texto(a['tipo'])), activo: texto(a['tipo']) != 'pago'),
                    const SizedBox(width: 10),
                    Expanded(child: Text(texto(a['texto']), style: TextStyle(color: c.terra, fontSize: 13))),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  static String _tipoAlerta(String tipo) {
    if (tipo == 'stock') return 'Stock';
    if (tipo == 'pago') return 'Pago';
    return tipo.isEmpty ? 'Aviso' : tipo;
  }
}

String _plata(dynamic v) => fmtMoneda(v, 'ARS');

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
