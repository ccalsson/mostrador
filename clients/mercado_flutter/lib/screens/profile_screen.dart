import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../market_api.dart';
import '../models.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    required this.api,
    required this.actor,
    required this.onRefresh,
    super.key,
  });

  final MercadoApi api;
  final Map<String, dynamic> actor;
  final Future<void> Function() onRefresh;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _documentNumber = TextEditingController();
  final _picker = ImagePicker();
  Uint8List? _document;
  Uint8List? _selfie;
  String _country = 'AR';
  bool _busy = false;
  List<DocumentoLegal> _documentos = const [];
  bool _legalCargando = false;
  bool _legalNoPublicado = false;
  String? _legalError;

  bool get _isBuyer => widget.actor['perfil'] == 'comprador';
  bool get _identityDone =>
      widget.actor['estadoIdentidad'] == 'documentacion_cargada';

  @override
  void initState() {
    super.initState();
    _country = widget.actor['pais'] as String? ?? 'AR';
    _cargarDocumentos();
  }

  @override
  void dispose() {
    _documentNumber.dispose();
    super.dispose();
  }

  Future<void> _selectDocument() async {
    final files = await FilePicker.pickFiles(type: FileType.image);
    final bytes = files.isEmpty ? null : await files.first.xFile.readAsBytes();
    if (bytes == null || bytes.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No se pudo leer el archivo seleccionado.'),
          ),
        );
      }
      return;
    }
    setState(() => _document = bytes);
  }

  Future<void> _takeSelfie() async {
    final image = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 75,
      maxWidth: 1600,
    );
    if (image == null) return;
    final file = File(image.path);
    final bytes = await file.readAsBytes();
    await file.delete();
    if (mounted) setState(() => _selfie = bytes);
  }

  Future<void> _uploadIdentity() async {
    if (_document == null ||
        _selfie == null ||
        _documentNumber.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Elegí el documento, tomá la selfie e ingresá el número.',
          ),
        ),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.uploadIdentity(
        country: _country,
        documentType: _country == 'AR' ? 'DNI' : 'CI_PY',
        documentNumber: _documentNumber.text.trim(),
        document: _document!,
        selfie: _selfie!,
      );
      _document = null;
      _selfie = null;
      await widget.onRefresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Documentación recibida.')),
        );
      }
    } on MercadoApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cargarDocumentos() async {
    setState(() {
      _legalCargando = true;
      _legalError = null;
    });
    try {
      final documentos = await widget.api.listarDocumentosLegales();
      if (!mounted) return;
      setState(() {
        _documentos = documentos;
        _legalCargando = false;
        _legalNoPublicado = false;
      });
    } on MercadoApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _legalCargando = false;
        if (error.statusCode == 404) {
          _documentos = const [];
          _legalNoPublicado = true;
        } else {
          _legalError = error.message;
        }
      });
    }
  }

  Future<void> _abrirDocumento(DocumentoLegal documento) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _HojaDocumento(
        api: widget.api,
        userId: widget.actor['id'] as String? ?? '',
        documento: documento,
        onAceptado: _cargarDocumentos,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      CircleAvatar(
        radius: 36,
        child: Icon(
          _isBuyer ? Icons.person_outline : Icons.delivery_dining,
          size: 38,
        ),
      ),
      const SizedBox(height: 12),
      Text(
        widget.actor['nombre'] as String? ?? '',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      Text(widget.actor['email'] as String? ?? '', textAlign: TextAlign.center),
      if (_isBuyer) ...[
        const SizedBox(height: 24),
        Text(
          'Verificación de identidad',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 6),
        Text(
          _identityDone
              ? 'Documentación cargada. Las imágenes no se conservan en el teléfono.'
              : 'Subí el frente de tu documento y una selfie para habilitar compras.',
        ),
        if (!_identityDone) ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _country,
            decoration: const InputDecoration(labelText: 'País del documento'),
            items: const [
              DropdownMenuItem(value: 'AR', child: Text('Argentina')),
              DropdownMenuItem(value: 'PY', child: Text('Paraguay')),
            ],
            onChanged: _busy
                ? null
                : (value) => setState(() => _country = value ?? 'AR'),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _documentNumber,
            decoration: InputDecoration(
              labelText: _country == 'AR' ? 'Número de DNI' : 'Número de CI',
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busy ? null : _selectDocument,
            icon: Icon(
              _document == null
                  ? Icons.upload_file
                  : Icons.check_circle_outline,
            ),
            label: Text(
              _document == null
                  ? 'Elegir imagen del documento'
                  : 'Documento seleccionado',
            ),
          ),
          OutlinedButton.icon(
            onPressed: _busy ? null : _takeSelfie,
            icon: Icon(
              _selfie == null
                  ? Icons.camera_alt_outlined
                  : Icons.check_circle_outline,
            ),
            label: Text(_selfie == null ? 'Tomar selfie' : 'Selfie capturada'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy ? null : _uploadIdentity,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Enviar documentación'),
          ),
        ],
      ],
      const SizedBox(height: 24),
      Row(
        children: [
          Expanded(
            child: Text(
              'Documentos legales',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          IconButton(
            key: const Key('legal_refrescar'),
            tooltip: 'Actualizar documentos',
            onPressed: _legalCargando ? null : _cargarDocumentos,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      if (_legalCargando)
        const LinearProgressIndicator(key: Key('legal_cargando')),
      if (_legalNoPublicado)
        const Text(
          'Los documentos legales estarán disponibles cuando el puesto los publique.',
        )
      else if (_legalError != null)
        Text(_legalError!)
      else ...[
        for (final documento in _documentos)
          ListTile(
            key: Key('legal_doc_${documento.documentoId}'),
            contentPadding: EdgeInsets.zero,
            title: Text(documento.titulo),
            subtitle: Text('Versión ${documento.versionVigente}'),
            trailing: documento.pendiente
                ? const Text(
                    'Pendiente',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  )
                : const Icon(Icons.check_circle_outline),
            onTap: () => _abrirDocumento(documento),
          ),
      ],
    ],
  );
}

/// Hoja de lectura de un documento legal. Muestra la versión vigente que
/// entrega el backend y, si está pendiente, permite aceptar ESA versión con
/// su hash. La aceptación es sólo-online: el resultado real es el que
/// confirma el backend (un 409 obliga a reconsultar la versión nueva).
class _HojaDocumento extends StatefulWidget {
  const _HojaDocumento({
    required this.api,
    required this.userId,
    required this.documento,
    required this.onAceptado,
  });

  final MercadoApi api;
  final String userId;
  final DocumentoLegal documento;
  final Future<void> Function() onAceptado;

  @override
  State<_HojaDocumento> createState() => _HojaDocumentoState();
}

class _HojaDocumentoState extends State<_HojaDocumento> {
  DocumentoLegalContenido? _contenido;
  String? _error;
  bool _cargando = true;
  bool _aceptando = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final documento = await widget.api.obtenerDocumentoLegal(
        widget.documento.documentoId,
      );
      if (!mounted) return;
      setState(() {
        _contenido = documento;
        _cargando = false;
      });
    } on MercadoApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _cargando = false;
      });
    }
  }

  Future<void> _aceptar() async {
    final contenido = _contenido;
    if (contenido == null || _aceptando) return;
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _aceptando = true);
    try {
      await widget.api.aceptarDocumentoLegal(
        userId: widget.userId,
        documentoId: contenido.documentoId,
        version: contenido.version,
        hash: contenido.hash,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      mensajero.showSnackBar(
        SnackBar(content: Text('Aceptaste la versión ${contenido.version}.')),
      );
      await widget.onAceptado();
    } on MercadoApiException catch (error) {
      if (!mounted) return;
      setState(() => _aceptando = false);
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
      if (error.statusCode == 409) await _cargar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final contenido = _contenido;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.85,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.documento.titulo,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: _cargando
                  ? const Center(
                      key: Key('legal_hoja_cargando'),
                      child: CircularProgressIndicator(),
                    )
                  : _error != null
                      ? ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            Text(_error!),
                            const SizedBox(height: 12),
                            OutlinedButton(
                              onPressed: _cargar,
                              child: const Text('Reintentar'),
                            ),
                          ],
                        )
                      : ListView(
                          key: const Key('legal_hoja'),
                          padding: const EdgeInsets.all(16),
                          children: [
                            Text(
                              'Versión ${contenido!.version}'
                              '${contenido.fechaVigencia == null ? '' : ' · vigente desde ${contenido.fechaVigencia}'}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 12),
                            SelectableText(
                              contenido.formato == 'pdf_url'
                                  ? 'El documento está publicado en: ${contenido.valor}'
                                  : contenido.valor,
                            ),
                          ],
                        ),
            ),
            if (widget.documento.pendiente &&
                contenido != null &&
                _error == null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton(
                  key: const Key('legal_aceptar'),
                  onPressed: _aceptando ? null : _aceptar,
                  child: _aceptando
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text('Aceptar versión ${contenido.version}'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
