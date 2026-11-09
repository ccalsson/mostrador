import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const List<String> _contractuales = ['legal_document', 'legal_version', 'tenant_contract', 'processor'];

/// Igual que la web: lo legal es contractual, todo lo demás comercial.
String _clase(String entity) => _contractuales.contains(entity) ? 'contractual' : 'comercial';

class _Filtro {
  const _Filtro(this.id, this.label);
  final String id;
  final String label;
}

const List<_Filtro> _filtros = [
  _Filtro('todos', 'Eventos'),
  _Filtro('comercial', 'Cambios comerciales'),
  _Filtro('contractual', 'Cambios contractuales'),
];

class PantallaAuditoria extends StatefulWidget {
  const PantallaAuditoria({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaAuditoria> createState() => _PantallaAuditoriaState();
}

class _PantallaAuditoriaState extends State<PantallaAuditoria> {
  int _version = 0;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('listAudit');

  @override
  Widget build(BuildContext context) {
    return VistaDatos<List<dynamic>>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _AuditoriaVista(
        filas: datos,
        onRecargar: () => setState(() => _version++),
      ),
    );
  }
}

class _AuditoriaVista extends StatefulWidget {
  const _AuditoriaVista({required this.filas, required this.onRecargar});
  final List<dynamic> filas;
  final VoidCallback onRecargar;

  @override
  State<_AuditoriaVista> createState() => _AuditoriaVistaState();
}

class _AuditoriaVistaState extends State<_AuditoriaVista> {
  String _filtro = 'todos';

  List<dynamic> get _visibles => widget.filas
      .where((r) => _filtro == 'todos' || _clase(texto(r['entity'])) == _filtro)
      .toList();

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final filas = _visibles;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Este registro no se edita desde Torre. Cada fila la escribe el servidor.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final f in _filtros)
                    InkWell(
                      borderRadius: BorderRadius.circular(28),
                      onTap: () => setState(() => _filtro = f.id),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        decoration: BoxDecoration(
                          color: _filtro == f.id ? c.ink : Colors.transparent,
                          border: Border.all(color: _filtro == f.id ? c.ink : c.line),
                          borderRadius: BorderRadius.circular(28),
                        ),
                        child: Text(
                          f.label,
                          style: TextStyle(fontSize: 13, color: _filtro == f.id ? c.paper : c.ink),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            TextButton(onPressed: widget.onRecargar, child: const Text('Recargar')),
          ],
        ),
        const SizedBox(height: 14),
        if (filas.isEmpty)
          Text('No hay eventos en esta vista.', style: TextStyle(color: c.muted))
        else
          for (final r in filas) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(r)),
      ],
    );
  }

  Widget _tarjeta(dynamic fila) {
    final c = torreColorsOf(context);
    final metadata = texto(fila['metadata']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(texto(fila['action']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${texto(fila['entity'])} ${texto(fila['entityId'])}',
              style: TextStyle(color: c.muted, fontSize: 13),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${texto(fila['actor'])} · ${texto(fila['at'])}',
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          if (metadata.isNotEmpty && metadata != '{}')
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(metadata, style: TextStyle(color: c.muted, fontSize: 11, fontFamily: 'monospace')),
            ),
        ],
      ),
    );
  }
}
