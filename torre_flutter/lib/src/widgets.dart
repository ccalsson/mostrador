import 'package:flutter/material.dart';

import 'tema.dart';

String texto(dynamic v) => v == null ? '' : v.toString();

double numero(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse(texto(v).replaceAll(',', '.')) ?? 0;
}

String fmtMoneda(dynamic v, [String currency = '']) {
  final n = numero(v);
  final partes = n.toStringAsFixed(2).split('.');
  final entero = partes[0];
  final buffer = StringBuffer();
  for (var i = 0; i < entero.length; i++) {
    if (i > 0 && (entero.length - i) % 3 == 0) buffer.write('.');
    buffer.write(entero[i]);
  }
  final monto = '${buffer.toString()},${partes[1]}';
  return currency.isEmpty ? monto : '$currency $monto';
}

String fmtFecha(dynamic v) {
  final iso = texto(v);
  if (iso.length < 10) return iso;
  final d = iso.substring(0, 10).split('-');
  if (d.length != 3) return iso;
  return '${d[2]}/${d[1]}/${d[0]}';
}

void aviso(BuildContext context, String mensaje) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(mensaje)));
}

class TituloPagina extends StatelessWidget {
  const TituloPagina(this.titulo, {super.key, this.bajada});
  final String titulo;
  final String? bajada;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(titulo, style: TextStyle(fontFamily: 'serif', fontSize: 24, fontWeight: FontWeight.w600, color: c.ink)),
        if (bajada != null) ...[
          const SizedBox(height: 4),
          Text(bajada!, style: TextStyle(fontSize: 13, color: c.muted)),
        ],
      ],
    );
  }
}

class Tarjeta extends StatelessWidget {
  const Tarjeta({super.key, required this.child, this.padding = const EdgeInsets.all(14)});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border.all(color: c.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: child,
    );
  }
}

class LineaDato extends StatelessWidget {
  const LineaDato(this.etiqueta, this.valor, {super.key});
  final String etiqueta;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(etiqueta, style: TextStyle(color: c.muted, fontSize: 13))),
          Expanded(child: Text(valor.isEmpty ? '—' : valor, style: TextStyle(color: c.ink, fontSize: 14))),
        ],
      ),
    );
  }
}

class ChipEstado extends StatelessWidget {
  const ChipEstado(this.etiqueta, {super.key, this.activo = true});
  final String etiqueta;
  final bool activo;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: activo ? c.okBg : c.warnBg,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Text(etiqueta, style: TextStyle(fontSize: 12, color: activo ? c.ok : c.terra)),
    );
  }
}

class Campo extends StatelessWidget {
  const Campo({
    super.key,
    required this.controller,
    required this.label,
    this.teclado = TextInputType.text,
    this.clave = false,
    this.lineas = 1,
    this.ayuda,
  });

  final TextEditingController controller;
  final String label;
  final TextInputType teclado;
  final bool clave;
  final int lineas;
  final String? ayuda;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: teclado,
      obscureText: clave,
      maxLines: lineas,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(labelText: label, helperText: ayuda),
    );
  }
}

class Desplegable extends StatelessWidget {
  const Desplegable({super.key, required this.label, required this.valor, required this.opciones, required this.onChanged});
  final String label;
  final String valor;
  final List<String> opciones;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final actual = opciones.contains(valor) ? valor : (opciones.isEmpty ? null : opciones.first);
    return DropdownButtonFormField<String>(
      key: ValueKey('$label-$actual'),
      initialValue: actual,
      decoration: InputDecoration(labelText: label),
      items: [for (final o in opciones) DropdownMenuItem(value: o, child: Text(o))],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}

class BotonPrimario extends StatelessWidget {
  const BotonPrimario(this.etiqueta, this.onPressed, {super.key, this.ocupado = false, this.peligro = false});
  final String etiqueta;
  final VoidCallback? onPressed;
  final bool ocupado;
  final bool peligro;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return SizedBox(
      height: 44,
      child: FilledButton(
        onPressed: ocupado ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: peligro ? c.terra : c.leaf,
          foregroundColor: c.leafFg,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: ocupado
            ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: c.leafFg))
            : Text(etiqueta),
      ),
    );
  }
}

class KpiGrilla extends StatelessWidget {
  const KpiGrilla(this.datos, {super.key});
  final List<(String, String)> datos;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final columnas = constraints.maxWidth > 700 ? 4 : 2;
        final ancho = (constraints.maxWidth - (columnas - 1) * 10) / columnas;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final (etiqueta, valor) in datos)
              SizedBox(
                width: ancho,
                child: Tarjeta(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(etiqueta, style: TextStyle(fontSize: 12, color: c.muted)),
                      const SizedBox(height: 6),
                      Text(valor, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: c.ink)),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Carga asíncrona de una pantalla: spinner, error con reintento y contenido.
class VistaDatos<T> extends StatefulWidget {
  const VistaDatos({super.key, required this.cargar, required this.builder});
  final Future<T> Function() cargar;
  final Widget Function(BuildContext context, T datos) builder;

  @override
  State<VistaDatos<T>> createState() => _VistaDatosState<T>();
}

class _VistaDatosState<T> extends State<VistaDatos<T>> {
  late Future<T> _futuro;

  @override
  void initState() {
    super.initState();
    _futuro = widget.cargar();
  }

  void recargar() => setState(() => _futuro = widget.cargar());

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return FutureBuilder<T>(
      future: _futuro,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()));
        }
        if (snap.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${snap.error}', textAlign: TextAlign.center, style: TextStyle(color: c.terra)),
                  const SizedBox(height: 12),
                  TextButton(onPressed: recargar, child: const Text('Reintentar')),
                ],
              ),
            ),
          );
        }
        final datos = snap.data;
        if (datos == null) return const SizedBox.shrink();
        return widget.builder(context, datos);
      },
    );
  }
}

Future<bool> confirmarTorre(BuildContext context, String titulo, String mensaje) async {
  final c = torreColorsOf(context);
  final res = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(titulo),
      content: Text(mensaje),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: Text('Confirmar', style: TextStyle(color: c.terra))),
      ],
    ),
  );
  return res ?? false;
}

/// Diálogo de alta/edición con estado de guardado y error en línea.
/// Devuelve true si se guardó. [guardar] debe llamar a la API y lanzar TorreError si falla.
Future<bool> mostrarFormulario(
  BuildContext context, {
  required String titulo,
  required List<Widget> campos,
  required Future<void> Function() guardar,
}) async {
  final res = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => _FormularioDialogo(titulo: titulo, campos: campos, guardar: guardar),
  );
  return res ?? false;
}

class _FormularioDialogo extends StatefulWidget {
  const _FormularioDialogo({required this.titulo, required this.campos, required this.guardar});
  final String titulo;
  final List<Widget> campos;
  final Future<void> Function() guardar;

  @override
  State<_FormularioDialogo> createState() => _FormularioDialogoState();
}

class _FormularioDialogoState extends State<_FormularioDialogo> {
  bool _ocupado = false;
  String? _error;

  Future<void> _guardar() async {
    setState(() {
      _ocupado = true;
      _error = null;
    });
    try {
      await widget.guardar();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return AlertDialog(
      backgroundColor: c.surface,
      title: Text(widget.titulo),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final campo in widget.campos) Padding(padding: const EdgeInsets.only(bottom: 12), child: campo),
              if (_error != null) Text(_error!, style: TextStyle(color: c.terra, fontSize: 14)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: _ocupado ? null : () => Navigator.pop(context, false), child: const Text('Cancelar')),
        SizedBox(width: 120, child: BotonPrimario('Guardar', _guardar, ocupado: _ocupado)),
      ],
    );
  }
}
