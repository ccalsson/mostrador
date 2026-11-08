import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/pedido.dart';
import 'entrega_controller.dart';

/// Diálogo de entrega con checklist por ítem, observación global y botones
/// "Entrega total" / "Parcial" / "Cancelar". Paridad con el componente web
/// `entrega-lista.tsx`.
///
/// Cada ítem del pedido se muestra con un checkbox (visto/no visto), un campo
/// de cantidad editable y una nota por producto. La observación global solo es
/// obligatoria cuando se elige entrega parcial.
///
/// Devuelve `true` al cerrar si la entrega se envió correctamente.
class EntregaListaDialog extends ConsumerStatefulWidget {
  const EntregaListaDialog({super.key, required this.pedido});

  final Pedido pedido;

  @override
  ConsumerState<EntregaListaDialog> createState() => _EntregaListaDialogState();
}

class _EntregaListaDialogState extends ConsumerState<EntregaListaDialog> {
  late final Map<String, _LineaEntrega> _lineas;
  late final TextEditingController _observacionCtrl;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    _observacionCtrl = TextEditingController();
    _lineas = {
      for (final item in widget.pedido.items)
        item.id: _LineaEntrega(
          visto: false,
          cantidad: item.cantidad,
          nota: '',
        ),
    };
  }

  @override
  void dispose() {
    _observacionCtrl.dispose();
    super.dispose();
  }

  void _editarLinea(String itemId, _LineaEntrega Function(_LineaEntrega) cambio) {
    setState(() {
      final actual = _lineas[itemId];
      if (actual != null) _lineas[itemId] = cambio(actual);
    });
  }

  bool get _todosVistos =>
      widget.pedido.items.every((item) => _lineas[item.id]?.visto ?? false);

  /// Diferencias respecto al pedido original: cantidad distinta o nota no vacía.
  List<PedidoItem> get _diferencias => widget.pedido.items.where((item) {
        final linea = _lineas[item.id];
        if (linea == null) return true;
        return (linea.cantidad - item.cantidad).abs() > 0.001 ||
            linea.nota.trim().isNotEmpty;
      }).toList();

  bool get _totalHabilitada =>
      _todosVistos && _diferencias.isEmpty && _observacionCtrl.text.trim().isEmpty;

  bool get _parcialHabilitada =>
      _todosVistos &&
      _diferencias.isNotEmpty &&
      _observacionCtrl.text.trim().isNotEmpty;

  Future<void> _cerrar({required String modo}) async {
    if (_guardando) return;
    // Guard local sincrónico: evita que un doble tap dispare dos entregas.
    _guardando = true;
    if (mounted) setState(() {});

    final pedidoId = widget.pedido.id;
    final controller = ref.read(entregaControllerProvider(pedidoId).notifier);

    // Cerrar el diálogo inmediatamente para que un segundo tap no encuentre
    // el botón. El resultado se muestra vía SnackBar en el screen padre.
    if (mounted) Navigator.of(context).pop(true);

    try {
      if (modo == 'total') {
        await controller.entregar();
      } else {
        final lineas = [
          for (final item in widget.pedido.items)
            EntregaLinea(
              itemId: item.id,
              cantidad: _lineas[item.id]?.cantidad ?? 0,
              nota: _lineas[item.id]?.nota ?? '',
            ),
        ];
        await controller.entregarParcial(lineas);
      }

      if (!mounted) return;
      final estado = ref.read(entregaControllerProvider(pedidoId));
      if (estado.fase == EntregaFase.error) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(estado.errorMensaje ?? 'No se pudo entregar.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo entregar el pedido.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pedido = widget.pedido;

    return Dialog.fullscreen(
      child: Column(
        children: [
          // Encabezado
          _Encabezado(
            clienteNombre: pedido.clienteNombre,
            total: pedido.total,
            itemCount: pedido.items.length,
          ),
          const Divider(height: 1),
          // Lista de items
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: pedido.items.length,
              separatorBuilder: (_, _) => const Divider(height: 1, indent: 56),
              itemBuilder: (_, i) {
                final item = pedido.items[i];
                final linea = _lineas[item.id]!;
                return _ItemEntregaTile(
                  key: Key('entrega_item_${item.id}'),
                  item: item,
                  linea: linea,
                  onToggleVisto: () =>
                      _editarLinea(item.id, (l) => l.copyWith(visto: !l.visto)),
                  onCantidadCambio: (cantidad) =>
                      _editarLinea(item.id, (l) => l.copyWith(cantidad: cantidad, visto: true)),
                  onNotaCambio: (nota) =>
                      _editarLinea(item.id, (l) => l.copyWith(nota: nota, visto: true)),
                );
              },
            ),
          ),
          const Divider(height: 1),
          // Pie con observación y botones
          _PieEntrega(
            observacionCtrl: _observacionCtrl,
            totalHabilitada: _totalHabilitada,
            parcialHabilitada: _parcialHabilitada,
            guardando: _guardando,
            onCancelar: () => Navigator.of(context).pop(false),
            onTotal: () => _cerrar(modo: 'total'),
            onParcial: () => _cerrar(modo: 'parcial'),
          ),
        ],
      ),
    );
  }
}

class _LineaEntrega {
  const _LineaEntrega({
    required this.visto,
    required this.cantidad,
    required this.nota,
  });

  final bool visto;
  final double cantidad;
  final String nota;

  _LineaEntrega copyWith({bool? visto, double? cantidad, String? nota}) =>
      _LineaEntrega(
        visto: visto ?? this.visto,
        cantidad: cantidad ?? this.cantidad,
        nota: nota ?? this.nota,
      );
}

class _Encabezado extends StatelessWidget {
  const _Encabezado({
    required this.clienteNombre,
    required this.total,
    required this.itemCount,
  });

  final String clienteNombre;
  final double total;
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Entregar', style: tema.textTheme.labelSmall),
            Text(
              clienteNombre,
              style: tema.textTheme.titleLarge?.copyWith(
                fontFamily: 'Fraunces',
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              '$itemCount ${itemCount == 1 ? 'ítem' : 'ítems'} · ${moneda(total)}',
              style: tema.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _ItemEntregaTile extends StatelessWidget {
  const _ItemEntregaTile({
    super.key,
    required this.item,
    required this.linea,
    required this.onToggleVisto,
    required this.onCantidadCambio,
    required this.onNotaCambio,
  });

  final PedidoItem item;
  final _LineaEntrega linea;
  final VoidCallback onToggleVisto;
  final ValueChanged<double> onCantidadCambio;
  final ValueChanged<String> onNotaCambio;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final cantCtrl = TextEditingController(text: _formatNum(linea.cantidad));

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        children: [
          Row(
            children: [
              // Checkbox visto
              SizedBox(
                width: 32,
                height: 32,
                child: Checkbox(
                  key: Key('entrega_check_${item.id}'),
                  value: linea.visto,
                  onChanged: (_) => onToggleVisto(),
                ),
              ),
              const SizedBox(width: 8),
              // Nombre y cantidad original
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.nombre,
                      style: tema.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      'Compró ${cantidadNum(item.cantidad)} ${item.unidadLabel}',
                      style: tema.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Campo cantidad editable
              SizedBox(
                width: 72,
                child: TextField(
                  key: Key('entrega_cantidad_${item.id}'),
                  controller: cantCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textAlign: TextAlign.center,
                  style: tema.textTheme.bodyMedium,
                  decoration: const InputDecoration(
                    isDense: true,
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                  ),
                  onChanged: (texto) {
                    final valor = double.tryParse(texto.replaceAll(',', '.'));
                    if (valor != null && valor >= 0) onCantidadCambio(valor);
                  },
                ),
              ),
            ],
          ),
          // Nota por producto
          Padding(
            padding: const EdgeInsets.only(left: 40, top: 4),
            child: TextField(
              key: Key('entrega_nota_${item.id}'),
              decoration: const InputDecoration(
                hintText: 'Nota de este producto',
                isDense: true,
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              ),
              style: tema.textTheme.bodySmall,
              onChanged: onNotaCambio,
            ),
          ),
        ],
      ),
    );
  }

  static String _formatNum(double n) {
    if (n == n.roundToDouble()) return n.toInt().toString();
    return n.toStringAsFixed(2);
  }
}

class _PieEntrega extends StatelessWidget {
  const _PieEntrega({
    required this.observacionCtrl,
    required this.totalHabilitada,
    required this.parcialHabilitada,
    required this.guardando,
    required this.onCancelar,
    required this.onTotal,
    required this.onParcial,
  });

  final TextEditingController observacionCtrl;
  final bool totalHabilitada;
  final bool parcialHabilitada;
  final bool guardando;
  final VoidCallback onCancelar;
  final VoidCallback onTotal;
  final VoidCallback onParcial;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              key: const Key('entrega_observacion'),
              controller: observacionCtrl,
              decoration: const InputDecoration(
                hintText: 'Observación, solo si es parcial',
                isDense: true,
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              ),
              style: tema.textTheme.bodyMedium,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    key: const Key('entrega_cancelar'),
                    onPressed: guardando ? null : onCancelar,
                    child: const Text('Cancelar'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.tonal(
                    key: const Key('entrega_parcial'),
                    onPressed: (!parcialHabilitada || guardando) ? null : onParcial,
                    child: const Text('Parcial'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    key: const Key('entrega_total'),
                    onPressed: (!totalHabilitada || guardando) ? null : onTotal,
                    child: const Text('Entrega total'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
