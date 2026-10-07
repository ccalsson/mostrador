import 'package:flutter/material.dart';

import '../market_api.dart';
import '../widgets/common.dart';

class CartLine {
  const CartLine({
    required this.tenantId,
    required this.tenantName,
    required this.product,
    required this.quantity,
    required this.readAt,
    required this.stale,
  });

  final String tenantId;
  final String tenantName;
  final Map<String, dynamic> product;
  final double quantity;
  final DateTime readAt;
  final bool stale;

  CartLine copyWith({double? quantity}) => CartLine(
    tenantId: tenantId,
    tenantName: tenantName,
    product: product,
    quantity: quantity ?? this.quantity,
    readAt: readAt,
    stale: stale,
  );

  Map<String, dynamic> toCheckoutItem() => {
    'tenantId': tenantId,
    'productoId': product['id'],
    'cantidad': quantity,
  };
}

class CartScreen extends StatefulWidget {
  const CartScreen({
    required this.api,
    required this.actor,
    required this.lines,
    required this.onQuantityChanged,
    required this.onRemove,
    required this.onIdentityNeeded,
    required this.onCheckout,
    super.key,
  });

  final MercadoApi api;
  final Map<String, dynamic> actor;
  final Map<String, CartLine> lines;
  final void Function(String id, double quantity) onQuantityChanged;
  final ValueChanged<String> onRemove;
  final VoidCallback onIdentityNeeded;
  final ValueChanged<Map<String, dynamic>> onCheckout;

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _busy = false;
  Map<String, dynamic>? _pending;
  final _note = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadPending();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _loadPending() async {
    final pending = await widget.api.pendingCheckout(
      widget.actor['id'] as String,
    );
    if (mounted) setState(() => _pending = pending);
  }

  Future<void> _checkout() async {
    if (widget.actor['estadoIdentidad'] != 'documentacion_cargada') {
      widget.onIdentityNeeded();
      return;
    }
    final payment = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(title: Text('Elegí cómo vas a pagar al puesto')),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('Efectivo'),
              onTap: () => Navigator.pop(context, 'efectivo'),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_outlined),
              title: const Text('Transferencia'),
              onTap: () => Navigator.pop(context, 'transferencia'),
            ),
          ],
        ),
      ),
    );
    if (payment == null || !mounted) return;
    await _sendCheckout(payment);
  }

  Future<void> _sendCheckout(String payment) async {
    setState(() => _busy = true);
    try {
      final result = await widget.api.checkout(
        userId: widget.actor['id'] as String,
        items: widget.lines.values
            .map((line) => line.toCheckoutItem())
            .toList(),
        paymentMethod: payment,
        note: _note.text.trim(),
      );
      if (mounted) widget.onCheckout(result);
    } on MercadoApiException catch (error) {
      if (mounted) {
        setState(() {
          _pending = error.definitiveClientError ? null : _pending;
        });
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
        if (!error.definitiveClientError) await _loadPending();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lines = widget.lines.values.toList();
    final isPending = _pending != null;
    final stale = lines.any((line) => line.stale);
    final groups = <String, List<MapEntry<String, CartLine>>>{};
    for (final entry in widget.lines.entries) {
      groups.putIfAbsent(entry.value.tenantId, () => []).add(entry);
    }
    return Column(
      children: [
        if (isPending)
          MaterialBanner(
            content: const Text(
              'Hay un checkout sin confirmación. Reintentar enviará exactamente '
              'la misma solicitud con la misma clave.',
            ),
            leading: const Icon(Icons.sync_problem),
            actions: const [],
          ),
        if (widget.actor['estadoIdentidad'] != 'documentacion_cargada' &&
            !isPending)
          MaterialBanner(
            content: const Text(
              'Completá tu documentación antes de confirmar una compra.',
            ),
            leading: const Icon(Icons.verified_user_outlined),
            actions: [
              TextButton(
                onPressed: widget.onIdentityNeeded,
                child: const Text('Completar ahora'),
              ),
            ],
          ),
        if (lines.isEmpty && !isPending)
          const Expanded(child: Center(child: Text('Tu carrito está vacío.')))
        else ...[
          Expanded(
            child: ListView(
              children: [
                if (isPending)
                  ListTile(
                    leading: const Icon(Icons.schedule),
                    title: const Text(
                      'Compra pendiente de respuesta del servidor',
                    ),
                    subtitle: Text(
                      '${(_pending!['items'] as List?)?.length ?? 0} líneas en el intento guardado',
                    ),
                  ),
                if (!isPending && lines.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: TextField(
                      controller: _note,
                      maxLength: 500,
                      decoration: const InputDecoration(
                        labelText: 'Nota para el puesto (opcional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                for (final entry in groups.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                    child: Text(
                      entry.value.first.value.tenantName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  for (final item in entry.value)
                    ListTile(
                      title: Text(item.value.product['nombre'] as String),
                      subtitle: Text(
                        '${money(asNumber(item.value.product['precio']))} · '
                        '${item.value.product['unidadLabel']} · '
                        '${item.value.stale ? 'Catálogo sin conexión' : timeLabel(item.value.readAt)}',
                      ),
                      leading: IconButton(
                        tooltip: 'Quitar del carrito',
                        onPressed: _busy || isPending
                            ? null
                            : () => widget.onRemove(item.key),
                        icon: const Icon(Icons.remove_circle_outline),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: 'Restar cantidad',
                            onPressed: _busy || isPending
                                ? null
                                : () => widget.onQuantityChanged(
                                    item.key,
                                    item.value.quantity - 1,
                                  ),
                            icon: const Icon(Icons.remove),
                          ),
                          Text(quantity(item.value.quantity)),
                          IconButton(
                            tooltip: 'Sumar cantidad',
                            onPressed: _busy || isPending
                                ? null
                                : () => widget.onQuantityChanged(
                                    item.key,
                                    item.value.quantity + 1,
                                  ),
                            icon: const Icon(Icons.add),
                          ),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
          if (stale && !isPending)
            const Padding(
              padding: EdgeInsets.all(8),
              child: Text(
                'Actualizá el catálogo para habilitar la confirmación.',
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _busy || (!isPending && (lines.isEmpty || stale))
                    ? null
                    : isPending
                    ? () => _sendCheckout('efectivo')
                    : _checkout,
                icon: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.lock_outline),
                label: Text(
                  isPending ? 'Reintentar confirmación' : 'Confirmar pedidos',
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
