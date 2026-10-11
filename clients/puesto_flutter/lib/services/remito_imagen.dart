import 'package:file_selector/file_selector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../models/remito_ocr.dart';

/// Origen de la foto del remito. Cámara vía `image_picker`; archivo vía
/// `file_selector`. Ambos plugins eligen el diálogo nativo: no hace falta
/// `Platform.is*` en la app.
class RemitoImagenOrigen {
  RemitoImagenOrigen({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  Future<RemitoImagen?> tomarFoto() async {
    final archivo = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 1600,
    );
    return _desdeXFile(archivo);
  }

  Future<RemitoImagen?> elegirArchivo() async {
    const tipos = XTypeGroup(
      label: 'Imágenes',
      extensions: ['jpg', 'jpeg', 'png', 'webp'],
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    );
    final archivo = await openFile(acceptedTypeGroups: [tipos]);
    if (archivo == null) return null;
    final bytes = await archivo.readAsBytes();
    return RemitoImagen(
      bytes: bytes,
      mimeType: mimeDeNombre(archivo.name),
      nombre: archivo.name,
    );
  }

  Future<RemitoImagen?> _desdeXFile(XFile? archivo) async {
    if (archivo == null) return null;
    final bytes = await archivo.readAsBytes();
    final nombre = archivo.name.isEmpty ? 'remito.jpg' : archivo.name;
    return RemitoImagen(
      bytes: bytes,
      mimeType: archivo.mimeType ?? mimeDeNombre(nombre),
      nombre: nombre,
    );
  }
}

String mimeDeNombre(String nombre) {
  final bajo = nombre.toLowerCase();
  if (bajo.endsWith('.png')) return 'image/png';
  if (bajo.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

final remitoImagenOrigenProvider = Provider<RemitoImagenOrigen>(
  (ref) => RemitoImagenOrigen(),
);
