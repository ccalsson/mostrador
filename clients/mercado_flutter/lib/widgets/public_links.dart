import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../market_api.dart';

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

Uri? _webBase(String value, {required bool allowLocalHttp}) {
  final base = Uri.tryParse(value.trim());
  if (base == null ||
      !base.hasAuthority ||
      base.host.isEmpty ||
      base.userInfo.isNotEmpty ||
      RegExp(r'[\s\\]').hasMatch(value) ||
      !(base.scheme == 'https' ||
          (allowLocalHttp &&
              base.scheme == 'http' &&
              const ['localhost', '127.0.0.1', '10.0.2.2'].contains(base.host)))) {
    return null;
  }
  return base;
}

Uri? publicPageUri(
  PublicPage page, {
  String baseUrl = publicSiteUrl,
  bool allowLocalHttp = kDebugMode,
}) {
  try {
    final base = _webBase(baseUrl, allowLocalHttp: allowLocalHttp);
    if (base == null) return null;
    return Uri(
      scheme: base.scheme,
      host: base.host,
      port: base.hasPort ? base.port : null,
      pathSegments: [
        ...base.pathSegments.where((segment) => segment.isNotEmpty),
        page.fileName,
      ],
      queryParameters: const {'app': 'mercado'},
    );
  } on FormatException {
    return null;
  }
}

Uri? marketRegistrationUri({
  required String profile,
  String baseUrl = apiBaseUrl,
  bool allowLocalHttp = kDebugMode,
}) {
  if (profile != 'comprador' && profile != 'cargador') return null;
  final base = _webBase(baseUrl, allowLocalHttp: allowLocalHttp);
  if (base == null) return null;
  return Uri(
    scheme: base.scheme,
    host: base.host,
    port: base.hasPort ? base.port : null,
    path: '/registro-mercado.html',
    queryParameters: {'perfil': profile},
  );
}

const _launchError =
    'No se pudo abrir el enlace en el navegador. Intentá nuevamente.';

void _showMessage(BuildContext context, String message) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

Future<void> openExternalPage(
  BuildContext context,
  Uri? uri, {
  required String configuration,
  ExternalUrlLauncher launcher = launchUrl,
}) async {
  if (uri == null) {
    _showMessage(
      context,
      'Enlace no disponible: $configuration no está configurada con una URL HTTPS válida.',
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
          onPressed: () => openExternalPage(
            context,
            publicPageUri(page, baseUrl: baseUrl),
            configuration: 'PUBLIC_SITE_URL',
            launcher: launcher,
          ),
          child: Text(page.label, textAlign: TextAlign.center),
        ),
    ],
  );
}
