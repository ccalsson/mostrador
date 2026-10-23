import 'package:flutter/material.dart';

import '../../models/addon.dart';
import '../../services/addons_service.dart';

/// Formatea un monto en pesos argentinos sin depender de locale intl.
String _ars(double value) {
  final n = value.round();
  final neg = n < 0;
  final abs = n.abs().toString();
  final buf = StringBuffer(neg ? '-\$' : '\$');
  for (var i = 0; i < abs.length; i++) {
    final pos = abs.length - i;
    if (i > 0 && pos % 3 == 0) buf.write('.');
    buf.write(abs[i]);
  }
  return buf.toString();
}

/// Formatea un monto en dólares.
String _usd(double value) {
  return 'USD ${value.toStringAsFixed(2)}';
}

/// Panel de add-ons: catálogo para comprar y sección de contratados.
///
/// Solo visible para admin. Requiere aceptar dos contratos legales antes
/// de confirmar cualquier compra.
class AddonsPane extends StatefulWidget {
  const AddonsPane({super.key, required this.service});

  final AddonsService service;

  @override
  State<AddonsPane> createState() => _AddonsPaneState();
}

class _AddonsPaneState extends State<AddonsPane> {
  Future<_AddonsData>? _future;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  void _cargar() {
    setState(() {
      _future = _cargarDatos();
    });
  }

  Future<_AddonsData> _cargarDatos() async {
    final results = await Future.wait([
      widget.service.listar(),
      widget.service.obtenerContratos(),
    ]);
    final addons = results[0] as List<Addon>;
    final contratos = results[1] as List<AddonContrato>;
    final disponibles = addons.where((a) => !a.contratado).toList();
    final contratados = addons.where((a) => a.contratado).toList();
    return _AddonsData(
      disponibles: disponibles,
      contratados: contratados,
      contratos: contratos,
    );
  }

  void _mostrarDialogCompra(Addon addon, List<AddonContrato> contratos) {
    showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _ComprarAddonDialog(
        addon: addon,
        contratos: contratos,
        service: widget.service,
      ),
    ).then((compro) {
      if (compro == true) _cargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_AddonsData>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return _ErrorView(error: snap.error!, onRetry: _cargar);
        }
        if (!snap.hasData) {
          return const SizedBox.shrink();
        }
        final data = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _cargar(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Catálogo de add-ons disponibles
              Text(
                'Add-ons disponibles',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              if (data.disponibles.isEmpty)
                _EmptySection(
                  mensaje: 'No hay add-ons disponibles para comprar.',
                )
              else
                LayoutBuilder(
                  builder: (context, constraints) {
                    final crossCount = constraints.maxWidth > 700 ? 3 : 2;
                    return GridView.count(
                      crossAxisCount: crossCount,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.85,
                      children: data.disponibles
                          .map((addon) => _AddonCard(
                                addon: addon,
                                onComprar: () =>
                                    _mostrarDialogCompra(addon, data.contratos),
                              ))
                          .toList(),
                    );
                  },
                ),

              const SizedBox(height: 24),

              // Sección de contratados
              Text(
                'Contratados',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              if (data.contratados.isEmpty)
                _EmptySection(
                  mensaje: 'Todavía no contrataste ningún add-on.',
                )
              else
                ...data.contratados.map((addon) => _ContratadoTile(addon: addon)),
            ],
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Data holder
// ---------------------------------------------------------------------------

class _AddonsData {
  const _AddonsData({
    required this.disponibles,
    required this.contratados,
    required this.contratos,
  });

  final List<Addon> disponibles;
  final List<Addon> contratados;
  final List<AddonContrato> contratos;
}

// ---------------------------------------------------------------------------
// Tarjeta de add-on disponible
// ---------------------------------------------------------------------------

class _AddonCard extends StatelessWidget {
  const _AddonCard({required this.addon, required this.onComprar});

  final Addon addon;
  final VoidCallback onComprar;

  IconData _iconoPara(String? nombre) {
    switch (nombre) {
      case 'mercado':
        return Icons.storefront_outlined;
      case 'messaging':
        return Icons.chat_outlined;
      case 'branch':
        return Icons.store_outlined;
      case 'advertising':
        return Icons.campaign_outlined;
      default:
        return Icons.extension_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_iconoPara(addon.icono), size: 32, color: cs.primary),
          const SizedBox(height: 10),
          Text(
            addon.nombre,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Expanded(
            child: Text(
              addon.descripcion,
              style: TextStyle(
                fontSize: 12,
                color: cs.onSurface.withValues(alpha: 0.6),
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _usd(addon.precioUSD),
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          Text(
            _ars(addon.precioARS),
            style: TextStyle(
              fontSize: 11,
              color: cs.onSurface.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonal(
              onPressed: onComprar,
              child: const Text('Comprar'),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tile de add-on contratado
// ---------------------------------------------------------------------------

class _ContratadoTile extends StatelessWidget {
  const _ContratadoTile({required this.addon});
  final Addon addon;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Row(
        children: [
          Icon(Icons.check_circle, color: cs.primary, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  addon.nombre,
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
                Text(
                  addon.descripcion,
                  style: TextStyle(
                    fontSize: 12,
                    color: cs.onSurface.withValues(alpha: 0.5),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: cs.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Activo',
              style: TextStyle(
                fontSize: 11,
                color: cs.onPrimaryContainer,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sección vacía
// ---------------------------------------------------------------------------

class _EmptySection extends StatelessWidget {
  const _EmptySection({required this.mensaje});
  final String mensaje;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Center(
        child: Text(
          mensaje,
          style: TextStyle(color: cs.onSurface.withValues(alpha: 0.5)),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Error view
// ---------------------------------------------------------------------------

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: cs.error),
            const SizedBox(height: 12),
            Text(
              'Error al cargar los add-ons.',
              style: TextStyle(color: cs.error),
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: onRetry,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Dialog de compra con contratos legales
// ---------------------------------------------------------------------------

class _ComprarAddonDialog extends StatefulWidget {
  const _ComprarAddonDialog({
    required this.addon,
    required this.contratos,
    required this.service,
  });

  final Addon addon;
  final List<AddonContrato> contratos;
  final AddonsService service;

  @override
  State<_ComprarAddonDialog> createState() => _ComprarAddonDialogState();
}

class _ComprarAddonDialogState extends State<_ComprarAddonDialog> {
  String _formaPago = 'cuenta_corriente';
  final Map<String, bool> _aceptaciones = {};
  bool _comprando = false;
  String? _error;

  bool get _todosAceptados {
    // Debe haber al menos 2 contratos y todos aceptados.
    if (widget.contratos.length < 2) return false;
    return widget.contratos.every((c) => _aceptaciones[c.id] == true);
  }

  Future<void> _confirmar() async {
    setState(() {
      _comprando = true;
      _error = null;
    });

    try {
      // Primero aceptar contratos si hace falta.
      final pendientes = widget.contratos.where((c) => !c.aceptado).toList();
      if (pendientes.isNotEmpty) {
        await widget.service.aceptarContratos();
      }
      // Luego comprar.
      await widget.service.comprar(widget.addon.id, _formaPago);
      if (mounted) Navigator.of(context).pop(true);
    } on AddonCompraException catch (e) {
      setState(() {
        _error = e.mensajeUsuario;
        _comprando = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Error al comprar el add-on. Intentá de nuevo.';
        _comprando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return AlertDialog(
      title: Text('Comprar ${widget.addon.nombre}'),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Precio
              Text(
                _usd(widget.addon.precioUSD),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(
                _ars(widget.addon.precioARS),
                style: TextStyle(
                  fontSize: 13,
                  color: cs.onSurface.withValues(alpha: 0.5),
                ),
              ),
              const SizedBox(height: 16),

              // Forma de pago
              Text(
                'Forma de pago',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'cuenta_corriente',
                    label: Text('Cuenta corriente'),
                    icon: Icon(Icons.account_balance_wallet_outlined),
                  ),
                  ButtonSegment(
                    value: 'transferencia',
                    label: Text('Transferencia'),
                    icon: Icon(Icons.account_balance_outlined),
                  ),
                ],
                selected: {_formaPago},
                onSelectionChanged: (s) => setState(() => _formaPago = s.first),
              ),
              const SizedBox(height: 20),

              // Contratos legales
              Text(
                'Contratos legales',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 4),
              Text(
                'Debés aceptar ambos documentos para continuar.',
                style: TextStyle(
                  fontSize: 12,
                  color: cs.onSurface.withValues(alpha: 0.5),
                ),
              ),
              const SizedBox(height: 8),

              ...widget.contratos.map((contrato) {
                final yaAceptado = contrato.aceptado;
                return CheckboxListTile(
                  value: yaAceptado || (_aceptaciones[contrato.id] == true),
                  onChanged: yaAceptado
                      ? null
                      : (v) => setState(() => _aceptaciones[contrato.id] = v ?? false),
                  title: Text(contrato.titulo),
                  subtitle: yaAceptado
                      ? Text(
                          'Ya aceptado',
                          style: TextStyle(
                            fontSize: 11,
                            color: cs.primary,
                          ),
                        )
                      : Text(
                          'Versión ${contrato.version}',
                          style: TextStyle(fontSize: 11),
                        ),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                );
              }),

              const SizedBox(height: 8),

              // Mensaje de forma de pago
              if (_formaPago == 'cuenta_corriente')
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: cs.secondaryContainer.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, size: 18, color: cs.secondary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Se descuenta de tu saldo en cuenta corriente.',
                          style: TextStyle(fontSize: 12, color: cs.onSurface),
                        ),
                      ),
                    ],
                  ),
                ),
              if (_formaPago == 'transferencia')
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: cs.tertiaryContainer.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, size: 18, color: cs.tertiary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Vas a recibir los datos para la transferencia.',
                          style: TextStyle(fontSize: 12, color: cs.onSurface),
                        ),
                      ),
                    ],
                  ),
                ),

              // Error
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: cs.errorContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error_outline, size: 18, color: cs.error),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: TextStyle(fontSize: 12, color: cs.onErrorContainer),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _comprando ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: (_todosAceptados && !_comprando) ? _confirmar : null,
          child: _comprando
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Confirmar'),
        ),
      ],
    );
  }
}
