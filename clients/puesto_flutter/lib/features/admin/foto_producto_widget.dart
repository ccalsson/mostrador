import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/config/app_config.dart';

/// Tamaño máximo de foto permitido por el backend (5 MB).
const int kFotoMaxBytes = 5 * 1024 * 1024;

/// MIME types aceptados por el backend.
const Set<String> kFotoMimeTypes = {'image/jpeg', 'image/png', 'image/webp'};

/// Widget reutilizable para seleccionar, previsualizar y eliminar la foto
/// de un producto. Paridad con el upload de la web (`productos.tsx`).
///
/// [fotoUrl] es la URL relativa del backend (p.ej. `/uploads/productos/…`).
/// [onUpload] se invoca con los bytes, nombre y MIME al elegir una foto nueva.
/// [onDelete] se invoca al confirmar la eliminación.
class FotoProductoWidget extends StatefulWidget {
  const FotoProductoWidget({
    super.key,
    this.productoId,
    this.fotoUrl,
    this.enabled = true,
    required this.onUpload,
    required this.onDelete,
  });

  final String? productoId;
  final String? fotoUrl;
  final bool enabled;
  final Future<void> Function(Uint8List bytes, String nombre, String mime)
      onUpload;
  final Future<void> Function() onDelete;

  @override
  State<FotoProductoWidget> createState() => _FotoProductoWidgetState();
}

class _FotoProductoWidgetState extends State<FotoProductoWidget> {
  bool _subiendo = false;
  bool _borrando = false;
  String? _errorMensaje;

  /// Bytes de la foto nueva seleccionada (aún no subida).
  Uint8List? _pendingBytes;

  String get _fullUrl => '${AppConfig.apiBaseUrl}${widget.fotoUrl}';

  bool get _tieneFotoActual => widget.fotoUrl != null && widget.fotoUrl!.isNotEmpty;
  bool get _tieneFotoPending => _pendingBytes != null;

  Future<void> _seleccionarYSubir() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Tomar foto'),
              onTap: () => Navigator.pop(ctx, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.folder_open),
              title: const Text('Elegir archivo'),
              onTap: () => Navigator.pop(ctx, 'file'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;

    Uint8List? bytes;
    String? nombre;
    String? mime;

    if (action == 'camera') {
      final archivo = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (archivo == null) return;
      bytes = await archivo.readAsBytes();
      nombre = archivo.name.isEmpty ? 'foto.jpg' : archivo.name;
      mime = archivo.mimeType ?? _mimeDeNombre(nombre);
    } else {
      const tipos = XTypeGroup(
        label: 'Imágenes',
        extensions: ['jpg', 'jpeg', 'png', 'webp'],
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      );
      final archivo = await openFile(acceptedTypeGroups: [tipos]);
      if (archivo == null) return;
      bytes = await archivo.readAsBytes();
      nombre = archivo.name;
      mime = _mimeDeNombre(nombre);
    }

    // Validar MIME
    if (!kFotoMimeTypes.contains(mime)) {
      setState(() => _errorMensaje = 'Formato no válido. Usá JPG, PNG o WebP.');
      return;
    }

    // Validar tamaño
    if (bytes.length > kFotoMaxBytes) {
      setState(() =>
          _errorMensaje = 'La imagen supera los 5 MB permitidos.');
      return;
    }

    setState(() {
      _subiendo = true;
      _errorMensaje = null;
      _pendingBytes = bytes;
    });

    try {
      await widget.onUpload(bytes, nombre, mime);
      if (!mounted) return;
      setState(() {
        _pendingBytes = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMensaje = 'No se pudo subir la foto.');
    } finally {
      if (mounted) setState(() => _subiendo = false);
    }
  }

  Future<void> _confirmarBorrar() async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar foto'),
        content: const Text('¿Eliminar la foto de este producto?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    setState(() {
      _borrando = true;
      _errorMensaje = null;
    });
    try {
      await widget.onDelete();
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMensaje = 'No se pudo eliminar la foto.');
    } finally {
      if (mounted) setState(() => _borrando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final busy = _subiendo || _borrando || !widget.enabled;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Preview
        Container(
          height: 120,
          width: double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: cs.outlineVariant),
            color: cs.surfaceContainerHighest,
          ),
          clipBehavior: Clip.antiAlias,
          child: _tieneFotoPending
              ? Image.memory(_pendingBytes!, fit: BoxFit.cover)
              : _tieneFotoActual
                  ? Image.network(
                      _fullUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Center(
                        child: Icon(Icons.broken_image, color: cs.onSurfaceVariant),
                      ),
                      loadingBuilder: (ctx, child, progress) {
                        if (progress == null) return child;
                        return const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        );
                      },
                    )
                  : Center(
                      child: Icon(
                        Icons.photo_library_outlined,
                        size: 48,
                        color: cs.onSurfaceVariant,
                      ),
                    ),
        ),
        const SizedBox(height: 8),
        // Botones
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: busy ? null : _seleccionarYSubir,
              icon: _subiendo
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(_tieneFotoActual || _tieneFotoPending
                      ? Icons.photo_camera
                      : Icons.add_a_photo),
              label: Text(
                _subiendo
                    ? 'Subiendo…'
                    : _tieneFotoActual
                        ? 'Cambiar foto'
                        : 'Agregar foto',
              ),
            ),
            if (_tieneFotoActual || _tieneFotoPending)
              OutlinedButton.icon(
                onPressed: busy ? null : _confirmarBorrar,
                icon: _borrando
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.delete_outline),
                label: const Text('Eliminar foto'),
              ),
          ],
        ),
        if (_errorMensaje != null) ...[
          const SizedBox(height: 4),
          Text(
            _errorMensaje!,
            key: const Key('foto_error'),
            style: TextStyle(color: cs.error, fontSize: 12),
          ),
        ],
      ],
    );
  }

  static String _mimeDeNombre(String nombre) {
    final bajo = nombre.toLowerCase();
    if (bajo.endsWith('.png')) return 'image/png';
    if (bajo.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}
