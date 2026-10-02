import 'package:flutter/material.dart';

/// Error del área de Caja (lista, detalle o estado del turno): mensaje real
/// del backend y reintento explícito, sin reintentos automáticos.
class ErrorCaja extends StatelessWidget {
  const ErrorCaja({
    super.key,
    required this.mensaje,
    required this.onReintentar,
    this.claveReintentar = const Key('caja_reintentar'),
  });

  final String mensaje;
  final VoidCallback onReintentar;
  final Key claveReintentar;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_outlined,
              size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(mensaje, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.tonal(
            key: claveReintentar,
            onPressed: onReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}
