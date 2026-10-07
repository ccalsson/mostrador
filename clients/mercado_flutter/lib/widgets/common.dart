import 'package:flutter/material.dart';

import '../market_api.dart';

class ErrorPanel extends StatelessWidget {
  const ErrorPanel({required this.error, required this.onRetry, super.key});

  final Object? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 44),
          const SizedBox(height: 12),
          Text(
            error is MercadoApiException
                ? (error as MercadoApiException).message
                : 'No se pudo cargar la información.',
          ),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Reintentar')),
        ],
      ),
    ),
  );
}

String money(double value) => '\$${value.toStringAsFixed(2)}';
String quantity(double value) => value == value.roundToDouble()
    ? value.toStringAsFixed(0)
    : value.toString();
String timeLabel(DateTime value) =>
    '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
