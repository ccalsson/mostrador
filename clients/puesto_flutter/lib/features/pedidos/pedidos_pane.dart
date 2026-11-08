import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'cola_pedidos.dart';

/// Tablero de cola del puesto para el vendedor y el dueño: los nombres de los
/// pedidos aparecen en "En cola" apenas se confirman, pasan a "Para entregar"
/// cuando caja los cobra y a "Entregados" al confirmar la entrega. Se sondea
/// solo; tocar una fila abre el detalle, donde se editan los ítems.
class PedidosPane extends ConsumerWidget {
  const PedidosPane({super.key, this.intervalo = kSondeoCola});

  /// `null` congela el sondeo, como en los widget tests.
  final Duration? intervalo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ColaPedidos(
      contexto: ColaContexto.puesto,
      titulo: 'Cola del puesto',
      puedeFiltrarPropios: true,
      intervalo: intervalo,
      onSeleccionar: (pedido) => context.push('/vendedor/pedido/${pedido.id}'),
    );
  }
}

