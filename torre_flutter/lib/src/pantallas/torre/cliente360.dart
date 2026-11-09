import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _apps = ['Mostrador', 'Mercado', 'Super', 'Materiales'];

class PantallaCliente360 extends StatefulWidget {
  const PantallaCliente360({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaCliente360> createState() => _PantallaCliente360State();
}

class _PantallaCliente360State extends State<PantallaCliente360> {
  final _controlador = TextEditingController();
  String _busqueda = '';
  String _app = '';
  int _version = 0;

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<List<dynamic>> _cargar() => widget.api.fnLista('cliente360', <String, dynamic>{
        'filtros': <String, dynamic>{
          'busqueda': _busqueda.trim(),
          'app': _app,
        },
      });

  void _buscar(String v) => setState(() {
        _busqueda = v;
        _version++;
      });

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'El mismo cliente visto en Mostrador, Mercado, Super al Toque y Materiales Ya.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _controlador,
          textInputAction: TextInputAction.search,
          onSubmitted: _buscar,
          decoration: InputDecoration(
            hintText: 'Buscar por nombre, email o teléfono',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: IconButton(
              icon: const Icon(Icons.arrow_forward, size: 20),
              onPressed: () => _buscar(_controlador.text),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Todas'),
              selected: _app.isEmpty,
              onSelected: (_) => setState(() {
                _app = '';
                _version++;
              }),
            ),
            for (final a in _apps)
              ChoiceChip(
                label: Text(a),
                selected: _app == a,
                onSelected: (_) => setState(() {
                  _app = a;
                  _version++;
                }),
              ),
          ],
        ),
        const SizedBox(height: 14),
        VistaDatos<List<dynamic>>(
          key: ValueKey('c360-$_version-$_busqueda-$_app'),
          cargar: _cargar,
          builder: (context, datos) {
            if (datos.isEmpty) return Text('Sin resultados.', style: TextStyle(color: c.muted));
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final cli in datos)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => _detalle(context, texto(cli['id'])),
                      child: Tarjeta(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(texto(cli['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                                ),
                                Text(_plata(cli['lifetimeValue']), style: TextStyle(color: c.leaf, fontWeight: FontWeight.w600)),
                              ],
                            ),
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                [texto(cli['email']), texto(cli['telefono'])].firstWhere((v) => v.isNotEmpty, orElse: () => 'Sin contacto'),
                                style: TextStyle(color: c.muted, fontSize: 13),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                for (final a in (cli['apps'] as List? ?? const []))
                                  ChipEstado('${texto(a['nombre'])} · ${texto(a['estado'])}', activo: texto(a['estado']) != 'pendiente'),
                                Text(
                                  '${texto(cli['totalCompras'])} compras · ${_plata(cli['ticketPromedio'])} ticket',
                                  style: TextStyle(color: c.muted, fontSize: 12),
                                ),
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

  void _detalle(BuildContext context, String id) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _DetalleCliente360(api: widget.api, id: id),
    );
  }
}

String _plata(dynamic v) => fmtMoneda(v, 'ARS');

class _DetalleCliente360 extends StatefulWidget {
  const _DetalleCliente360({required this.api, required this.id});
  final TorreApi api;
  final String id;

  @override
  State<_DetalleCliente360> createState() => _DetalleCliente360State();
}

class _DetalleCliente360State extends State<_DetalleCliente360> {
  Future<Map<String, dynamic>> _cargar() => widget.api.fnMapa('detalleCliente360', <String, dynamic>{'id': widget.id});

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (context, controller) => Padding(
        padding: const EdgeInsets.all(16),
        child: VistaDatos<Map<String, dynamic>>(
          cargar: _cargar,
          builder: (context, res) {
            final cliente = res['cliente'] as Map? ?? const {};
            return ListView(
              controller: controller,
              children: [
                Text(texto(cliente['nombre']), style: TextStyle(fontFamily: 'serif', fontSize: 20, fontWeight: FontWeight.w600, color: c.ink)),
                Text(
                  [texto(cliente['email']), texto(cliente['telefono'])].firstWhere((v) => v.isNotEmpty, orElse: () => 'Sin contacto'),
                  style: TextStyle(fontSize: 13, color: c.muted),
                ),
                const SizedBox(height: 12),
                KpiGrilla([
                  ('Lifetime value', _plata(cliente['lifetimeValue'])),
                  ('Compras', texto(cliente['totalCompras'])),
                  ('Ticket promedio', _plata(cliente['ticketPromedio'])),
                  ('App preferida', texto(cliente['appPreferida']).isEmpty ? '—' : texto(cliente['appPreferida'])),
                ]),
                const SizedBox(height: 14),
                Text('Presencia por app', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [for (final a in (cliente['apps'] as List? ?? const [])) ChipEstado('${texto(a['nombre'])} · ${texto(a['estado'])}', activo: texto(a['estado']) != 'pendiente')],
                ),
                const SizedBox(height: 14),
                _Historial(titulo: 'Historial Mostrador', rows: res['historialMostrador'] as List? ?? const []),
                _Historial(titulo: 'Historial Mercado', rows: res['historialMercado'] as List? ?? const []),
                _Historial(titulo: 'Historial Super al Toque', rows: res['historialSuper'] as List? ?? const []),
                _Historial(titulo: 'Historial Materiales Ya', rows: res['historialMateriales'] as List? ?? const []),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Historial extends StatelessWidget {
  const _Historial({required this.titulo, required this.rows});
  final String titulo;
  final List<dynamic> rows;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(titulo, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
          const SizedBox(height: 6),
          if (rows.isEmpty)
            Text('Sin movimientos.', style: TextStyle(color: c.muted, fontSize: 13))
          else
            for (final r in rows.take(20))
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Expanded(child: Text(fmtFecha(r['fecha']), style: TextStyle(color: c.ink, fontSize: 13))),
                    Text(_plata(r['monto']), style: TextStyle(color: c.muted, fontSize: 13)),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}
