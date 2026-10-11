import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/proveedor.dart';
import '../../models/remito_ocr.dart';
import '../../services/proveedores_service.dart';
import '../../services/remito_imagen.dart';
import 'remito_alta_controller.dart';
import 'remito_detalle_pane.dart';

Future<void> mostrarAltaRemito(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (_) => const _RemitoAltaDialog(),
  );
}

class _LineaCampos {
  _LineaCampos({String descripcion = '', String cantidad = '1'})
      : descripcion = TextEditingController(text: descripcion),
        cantidad = TextEditingController(text: cantidad);

  final TextEditingController descripcion;
  final TextEditingController cantidad;

  void dispose() {
    descripcion.dispose();
    cantidad.dispose();
  }
}

class _RemitoAltaDialog extends ConsumerStatefulWidget {
  const _RemitoAltaDialog();

  @override
  ConsumerState<_RemitoAltaDialog> createState() => _RemitoAltaDialogState();
}

class _RemitoAltaDialogState extends ConsumerState<_RemitoAltaDialog> {
  final List<_LineaCampos> _lineas = [_LineaCampos()];
  String? _proveedorId;
  String _fuente = 'manual';
  String? _archivoNombre;
  String? _validacion;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) ref.read(remitoAltaProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    for (final linea in _lineas) {
      linea.dispose();
    }
    super.dispose();
  }

  List<Proveedor> get _activos {
    final lista = ref.read(proveedoresProvider).value ?? const <Proveedor>[];
    return [for (final p in lista) if (p.activo) p];
  }

  List<RemitoLineaAlta> _lineasValidas() {
    final out = <RemitoLineaAlta>[];
    for (final linea in _lineas) {
      final descripcion = linea.descripcion.text.trim();
      final cantidad = double.tryParse(linea.cantidad.text.replaceAll(',', '.'));
      if (descripcion.isEmpty || cantidad == null || cantidad <= 0) continue;
      out.add(RemitoLineaAlta(descripcion: descripcion, cantidad: cantidad));
    }
    return out;
  }

  void _aplicarLectura(RemitoOcrLectura lectura) {
    final match = ref
        .read(remitoAltaProvider.notifier)
        .proveedorDeLectura(lectura, _activos);
    setState(() {
      _fuente = 'foto';
      if (match != null) _proveedorId = match;
      if (lectura.lineas.isEmpty) return;
      for (final linea in _lineas) {
        linea.dispose();
      }
      _lineas
        ..clear()
        ..addAll([
          for (final linea in lectura.lineas)
            _LineaCampos(
              descripcion: linea.descripcion,
              cantidad: linea.cantidad == linea.cantidad.roundToDouble()
                  ? '${linea.cantidad.round()}'
                  : '${linea.cantidad}',
            ),
        ]);
    });
  }

  Future<void> _tomar(Future<RemitoImagen?> Function() origen) async {
    setState(() => _validacion = null);
    try {
      final imagen = await origen();
      if (!mounted || imagen == null) return;
      _archivoNombre = imagen.nombre;
      final lectura =
          await ref.read(remitoAltaProvider.notifier).leerFoto(imagen);
      if (!mounted || lectura == null) return;
      _aplicarLectura(lectura);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _validacion = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _validacion =
            'No pude abrir la imagen. Probá con un archivo JPEG o PNG.',
      );
    }
  }

  Future<void> _cargar() async {
    final proveedorId = _proveedorId ?? '';
    final lineas = _lineasValidas();
    if (proveedorId.isEmpty) {
      return setState(() => _validacion = 'Elegí un proveedor.');
    }
    if (lineas.isEmpty) {
      return setState(
        () => _validacion = 'Completá al menos una línea con cantidad.',
      );
    }
    setState(() => _validacion = null);
    final id = await ref.read(remitoAltaProvider.notifier).cargar(
          proveedorId: proveedorId,
          fuente: _fuente,
          archivoNombre: _archivoNombre,
          lineas: lineas,
        );
    if (!mounted || id == null) return;
    Navigator.of(context).pop();
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => RemitoDetallePane(remitoId: id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final alta = ref.watch(remitoAltaProvider);
    final proveedores = ref.watch(proveedoresProvider);
    final activos = [
      for (final p in proveedores.value ?? const <Proveedor>[])
        if (p.activo) p,
    ];
    final error = _validacion ?? alta.errorMensaje;

    return AlertDialog(
      title: const Text('Ingreso de mercadería'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Sacale una foto al remito o cargá las líneas a mano. El servidor lee el papel; vos confirmás el match.',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.tonalIcon(
                    key: const Key('admin_remito_camara'),
                    onPressed: alta.ocupado
                        ? null
                        : () => _tomar(
                              () => ref.read(remitoImagenOrigenProvider).tomarFoto(),
                            ),
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(
                      alta.fase == RemitoAltaFase.leyendo
                          ? 'Leyendo…'
                          : 'Cámara',
                    ),
                  ),
                  OutlinedButton.icon(
                    key: const Key('admin_remito_archivo'),
                    onPressed: alta.ocupado
                        ? null
                        : () => _tomar(
                              () => ref
                                  .read(remitoImagenOrigenProvider)
                                  .elegirArchivo(),
                            ),
                    icon: const Icon(Icons.image_outlined),
                    label: const Text('Archivo'),
                  ),
                ],
              ),
              if (alta.aviso != null) ...[
                const SizedBox(height: 8),
                Text(alta.aviso!, key: const Key('admin_remito_aviso')),
              ],
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const Key('admin_remito_proveedor'),
                initialValue: activos.any((p) => p.id == _proveedorId)
                    ? _proveedorId
                    : null,
                decoration: const InputDecoration(labelText: 'Proveedor'),
                items: [
                  for (final proveedor in activos)
                    DropdownMenuItem(
                      value: proveedor.id,
                      child: Text(proveedor.nombre),
                    ),
                ],
                onChanged: alta.ocupado
                    ? null
                    : (value) => setState(() => _proveedorId = value),
              ),
              if (activos.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'El dueño carga el directorio en Proveedores.',
                  ),
                ),
              const SizedBox(height: 12),
              for (var i = 0; i < _lineas.length; i++) ...[
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        key: Key('admin_remito_linea_$i'),
                        controller: _lineas[i].descripcion,
                        decoration: const InputDecoration(
                          labelText: 'Producto del papel',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 88,
                      child: TextField(
                        key: Key('admin_remito_cantidad_$i'),
                        controller: _lineas[i].cantidad,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(labelText: 'Cant.'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
              TextButton(
                key: const Key('admin_remito_otra_linea'),
                onPressed: alta.ocupado
                    ? null
                    : () => setState(() => _lineas.add(_LineaCampos())),
                child: const Text('Otra línea'),
              ),
              if (error != null)
                Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: alta.ocupado ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('admin_remito_cargar'),
          onPressed: alta.ocupado ? null : _cargar,
          child: Text(
            alta.fase == RemitoAltaFase.enviando ? 'Cargando…' : 'Cargar remito',
          ),
        ),
      ],
    );
  }
}
