import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/tema.dart';
import '../../services/compradores_app_service.dart';

/// Panel de administración que lista los compradores de Mercado al Toque
/// del puesto. Muestra estadísticas detalladas, botón "Agregar a mis clientes"
/// y ficha editable para compradores vinculados.
class ClientesAppPane extends ConsumerStatefulWidget {
  const ClientesAppPane({super.key});

  @override
  ConsumerState<ClientesAppPane> createState() => _ClientesAppPaneState();
}

class _ClientesAppPaneState extends ConsumerState<ClientesAppPane> {
  final _busqueda = TextEditingController();
  String _filtro = '';

  @override
  void dispose() {
    _busqueda.dispose();
    super.dispose();
  }

  void _buscar(String valor) {
    setState(() => _filtro = valor.trim().toLowerCase());
  }

  @override
  Widget build(BuildContext context) {
    final compradoresAsync =
        ref.watch(compradoresAppDetalladoProvider(_filtro.isEmpty ? null : _filtro));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Clientes de la app',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Actualizar',
                onPressed: () => ref.invalidate(compradoresAppDetalladoProvider),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        compradoresAsync.when(
          loading: () =>
              const Expanded(child: Center(child: CircularProgressIndicator())),
          error: (error, _) => Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Error al cargar compradores.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () =>
                        ref.invalidate(compradoresAppDetalladoProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
          ),
          data: (lista) {
            return Expanded(
              child: Column(
                children: [
                  _EstadisticasBar(compradores: lista),
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: TextField(
                      key: const Key('clientes_app_busqueda'),
                      controller: _busqueda,
                      onChanged: _buscar,
                      decoration: const InputDecoration(
                        labelText: 'Buscar por nombre, mail o teléfono',
                        prefixIcon: Icon(Icons.search),
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  Expanded(
                    child: lista.isEmpty
                        ? Center(
                            child: Text(
                              _filtro.isEmpty
                                  ? 'No hay compradores de la app.'
                                  : 'Ningun comprador coincide con la busqueda.',
                              key: const Key('clientes_app_vacia'),
                            ),
                          )
                        : ListView.separated(
                            key: const Key('clientes_app_lista'),
                            itemCount: lista.length,
                            separatorBuilder: (_, _) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final comprador = lista[index];
                              return _CompradorFila(comprador: comprador);
                            },
                          ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _EstadisticasBar extends StatelessWidget {
  const _EstadisticasBar({required this.compradores});

  final List<CompradorAppDetalle> compradores;

  @override
  Widget build(BuildContext context) {
    final total = compradores.length;
    final enLista = compradores.where((c) => c.enLista).length;
    final totalPedidos =
        compradores.fold<int>(0, (s, c) => s + c.pedidos);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _StatItem(
                label: 'Compradores',
                valor: '$total',
                icon: Icons.people_outline,
              ),
              _StatItem(
                label: 'En tu lista',
                valor: '$enLista',
                icon: Icons.bookmark_outline,
                color: Colors.green,
              ),
              _StatItem(
                label: 'Pedidos totales',
                valor: '$totalPedidos',
                icon: Icons.shopping_bag_outlined,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({
    required this.label,
    required this.valor,
    required this.icon,
    this.color,
  });

  final String label;
  final String valor;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20, color: color ?? theme.colorScheme.primary),
        const SizedBox(height: 4),
        Text(
          valor,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

/// Fila expandible de comprador con estadísticas detalladas, botón
/// "Agregar a mis clientes" y ficha editable.
class _CompradorFila extends ConsumerStatefulWidget {
  const _CompradorFila({required this.comprador});

  final CompradorAppDetalle comprador;

  @override
  ConsumerState<_CompradorFila> createState() => _CompradorFilaState();
}

class _CompradorFilaState extends ConsumerState<_CompradorFila> {
  bool _expandido = false;

  String _identidadLabel(String identidad) {
    return switch (identidad) {
      'documentacion_cargada' => 'Documentación cargada',
      'rechazada' => 'Documentación rechazada',
      'aprobada' => 'Identidad aprobada',
      _ => 'Sin documento',
    };
  }

  void _toggle() => setState(() => _expandido = !_expandido);

  Future<void> _sumar() async {
    try {
      await ref
          .read(compradoresAppServiceProvider)
          .sumarComprador(widget.comprador.userId);
      if (!mounted) return;
      ref.invalidate(compradoresAppDetalladoProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Quedó en tu lista de clientes.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _editarFicha() {
    showDialog<void>(
      context: context,
      builder: (_) => _EditarCompradorDialog(comprador: widget.comprador),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = context.tokens;
    final c = widget.comprador;
    final statsAsync = _expandido
        ? ref.watch(estadisticasCompradorProvider(c.userId))
        : null;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        InkWell(
          key: Key('comprador_app_${c.userId}'),
          onTap: _toggle,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                CircleAvatar(
                  child: Text(
                    c.nombre.isNotEmpty ? c.nombre[0].toUpperCase() : '?',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              c.nombre,
                              style: const TextStyle(fontWeight: FontWeight.w500),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (c.enLista)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.green.shade100,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'En tu lista',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.green.shade800,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${c.email} · ${c.pedidos} pedidos'
                        '${c.telefono != null ? ' · ${c.telefono}' : ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12,
                            color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                Icon(
                  _expandido ? Icons.expand_less : Icons.expand_more,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
        if (_expandido) ...[
          Divider(height: 1, color: tokens.line),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.badge_outlined,
                        size: 16, color: theme.colorScheme.primary),
                    const SizedBox(width: 6),
                    Text(_identidadLabel(c.identidad),
                        style: const TextStyle(fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    if (!c.enLista)
                      FilledButton.tonalIcon(
                        key: Key('sumar_comprador_${c.userId}'),
                        onPressed: _sumar,
                        icon: const Icon(Icons.person_add, size: 16),
                        label: const Text('Agregar a mis clientes'),
                      ),
                    const Spacer(),
                    if (c.clienteId != null)
                      TextButton.icon(
                        key: Key('editar_ficha_${c.userId}'),
                        onPressed: _editarFicha,
                        icon: const Icon(Icons.edit_outlined, size: 16),
                        label: const Text('Editar ficha'),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                _EstadisticasDetalle(statsAsync: statsAsync),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// Panel de estadísticas detalladas del comprador.
class _EstadisticasDetalle extends StatelessWidget {
  const _EstadisticasDetalle({required this.statsAsync});

  final AsyncValue<EstadisticasCompradorApp>? statsAsync;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (statsAsync == null) return const SizedBox.shrink();

    return statsAsync!.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(
            child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2))),
      ),
      error: (e, _) => Text(
        'Error al cargar estadísticas: $e',
        style: TextStyle(fontSize: 12, color: theme.colorScheme.error),
      ),
      data: (stats) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Estadísticas en este puesto',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              _DatoChip(label: 'Pedidos', valor: '${stats.pedidos}'),
              _DatoChip(label: 'Importe', valor: moneda(stats.total)),
              _DatoChip(label: 'Cobrados', valor: '${stats.cobrados}'),
              _DatoChip(label: 'En curso', valor: '${stats.enCurso}'),
              _DatoChip(label: 'Anulados', valor: '${stats.anulados}'),
              _DatoChip(
                label: 'Última compra',
                valor: stats.ultimo != null
                    ? fechaCorta(stats.ultimo!)
                    : 'Sin compras',
              ),
            ],
          ),
          if (stats.formas.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Formas de pago',
                style: theme.textTheme.bodySmall
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            for (final f in stats.formas)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  '${_formaLabel(f.forma)} · ${f.cantidad} · ${moneda(f.total)}',
                  style: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
          ],
        ],
      ),
    );
  }

  static String _formaLabel(String forma) => switch (forma) {
        'efectivo' => 'Efectivo',
        'transferencia' => 'Transferencia',
        'tarjeta' => 'Tarjeta',
        'cuenta_corriente' => 'Cuenta corriente',
        'sin_pago' => 'Sin informar',
        _ => forma,
      };
}

class _DatoChip extends StatelessWidget {
  const _DatoChip({required this.label, required this.valor});
  final String label;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: 11, color: theme.colorScheme.onSurfaceVariant)),
        Text(valor,
            style:
                const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
      ],
    );
  }
}

/// Dialog para editar los datos de un comprador de la app.
/// Solo permite editar nombre, teléfono y dirección.
class _EditarCompradorDialog extends ConsumerStatefulWidget {
  const _EditarCompradorDialog({required this.comprador});
  final CompradorAppDetalle comprador;

  @override
  ConsumerState<_EditarCompradorDialog> createState() =>
      _EditarCompradorDialogState();
}

class _EditarCompradorDialogState
    extends ConsumerState<_EditarCompradorDialog> {
  late final TextEditingController _nombre;
  late final TextEditingController _telefono;
  late final TextEditingController _direccion;
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nombre = TextEditingController(text: widget.comprador.nombre);
    _telefono = TextEditingController(text: widget.comprador.telefono ?? '');
    _direccion = TextEditingController(text: '');
  }

  @override
  void dispose() {
    _nombre.dispose();
    _telefono.dispose();
    _direccion.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    if (nombre.isEmpty) {
      setState(() => _error = 'El nombre es obligatorio.');
      return;
    }
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      await ref.read(compradoresAppServiceProvider).actualizarComprador(
            widget.comprador.userId,
            nombre: nombre,
            telefono: _telefono.text.trim(),
            direccion: _direccion.text.trim(),
          );
      if (!mounted) return;
      ref.invalidate(compradoresAppDetalladoProvider);
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ficha guardada.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().contains('Exception')
            ? e.toString().replaceAll('Exception: ', '')
            : 'No se pudo guardar.';
        _guardando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final puedeEditar = widget.comprador.clienteId != null;
    return AlertDialog(
      title: Text('Editar: ${widget.comprador.nombre}'),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!puedeEditar)
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline,
                        size: 18,
                        color: Theme.of(context).colorScheme.onErrorContainer),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Primero debes agregarlo a tus clientes para editar la ficha.',
                        style: TextStyle(
                          fontSize: 12,
                          color:
                              Theme.of(context).colorScheme.onErrorContainer,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            TextField(
              key: const Key('editar_comprador_nombre'),
              controller: _nombre,
              enabled: puedeEditar,
              decoration: const InputDecoration(labelText: 'Nombre'),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('editar_comprador_telefono'),
              controller: _telefono,
              enabled: puedeEditar,
              decoration: const InputDecoration(labelText: 'Teléfono'),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('editar_comprador_direccion'),
              controller: _direccion,
              enabled: puedeEditar,
              decoration: const InputDecoration(labelText: 'Dirección'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _guardando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('guardar_ficha_comprador'),
          onPressed: _guardando || !puedeEditar ? null : _guardar,
          child: _guardando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Guardar'),
        ),
      ],
    );
  }
}
