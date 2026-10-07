import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../market_api.dart';

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

  bool get _isBuyer => widget.actor['perfil'] == 'comprador';
  bool get _identityDone =>
      widget.actor['estadoIdentidad'] == 'documentacion_cargada';

  @override
  void initState() {
    super.initState();
    _country = widget.actor['pais'] as String? ?? 'AR';
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
    ],
  );
}
