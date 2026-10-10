import 'package:flutter/material.dart';

Future<String?> pedirMotivoAnulacion(
  BuildContext context, {
  required String titulo,
  required String descripcion,
  required String confirmar,
}) {
  return showDialog<String>(
    context: context,
    builder: (context) => _AnulacionDialog(
      titulo: titulo,
      descripcion: descripcion,
      confirmar: confirmar,
    ),
  );
}

class _AnulacionDialog extends StatefulWidget {
  const _AnulacionDialog({
    required this.titulo,
    required this.descripcion,
    required this.confirmar,
  });

  final String titulo;
  final String descripcion;
  final String confirmar;

  @override
  State<_AnulacionDialog> createState() => _AnulacionDialogState();
}

class _AnulacionDialogState extends State<_AnulacionDialog> {
  final _motivo = TextEditingController();

  @override
  void dispose() {
    _motivo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.titulo),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.descripcion),
          const SizedBox(height: 12),
          TextField(
            key: const Key('anulacion_motivo'),
            controller: _motivo,
            autofocus: true,
            maxLength: 300,
            decoration: const InputDecoration(
              labelText: 'Motivo',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      actions: [
        TextButton(
          key: const Key('anulacion_cancelar'),
          onPressed: () => Navigator.pop(context),
          child: const Text('Volver'),
        ),
        FilledButton(
          key: const Key('anulacion_confirmar'),
          onPressed: _motivo.text.trim().isEmpty
              ? null
              : () => Navigator.pop(context, _motivo.text.trim()),
          child: Text(widget.confirmar),
        ),
      ],
    );
  }
}
