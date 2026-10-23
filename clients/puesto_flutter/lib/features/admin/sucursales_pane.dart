import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/sucursal.dart';
import '../../services/alertas_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/clientes_service.dart';
import '../../services/dashboard_service.dart';
import '../../services/escritorio_service.dart';
import '../../services/sucursales_service.dart';

class SucursalesPane extends ConsumerWidget {
  const SucursalesPane({super.key});

  Future<void> _entrar(
    BuildContext context,
    WidgetRef ref,
    Sucursal sucursal,
  ) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Entrar a ${sucursal.nombre}'),
        content: const Text(
          'Se vaciarán el carrito y los formularios sin guardar. El cambio también afecta otros dispositivos que usen esta cuenta.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cambiar sucursal'),
          ),
        ],
      ),
    );
    if (confirmado != true || !context.mounted) return;
    try {
      await ref
          .read(authControllerProvider.notifier)
          .cambiarSucursal(sucursal.id);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _importar(
    BuildContext context,
    WidgetRef ref,
    CruceSucursal origen,
  ) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Importar clientes de ${origen.nombre}'),
        content: const Text(
          'Se copiarán los clientes de esta sucursal a la sucursal actual. ¿Continuar?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Importar'),
          ),
        ],
      ),
    );
    if (confirmado != true || !context.mounted) return;

    // Mostrar progreso
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('Importando clientes…'),
            ],
          ),
        ),
      ),
    );

    try {
      final importados = await ref
          .read(sucursalesServiceProvider)
          .importarClientes(origen.id);
      if (!context.mounted) return;
      Navigator.pop(context); // Cerrar progreso
      ref.invalidate(sucursalesProvider);
      ref.invalidate(clientesProvider);
      ref.invalidate(dashboardProvider);
      ref.invalidate(escritorioProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$importados clientes importados desde ${origen.nombre}.'),
        ),
      );
    } on ApiException catch (error) {
      if (!context.mounted) return;
      Navigator.pop(context); // Cerrar progreso
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } catch (_) {
      if (!context.mounted) return;
      Navigator.pop(context); // Cerrar progreso
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudieron importar los clientes.')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final panel = ref.watch(sucursalesProvider);
    final sesion = ref.watch(authControllerProvider).sesion;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Sucursales',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton(
                tooltip: 'Actualizar sucursales',
                onPressed: () => ref.invalidate(sucursalesProvider),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        Expanded(
          child: panel.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      error is ApiException
                          ? error.message
                          : 'No se pudieron cargar las sucursales.',
                    ),
                    TextButton(
                      onPressed: () => ref.invalidate(sucursalesProvider),
                      child: const Text('Reintentar'),
                    ),
                  ],
                ),
              ),
            ),
            data: (datos) => ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                Text(
                  'Sucursal activa: ${sesion?.nombreSucursal ?? "Verificando sesión"}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  '${datos.usadas} de ${datos.cupo} puestos · ${datos.incluidas} incluidos + ${datos.extras} extras',
                ),
                if (datos.esDueno)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: FilledButton.icon(
                      key: const Key('sucursal_nueva'),
                      onPressed: !datos.puedeCrear
                          ? null
                          : () async {
                              final mensaje = await showDialog<String>(
                                context: context,
                                barrierDismissible: false,
                                builder: (_) => const _CrearSucursalDialog(),
                              );
                              if (mensaje == null || !context.mounted) return;
                              ref.invalidate(sucursalesProvider);
                              ScaffoldMessenger.of(
                                context,
                              ).showSnackBar(SnackBar(content: Text(mensaje)));
                            },
                      icon: const Icon(Icons.add),
                      label: const Text('Nueva sucursal'),
                    ),
                  ),
                if (datos.esDueno && !datos.puedeCrear)
                  const Text('El cupo de sucursales está completo.'),
                if (sesion?.staff.puedeCambiar != true)
                  const Text('No tenés habilitado el cambio de sucursal.')
                else if (sesion?.contextoProtegido != true)
                  const Text(
                    'El servidor necesita actualizarse antes de cambiar de sucursal.',
                  ),
                const SizedBox(height: 12),
                for (final sucursal in datos.sucursales)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            sucursal.nombre,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          if (sucursal.referencia.isNotEmpty)
                            Text(sucursal.referencia),
                          Text(
                            [
                              if (sucursal.esMatriz) 'Casa matriz',
                              if (sucursal.esActual) 'Actual',
                              if (!sucursal.activa) 'Inactiva',
                            ].join(' · '),
                          ),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if (!sucursal.esActual && sucursal.activa)
                                OutlinedButton(
                                  key: Key('sucursal_entrar_${sucursal.id}'),
                                  onPressed:
                                      sesion?.staff.puedeCambiar == true &&
                                          sesion?.contextoProtegido == true
                                      ? () => _entrar(context, ref, sucursal)
                                      : null,
                                  child: const Text('Entrar'),
                                ),
                              if (datos.esDueno &&
                                  !sucursal.esMatriz &&
                                  sucursal.activa)
                                TextButton.icon(
                                  key: Key(
                                    'sucursal_transferir_${sucursal.id}',
                                  ),
                                  onPressed: datos.productos.isEmpty
                                      ? null
                                      : () async {
                                          final ok = await showDialog<bool>(
                                            context: context,
                                            barrierDismissible: false,
                                            builder: (_) =>
                                                _TransferirStockDialog(
                                                  destino: sucursal,
                                                  productos: datos.productos,
                                                ),
                                          );
                                          if (ok != true || !context.mounted) {
                                            return;
                                          }
                                          ref.invalidate(sucursalesProvider);
                                          ref.invalidate(catalogoProvider);
                                          ref.invalidate(alertasProvider);
                                          ref.invalidate(dashboardProvider);
                                          ref.invalidate(escritorioProvider);
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                                const SnackBar(
                                                  content: Text(
                                                    'Stock transferido desde casa matriz.',
                                                  ),
                                                ),
                                              );
                                        },
                                  icon: const Icon(
                                    Icons.local_shipping_outlined,
                                  ),
                                  label: const Text('Recibir stock de matriz'),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                if (datos.esDueno) ...[
                  const SizedBox(height: 20),
                  Text(
                    'Comparar puestos',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const Text(
                    'Cobrado y tickets: últimos 7 días. Stock bajo: actual.',
                  ),
                  const SizedBox(height: 8),
                  for (final cruce in datos.cruce)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              cruce.nombre,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 24,
                              runSpacing: 8,
                              children: [
                                Text('Cobrado: ${moneda(cruce.ventas)}'),
                                Text('Tickets: ${cruce.tickets}'),
                                Text(
                                  'Productos con stock bajo: ${cruce.stockBajo}',
                                ),
                              ],
                            ),
                            if (cruce.id !=
                                datos.sucursales
                                    .where((s) => s.esActual)
                                    .firstOrNull
                                    ?.id)
                              Padding(
                                padding: const EdgeInsets.only(top: 12),
                                child: OutlinedButton.icon(
                                  key: Key(
                                    'sucursal_importar_${cruce.id}',
                                  ),
                                  onPressed: () =>
                                      _importar(context, ref, cruce),
                                  icon: const Icon(Icons.file_download),
                                  label: const Text('Importar clientes'),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CrearSucursalDialog extends ConsumerStatefulWidget {
  const _CrearSucursalDialog();

  @override
  ConsumerState<_CrearSucursalDialog> createState() =>
      _CrearSucursalDialogState();
}

class _CrearSucursalDialogState extends ConsumerState<_CrearSucursalDialog> {
  final _form = GlobalKey<FormState>();
  final _nombre = TextEditingController();
  final _referencia = TextEditingController();
  bool _enviando = false;
  String? _error;

  @override
  void dispose() {
    _nombre.dispose();
    _referencia.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (_enviando || !_form.currentState!.validate()) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      final resultado = await ref
          .read(sucursalesServiceProvider)
          .crear(
            nombre: _nombre.text.trim(),
            referencia: _referencia.text.trim(),
          );
      if (!mounted) return;
      Navigator.pop(
        context,
        'Sucursal creada. ${resultado.productos} productos copiados sin stock.',
      );
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo crear la sucursal.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_enviando,
    child: AlertDialog(
      title: const Text('Nueva sucursal'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Copia los productos activos de casa matriz, sin stock ni publicación en Mercado.',
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: const Key('sucursal_nombre'),
                  controller: _nombre,
                  enabled: !_enviando,
                  maxLength: 80,
                  decoration: const InputDecoration(labelText: 'Nombre'),
                  validator: (v) => (v?.trim().length ?? 0) < 2
                      ? 'Ingresá al menos 2 caracteres.'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('sucursal_referencia'),
                  controller: _referencia,
                  enabled: !_enviando,
                  maxLength: 160,
                  decoration: const InputDecoration(
                    labelText: 'Referencia (opcional)',
                  ),
                ),
                if (_error != null)
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _enviando ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('sucursal_crear'),
          onPressed: _enviando ? null : _guardar,
          child: Text(_enviando ? 'Creando…' : 'Crear sucursal'),
        ),
      ],
    ),
  );
}

class _TransferirStockDialog extends ConsumerStatefulWidget {
  const _TransferirStockDialog({
    required this.destino,
    required this.productos,
  });

  final Sucursal destino;
  final List<ProductoMatriz> productos;

  @override
  ConsumerState<_TransferirStockDialog> createState() =>
      _TransferirStockDialogState();
}

class _TransferirStockDialogState
    extends ConsumerState<_TransferirStockDialog> {
  final _form = GlobalKey<FormState>();
  final _cantidad = TextEditingController();
  ProductoMatriz? _producto;
  bool _enviando = false;
  String? _error;

  @override
  void dispose() {
    _cantidad.dispose();
    super.dispose();
  }

  Future<void> _transferir() async {
    if (_enviando || !_form.currentState!.validate()) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      await ref
          .read(sucursalesServiceProvider)
          .transferir(
            destinoId: widget.destino.id,
            productoId: _producto!.id,
            cantidad: double.parse(_cantidad.text.trim().replaceAll(',', '.')),
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo transferir el stock.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_enviando,
    child: AlertDialog(
      title: const Text('Transferir desde casa matriz'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Destino: ${widget.destino.nombre}'),
                const SizedBox(height: 16),
                DropdownButtonFormField<ProductoMatriz>(
                  key: const Key('transferencia_producto'),
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Producto de matriz',
                  ),
                  items: [
                    for (final producto in widget.productos)
                      DropdownMenuItem(
                        value: producto,
                        child: Text(
                          producto.nombre,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: _enviando
                      ? null
                      : (value) => setState(() => _producto = value),
                  validator: (value) =>
                      value == null ? 'Elegí un producto.' : null,
                ),
                if (_producto != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('Stock en matriz: ${_producto!.stock}'),
                  ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('transferencia_cantidad'),
                  controller: _cantidad,
                  enabled: !_enviando,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: 'Cantidad'),
                  validator: (value) {
                    final cantidad = double.tryParse(
                      (value ?? '').trim().replaceAll(',', '.'),
                    );
                    if (cantidad == null ||
                        !cantidad.isFinite ||
                        cantidad <= 0) {
                      return 'Ingresá una cantidad mayor a cero.';
                    }
                    if (_producto != null && cantidad > _producto!.stock) {
                      return 'La cantidad supera el stock de matriz.';
                    }
                    return null;
                  },
                ),
                if (_error != null)
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _enviando ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('transferencia_confirmar'),
          onPressed: _enviando ? null : _transferir,
          child: Text(_enviando ? 'Transfiriendo…' : 'Transferir'),
        ),
      ],
    ),
  );
}
