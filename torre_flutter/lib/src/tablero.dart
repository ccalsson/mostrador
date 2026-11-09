import 'dart:convert';

import 'package:flutter/material.dart';

import 'api.dart';
import 'tema.dart';
import 'widgets.dart';

class _TableroDatos {
  _TableroDatos(this.tablero, this.pedidos);
  final Map<String, dynamic> tablero;
  final List<dynamic> pedidos;
}

class PantallaTablero extends StatefulWidget {
  const PantallaTablero({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaTablero> createState() => _PantallaTableroState();
}

class _PantallaTableroState extends State<PantallaTablero> {
  int _version = 0;

  Future<_TableroDatos> _cargar() async {
    final tablero = await widget.api.fnMapa('dashboardTorre');
    final pedidos = await widget.api.fnLista('pedidosAddon');
    return _TableroDatos(tablero, pedidos);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_TableroDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _TableroVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _TableroVista extends StatefulWidget {
  const _TableroVista({required this.datos, required this.api, required this.onCambio});
  final _TableroDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_TableroVista> createState() => _TableroVistaState();
}

class _TableroVistaState extends State<_TableroVista> {
  bool _ocupado = false;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final t = widget.datos.tablero;
    final cobrado = (t['incomeByCurrency'] as List? ?? const [])
        .map((m) => fmtMoneda(m['amount'], texto(m['currency'])))
        .join('  ·  ');
    final alertas = t['alertas'] as List? ?? const [];
    final aplicaciones = t['aplicaciones'] as List? ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Negocios activos', texto(t['tenants'])),
          ('Clientes', texto(t['clients'])),
          ('Aplicaciones', texto(t['apps'])),
          ('Cobrado del mes', cobrado.isEmpty ? fmtMoneda(t['income']) : cobrado),
          ('Gastos', fmtMoneda(t['expenses'])),
          ('Margen', fmtMoneda(t['margin'])),
        ]),
        const SizedBox(height: 18),
        _Subtitulo('Para habilitar (${widget.datos.pedidos.length})'),
        if (widget.datos.pedidos.isEmpty)
          Text('Nada pendiente.', style: TextStyle(color: c.muted))
        else
          for (final p in widget.datos.pedidos) _pedido(p),
        const SizedBox(height: 18),
        _Subtitulo('Alertas (${alertas.length})'),
        if (alertas.isEmpty)
          Text('Sin alertas.', style: TextStyle(color: c.muted))
        else
          for (final a in alertas)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
                child: Text(texto(a['texto']), style: TextStyle(color: c.terra)),
              ),
            ),
        const SizedBox(height: 18),
        _Subtitulo('Aplicaciones'),
        for (final a in aplicaciones)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Tarjeta(
              child: Row(
                children: [
                  Expanded(child: Text(texto(a['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                  Text('${texto(a['tenants'])} negocios', style: TextStyle(color: c.muted, fontSize: 12)),
                  const SizedBox(width: 10),
                  ChipEstado(texto(a['status']), activo: texto(a['status']) == 'active'),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _pedido(dynamic p) {
    final c = torreColorsOf(context);
    final tieneComprobante = p['tieneComprobante'] == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Tarjeta(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('${texto(p['tenant'])} pidió ${texto(p['product'])}', style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(
              '${fmtMoneda(p['amount'], texto(p['currency']))} · ${texto(p['medio']) == 'cuenta' ? 'a cargo en cuenta' : texto(p['medio'])}',
              style: TextStyle(color: c.muted, fontSize: 13),
            ),
            if (texto(p['notes']).isNotEmpty)
              Padding(padding: const EdgeInsets.only(top: 4), child: Text(texto(p['notes']), style: TextStyle(color: c.inkSoft, fontSize: 13))),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: BotonPrimario('Habilitar', _ocupado ? null : () => _habilitar(texto(p['id'])), ocupado: _ocupado)),
                if (tieneComprobante) ...[
                  const SizedBox(width: 8),
                  TextButton(onPressed: () => _verComprobante(texto(p['id'])), child: const Text('Comprobante')),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _habilitar(String id) async {
    if (!await confirmarTorre(context, 'Habilitar add-on', 'Crea la línea del producto y marca el pago como pagado.')) return;
    setState(() => _ocupado = true);
    try {
      await widget.api.fn('habilitarPedidoAddon', id);
      if (!mounted) return;
      aviso(context, 'Pedido habilitado.');
      widget.onCambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _verComprobante(String id) async {
    try {
      final data = await widget.api.fnMapa('comprobantePago', id);
      final url = texto(data['data']);
      final base64 = url.contains(',') ? url.split(',').last : '';
      if (base64.isEmpty || !mounted) return;
      final bytes = base64Decode(base64);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(texto(data['nombre'])),
          content: SizedBox(width: 420, child: InteractiveViewer(child: Image.memory(bytes))),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
        ),
      );
    } catch (e) {
      if (mounted) aviso(context, '$e');
    }
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
