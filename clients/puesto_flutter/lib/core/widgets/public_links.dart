import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const publicSiteUrl = String.fromEnvironment('PUBLIC_SITE_URL');

typedef ExternalUrlLauncher = Future<bool> Function(
  Uri uri, {
  required LaunchMode mode,
});

enum PublicPage {
  privacy('Privacidad', 'privacidad.html'),
  terms('Condiciones', 'condiciones.html'),
  support('Soporte', 'soporte.html'),
  deleteAccount('Solicitar eliminación de cuenta', 'eliminar-cuenta.html');

  const PublicPage(this.label, this.fileName);

  final String label;
  final String fileName;
}

Uri? publicPageUri(
  PublicPage page, {
  String baseUrl = publicSiteUrl,
  bool allowLocalHttp = kDebugMode,
}) {
  try {
    final base = Uri.tryParse(baseUrl.trim());
    if (base == null ||
        !base.hasAuthority ||
        base.host.isEmpty ||
        base.userInfo.isNotEmpty ||
        RegExp(r'[\s\\]').hasMatch(baseUrl) ||
        !(base.scheme == 'https' ||
            (allowLocalHttp &&
                base.scheme == 'http' &&
                const ['localhost', '127.0.0.1', '10.0.2.2'].contains(base.host)))) {
      return null;
    }
    return Uri(
      scheme: base.scheme,
      host: base.host,
      port: base.hasPort ? base.port : null,
      pathSegments: [
        ...base.pathSegments.where((segment) => segment.isNotEmpty),
        page.fileName,
      ],
      queryParameters: const {'app': 'mostrador'},
    );
  } on FormatException {
    return null;
  }
}

const _launchError =
    'No se pudo abrir el enlace en el navegador. Intentá nuevamente.';

void _showMessage(BuildContext context, String message) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

Future<void> openPublicPage(
  BuildContext context,
  PublicPage page, {
  String baseUrl = publicSiteUrl,
  ExternalUrlLauncher launcher = launchUrl,
}) async {
  final uri = publicPageUri(page, baseUrl: baseUrl);
  if (uri == null) {
    _showMessage(
      context,
      'Enlace no disponible: PUBLIC_SITE_URL no está configurada con una URL HTTPS válida.',
    );
    return;
  }
  bool opened = false;
  try {
    opened = await launcher(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    opened = false;
  }
  if (opened || !context.mounted) return;
  _showMessage(context, _launchError);
}

class PublicLinks extends StatelessWidget {
  const PublicLinks({
    super.key,
    this.baseUrl = publicSiteUrl,
    this.launcher = launchUrl,
  });

  final String baseUrl;
  final ExternalUrlLauncher launcher;

  @override
  Widget build(BuildContext context) => Wrap(
    alignment: WrapAlignment.center,
    spacing: 4,
    children: [
      for (final page in PublicPage.values)
        TextButton(
          onPressed: () => openPublicPage(
            context,
            page,
            baseUrl: baseUrl,
            launcher: launcher,
          ),
          child: Text(page.label, textAlign: TextAlign.center),
        ),
    ],
  );
}
