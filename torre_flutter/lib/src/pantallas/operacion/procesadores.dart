import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class PantallaProcesadores extends StatefulWidget {
  const PantallaProcesadores({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaProcesadores> createState() => _PantallaProcesadoresState();
}

class _PantallaProcesadoresState extends State<PantallaProcesadores> {
  int _version = 0;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('listProcessors');

  @override
  Widget build(BuildContext context) {
    return VistaDatos<List<dynamic>>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _ProcesadoresVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _ProcesadoresVista extends StatefulWidget {
  const _ProcesadoresVista({required this.datos, required this.api, required this.onCambio});
  final List<dynamic> datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_ProcesadoresVista> createState() => _ProcesadoresVistaState();
}

class _ProcesadoresVistaState extends State<_ProcesadoresVista> {
  final _filtro = TextEditingController();

  @override
  void dispose() {
    _filtro.dispose();
    super.dispose();
  }

  List<dynamic> get _filas {
    final needle = _filtro.text.trim().toLowerCase();
    if (needle.isEmpty) return widget.datos;
    return widget.datos
        .where((p) => '${texto(p['name'])} ${texto(p['category'])} ${texto(p['purpose'])}'.toLowerCase().contains(needle))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final filas = _filas;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Registro documental. No define si alguien es responsable o encargado: eso lo tiene que revisar un abogado.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _filtro,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(hintText: 'Filtrar'),
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(width: 150, child: BotonPrimario('Nuevo', _formulario)),
          ],
        ),
        const SizedBox(height: 14),
        Text('Procesadores (${filas.length})', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink)),
        const SizedBox(height: 8),
        if (filas.isEmpty)
          Text('Nada documentado todavía.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final p in filas) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(p)),
      ],
    );
  }

  Widget _tarjeta(dynamic p) {
    final c = torreColorsOf(context);
    final activo = texto(p['status']) == 'active';
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(texto(p['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
              ChipEstado(activo ? 'Activo' : texto(p['status']), activo: activo),
            ],
          ),
          if (texto(p['category']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(texto(p['category']), style: TextStyle(color: c.muted, fontSize: 13)),
            ),
          if (texto(p['purpose']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(texto(p['purpose']), style: TextStyle(color: c.inkSoft, fontSize: 13)),
            ),
          if (texto(p['legalRoleNote']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(texto(p['legalRoleNote']), style: TextStyle(color: c.muted, fontSize: 12)),
            ),
        ],
      ),
    );
  }

  Future<void> _formulario() async {
    final nombre = TextEditingController();
    final categoria = TextEditingController();
    final purpose = TextEditingController();
    final nota = TextEditingController();
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Documentar procesador',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: categoria, label: 'Categoría'),
        Campo(controller: purpose, label: 'Para qué se usa', lineas: 3),
        Campo(controller: nota, label: 'Nota jurídica', lineas: 3),
      ],
      guardar: () => widget.api.fn('saveProcessor', <String, dynamic>{
        'name': nombre.text.trim(),
        'category': categoria.text.trim(),
        'purpose': purpose.text.trim(),
        'legalRoleNote': nota.text.trim(),
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Procesador documentado');
    widget.onCambio();
  }
}
