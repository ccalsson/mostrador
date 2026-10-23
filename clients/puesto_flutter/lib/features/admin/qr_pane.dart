import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:printing/printing.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/widgets/public_links.dart';
import '../../services/tenant_service.dart';

class QrPane extends ConsumerWidget {
  const QrPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenant = ref.watch(tenantProvider).value;
    final theme = Theme.of(context);
    final portalUrl = publicSiteUrl;

    if (portalUrl.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            const Text('PUBLIC_SITE_URL no esta configurada.'),
            const SizedBox(height: 8),
            Text(
              'Configura la variable de entorno para habilitar el QR.',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      );
    }

    final nombrePuesto = tenant?.nombre ?? 'Mostrador';
    final qrData = '$portalUrl?app=mostrador';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'QR del puesto',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              nombrePuesto,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 24),
            Card(
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    QrImageView(
                      data: qrData,
                      version: QrVersions.auto,
                      size: 280,
                      backgroundColor: Colors.white,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Escanea para acceder al portal',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      portalUrl,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => _imprimirQr(context, nombrePuesto, qrData, portalUrl),
              icon: const Icon(Icons.print),
              label: const Text('Imprimir QR'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _imprimirQr(
    BuildContext context,
    String nombrePuesto,
    String qrData,
    String portalUrl,
  ) async {
    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async {
        final pdf = pw.Document();

        pdf.addPage(
          pw.Page(
            pageFormat: format,
            build: (pw.Context context) {
              return pw.Center(
                child: pw.Column(
                  mainAxisSize: pw.MainAxisSize.min,
                  children: [
                    pw.Text(
                      nombrePuesto,
                      style: pw.TextStyle(
                        fontSize: 32,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                    pw.SizedBox(height: 24),
                    pw.Text(
                      'Portal de clientes:',
                      style: const pw.TextStyle(fontSize: 14),
                    ),
                    pw.SizedBox(height: 8),
                    pw.Text(
                      portalUrl,
                      style: pw.TextStyle(
                        fontSize: 16,
                        color: PdfColors.blue800,
                      ),
                    ),
                    pw.SizedBox(height: 24),
                    pw.Text(
                      'Escanea el QR desde la app para acceder',
                      style: const pw.TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              );
            },
          ),
        );

        return pdf.save();
      },
    );
  }
}
