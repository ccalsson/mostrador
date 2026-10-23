import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/marca.dart';
import '../../services/marca_service.dart';

/// Panel de identidad del puesto. Permite editar los cinco campos de la
/// marca (nombre, bajada, membrete, pie, fondo) y guardarlos vía
/// `POST /api/v1/marca`.
class IdentidadPane extends ConsumerStatefulWidget {
  const IdentidadPane({super.key});

  @override
  ConsumerState<IdentidadPane> createState() => _IdentidadPaneState();
}

class _IdentidadPaneState extends ConsumerState<IdentidadPane> {
  final _formKey = GlobalKey<FormState>();
  final _nombreCtrl = TextEditingController();
  final _bajadaCtrl = TextEditingController();
  final _membreteCtrl = TextEditingController();
  final _pieCtrl = TextEditingController();
  final _fondoCtrl = TextEditingController();

  bool _guardando = false;
  bool _dirty = false;

  @override
  void dispose() {
    _nombreCtrl.dispose();
    _bajadaCtrl.dispose();
    _membreteCtrl.dispose();
    _pieCtrl.dispose();
    _fondoCtrl.dispose();
    super.dispose();
  }

  void _cargarDesde(Marca marca) {
    if (_dirty) return;
    _nombreCtrl.text = marca.nombre;
    _bajadaCtrl.text = marca.bajada;
    _membreteCtrl.text = marca.membrete;
    _pieCtrl.text = marca.pie;
    _fondoCtrl.text = marca.fondo;
  }

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _guardando = true);
    try {
      final marca = Marca(
        nombre: _nombreCtrl.text.trim(),
        bajada: _bajadaCtrl.text.trim(),
        membrete: _membreteCtrl.text.trim(),
        pie: _pieCtrl.text.trim(),
        fondo: _fondoCtrl.text.trim(),
      );
      await ref.read(marcaServiceProvider).guardar(marca);
      if (!mounted) return;
      setState(() {
        _guardando = false;
        _dirty = false;
      });
      ref.invalidate(marcaProvider);
      mensajero.showSnackBar(
        const SnackBar(content: Text('Identidad guardada.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _guardando = false);
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final marcaAsync = ref.watch(marcaProvider);
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Identidad',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () {
                  _dirty = false;
                  ref.invalidate(marcaProvider);
                },
                tooltip: 'Actualizar',
              ),
            ],
          ),
        ),
        Expanded(
          child: marcaAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Error al cargar la identidad.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(marcaProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (marca) {
              _cargarDesde(marca);
              return Form(
                key: _formKey,
                child: ListView(
                  key: const Key('identidad_form'),
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  children: [
                    _campo(
                      controller: _nombreCtrl,
                      label: 'Nombre',
                      keyName: 'identidad_nombre',
                      maxLength: 120,
                    ),
                    const SizedBox(height: 12),
                    _campo(
                      controller: _bajadaCtrl,
                      label: 'Bajada',
                      keyName: 'identidad_bajada',
                      maxLength: 240,
                    ),
                    const SizedBox(height: 12),
                    _campo(
                      controller: _membreteCtrl,
                      label: 'Membrete',
                      keyName: 'identidad_membrete',
                      maxLength: 240,
                    ),
                    const SizedBox(height: 12),
                    _campo(
                      controller: _pieCtrl,
                      label: 'Pie',
                      keyName: 'identidad_pie',
                      maxLength: 240,
                    ),
                    const SizedBox(height: 12),
                    _campo(
                      controller: _fondoCtrl,
                      label: 'Fondo',
                      keyName: 'identidad_fondo',
                      maxLength: 240,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      key: const Key('identidad_guardar'),
                      onPressed: _guardando ? null : _guardar,
                      child: Text(
                        _guardando ? 'Guardando…' : 'Guardar',
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Estos datos se muestran en el sidebar y en los '
                      'comprobantes del puesto.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _campo({
    required TextEditingController controller,
    required String label,
    required String keyName,
    required int maxLength,
  }) {
    return TextFormField(
      key: Key(keyName),
      controller: controller,
      maxLength: maxLength,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      onChanged: (_) => setState(() => _dirty = true),
    );
  }
}
