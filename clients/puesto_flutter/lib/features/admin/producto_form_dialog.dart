import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/producto.dart';
import '../../services/productos_service.dart';
import 'foto_producto_widget.dart';
import 'historial_producto_widget.dart';
import 'producto_form_controller.dart';

/// Diálogo de alta (`existente == null`) o edición de producto, con baja
/// lógica en el caso de edición.
///
/// En modo edición muestra dos pestañas: "Datos" (formulario) e "Historial"
/// (ventas de los últimos 30 días, con lazy loading).
Future<void> mostrarFormProducto(BuildContext context, {Producto? existente}) {
  return showDialog<void>(
    context: context,
    builder: (_) => _ProductoFormDialog(existente: existente),
  );
}

class _ProductoFormDialog extends ConsumerStatefulWidget {
  const _ProductoFormDialog({this.existente});

  final Producto? existente;

  @override
  ConsumerState<_ProductoFormDialog> createState() =>
      _ProductoFormDialogState();
}

class _ProductoFormDialogState extends ConsumerState<_ProductoFormDialog>
    with SingleTickerProviderStateMixin {
  late final TextEditingController _nombre;
  late final TextEditingController _unidadLabel;
  late final TextEditingController _precio;
  late final TextEditingController _costo;
  late final TextEditingController _minimo;
  late final TextEditingController _alias;
  late final TextEditingController _inicial;
  late String _unidad;
  late bool _activo;
  late bool _publicadoOnline;
  String? _validacion;

  /// Controlador de pestañas para el modo edición (Datos / Historial).
  late final TabController? _tabController;

  /// `true` cuando la pestaña "Historial" ya fue activada al menos una vez,
  /// para implementar lazy loading: no se consulta el endpoint hasta que el
  /// usuario abre la pestaña.
  bool _historialCargado = false;

  @override
  void initState() {
    super.initState();
    final p = widget.existente;
    _nombre = TextEditingController(text: p?.nombre ?? '');
    _unidadLabel = TextEditingController(text: p?.unidadLabel ?? 'kg');
    _precio = TextEditingController(
      text: p == null ? '' : cantidadNum(p.precio),
    );
    _costo = TextEditingController(
      text: p?.costo == null ? '' : cantidadNum(p!.costo!),
    );
    _minimo = TextEditingController(
      text: p == null ? '' : cantidadNum(p.stockMinimo),
    );
    _alias = TextEditingController(text: p?.alias.join(', ') ?? '');
    _inicial = TextEditingController();
    _unidad = p?.unidad ?? 'kg';
    _activo = p?.activo ?? true;
    _publicadoOnline = p?.publicadoOnline ?? false;

    // Solo crear TabController si es un producto existente (modo edición).
    if (p != null) {
      final tc = TabController(length: 2, vsync: this);
      _tabController = tc;
      tc.addListener(() {
        // Cuando el usuario cambia a la pestaña de historial (índice 1),
        // marcar como cargado para que se renderice el widget.
        if (tc.index == 1) {
          if (!_historialCargado && mounted) {
            setState(() => _historialCargado = true);
          }
        }
      });
    } else {
      _tabController = null;
    }

    Future.microtask(() {
      if (mounted) ref.read(productoFormProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    _nombre.dispose();
    _unidadLabel.dispose();
    _precio.dispose();
    _costo.dispose();
    _minimo.dispose();
    _alias.dispose();
    _inicial.dispose();
    _tabController?.dispose();
    super.dispose();
  }

  /// Vuelve a la pestaña "Datos" si el usuario está en otra.
  void _volverAPestanaDatos() {
    final tc = _tabController;
    if (tc != null && tc.index != 0) {
      tc.animateTo(0);
    }
  }

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    final unidadLabel = _unidadLabel.text.trim();
    final precio = parseDecimal(_precio.text);
    final costoTexto = _costo.text.trim();
    final costo = costoTexto.isEmpty ? null : parseDecimal(costoTexto);
    final minimo = parseDecimal(_minimo.text);
    if (nombre.isEmpty) {
      _volverAPestanaDatos();
      return setState(() => _validacion = 'Ingresá el nombre.');
    }
    if (unidadLabel.isEmpty || unidadLabel.length > 20) {
      _volverAPestanaDatos();
      return setState(
        () => _validacion = 'Etiqueta de unidad requerida (máx. 20).',
      );
    }
    if (precio == null || precio <= 0) {
      _volverAPestanaDatos();
      return setState(() => _validacion = 'Precio inválido.');
    }
    if (costo != null && costo < 0) {
      _volverAPestanaDatos();
      return setState(() => _validacion = 'El costo no puede ser negativo.');
    }
    if (minimo == null || minimo < 0) {
      _volverAPestanaDatos();
      return setState(() => _validacion = 'Stock mínimo inválido.');
    }
    double? inicial;
    final textoInicial = _inicial.text.trim();
    if (widget.existente == null && textoInicial.isNotEmpty) {
      inicial = parseDecimal(textoInicial);
      if (inicial == null) {
        return setState(() => _validacion = 'Stock inicial inválido.');
      }
    }
    setState(() => _validacion = null);
    final ok = await ref
        .read(productoFormProvider.notifier)
        .guardar(
          ProductoInput(
            id: widget.existente?.id,
            nombre: nombre,
            unidad: _unidad,
            unidadLabel: unidadLabel,
            precio: precio,
            stockMinimo: minimo,
            alias: _alias.text
                .split(',')
                .map((a) => a.trim())
                .where((a) => a.isNotEmpty)
                .toList(),
            activo: _activo,
            publicadoOnline: _publicadoOnline,
            stockInicial: inicial,
            costo: costo,
          ),
        );
    if (ok && mounted) Navigator.of(context).pop();
  }

  Future<void> _bajar() async {
    final p = widget.existente!;
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Dar de baja'),
        content: Text(
          '¿Dar de baja "${p.nombre}"? Podés reactivarlo después editándolo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('admin_confirmar_baja'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Dar de baja'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;
    final ok = await ref.read(productoFormProvider.notifier).bajar(p.id);
    if (ok && mounted) Navigator.of(context).pop();
  }

  /// Formulario de datos del producto (pestaña "Datos").
  Widget _buildFormulario(BuildContext context, Producto? p, bool enviando) {
    return SingleChildScrollView(
      key: const Key('historial_tab_datos'),
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const Key('admin_prod_nombre'),
            controller: _nombre,
            decoration: const InputDecoration(labelText: 'Nombre'),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: const Key('admin_prod_unidad'),
                  initialValue: _unidad,
                  decoration: const InputDecoration(labelText: 'Unidad'),
                  items: const [
                    DropdownMenuItem(value: 'kg', child: Text('kg')),
                    DropdownMenuItem(value: 'bulto', child: Text('bulto')),
                  ],
                  onChanged: (valor) =>
                      setState(() => _unidad = valor ?? 'kg'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  key: const Key('admin_prod_unidad_label'),
                  controller: _unidadLabel,
                  maxLength: 20,
                  decoration: const InputDecoration(
                    labelText: 'Etiqueta (ej. kg, cajón x10)',
                    counterText: '',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('admin_prod_precio'),
                  controller: _precio,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: 'Precio'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  key: const Key('admin_prod_costo'),
                  controller: _costo,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Costo (opcional)',
                    helperText: 'Para calcular margen',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('admin_prod_minimo'),
            controller: _minimo,
            keyboardType: const TextInputType.numberWithOptions(
              decimal: true,
            ),
            decoration: const InputDecoration(
              labelText: 'Stock mínimo',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('admin_prod_alias'),
            controller: _alias,
            decoration: const InputDecoration(
              labelText: 'Alias (separados por coma)',
              hintText: 'banana, banana ecluer',
            ),
          ),
          if (p == null) ...[
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_prod_inicial'),
              controller: _inicial,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Stock inicial (opcional)',
              ),
            ),
          ],
          if (p != null)
            SwitchListTile(
              key: const Key('admin_prod_activo'),
              contentPadding: EdgeInsets.zero,
              title: const Text('Activo'),
              value: _activo,
              onChanged: (valor) => setState(() => _activo = valor),
            ),
          SwitchListTile(
            key: const Key('admin_prod_publicado'),
            contentPadding: EdgeInsets.zero,
            title: const Text('Publicar en Mercado'),
            subtitle: const Text(
              'Requiere Presencia o Pro y el canal Mercado habilitado.',
            ),
            value: _publicadoOnline,
            onChanged: enviando
                ? null
                : (valor) => setState(() => _publicadoOnline = valor),
          ),
          if (p != null) ...[
            const SizedBox(height: 12),
            FotoProductoWidget(
              key: const Key('admin_prod_foto'),
              productoId: p.id,
              fotoUrl: p.fotoUrl,
              enabled: !enviando,
              onUpload: (bytes, nombre, mime) async {
                await ref.read(productoFormProvider.notifier).subirFoto(
                      productoId: p.id,
                      bytes: bytes,
                      nombreArchivo: nombre,
                      mimeType: mime,
                    );
              },
              onDelete: () async {
                await ref
                    .read(productoFormProvider.notifier)
                    .borrarFoto(p.id);
              },
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(productoFormProvider);
    final p = widget.existente;
    final error = _validacion ?? estado.errorMensaje;
    final esEdicion = p != null;

    return AlertDialog(
      title: Text(p == null ? 'Nuevo producto' : 'Editar ${p.nombre}'),
      content: SizedBox(
        width: esEdicion ? 520 : 420,
        child: esEdicion ? _buildContenidoEdicion(context, p, estado) : _buildFormulario(context, null, estado.enviando),
      ),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        if (p != null && p.activo)
          TextButton(
            key: const Key('admin_baja_producto'),
            onPressed: estado.enviando ? null : _bajar,
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Dar de baja'),
          ),
        TextButton(
          onPressed: estado.enviando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('admin_guardar_producto'),
          onPressed: estado.enviando ? null : _guardar,
          child: estado.enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Guardar'),
        ),
        if (error != null) ...[
          // El error se muestra debajo de los botones para que siempre sea
          // visible sin importar la pestaña activa.
        ],
      ],
      // Mostrar error como banner inferior del diálogo.
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      scrollable: false,
    );
  }

  /// Contenido para modo edición: TabBar (Datos / Historial) + TabBarView.
  Widget _buildContenidoEdicion(
    BuildContext context,
    Producto p,
    dynamic estado,
  ) {
    final error = _validacion ?? estado.errorMensaje;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 520),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TabBar(
            key: const Key('producto_form_tabs'),
            controller: _tabController,
            tabs: const [
              Tab(key: Key('producto_tab_datos'), text: 'Datos'),
              Tab(key: Key('producto_tab_historial'), text: 'Historial'),
            ],
          ),
          if (error != null) ...[
            const SizedBox(height: 4),
            Text(
              error,
              key: const Key('admin_prod_error'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                // Pestaña Datos
                _buildFormulario(context, p, estado.enviando),
                // Pestaña Historial (lazy loading)
                _historialCargado
                    ? HistorialProductoWidget(productoId: p.id)
                    : const Center(
                        child: Text(
                          'Cargando historial…',
                          key: Key('historial_producto_placeholder'),
                        ),
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
