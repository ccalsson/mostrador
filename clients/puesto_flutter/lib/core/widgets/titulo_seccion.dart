import 'package:flutter/material.dart';

import '../tema.dart';

/// Título de sección con filete terracota, del contrato visual.
class TituloSeccion extends StatelessWidget {
  const TituloSeccion(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 4,
          height: 20,
          decoration: BoxDecoration(
            color: tokens.terra,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            texto,
            style: Theme.of(context).textTheme.headlineSmall,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
