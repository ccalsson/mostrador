import 'package:flutter/material.dart';

import '../tema.dart';

/// Tarjeta con borde y fondo liso, equivalente al bloque
/// `rounded-lg border border-line bg-surface` de la web.
class Tarjeta extends StatelessWidget {
  const Tarjeta({
    super.key,
    required this.child,
    this.titulo,
    this.subtitulo,
    this.accion,
    this.padding = const EdgeInsets.fromLTRB(12, 12, 12, 14),
  });

  final Widget child;
  final String? titulo;
  final String? subtitulo;
  final Widget? accion;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final encabezado = titulo == null
        ? null
        : Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titulo!,
                        style: const TextStyle(
                          fontFamily: 'Fraunces',
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (subtitulo != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            subtitulo!,
                            style: TextStyle(
                              fontSize: 12,
                              color: tokens.muted,
                              height: 1.3,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                ?accion,
              ],
            ),
          );

    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        border: Border.all(color: tokens.line),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ?encabezado,
          Flexible(child: child),
        ],
      ),
    );
  }
}

/// Columna de una [TablaWeb]: título y ancho (fijo o flexible).
class ColumnaTabla {
  const ColumnaTabla(
    this.titulo, {
    this.ancho,
    this.flex = 1,
    this.alineacion = TextAlign.start,
  });

  final String titulo;

  /// Ancho fijo en píxeles lógicos. Si es nulo la columna ocupa [flex].
  final double? ancho;
  final int flex;
  final TextAlign alineacion;
}

/// Fila de una [TablaWeb].
class FilaTabla {
  const FilaTabla({
    this.key,
    required this.celdas,
    this.seleccionada = false,
    this.onTap,
  });

  final Key? key;
  final List<Widget> celdas;
  final bool seleccionada;
  final VoidCallback? onTap;
}

/// Tabla compacta con cabecera y divisores, como las listas de la web.
class TablaWeb extends StatelessWidget {
  const TablaWeb({
    super.key,
    required this.columnas,
    required this.filas,
    this.mensajeVacio,
    this.desplazable = true,
  });

  final List<ColumnaTabla> columnas;
  final List<FilaTabla> filas;
  final String? mensajeVacio;

  /// Cuando es falso la tabla no scrollea y debe entrar en su padre.
  final bool desplazable;

  static const TextStyle numeros = TextStyle(
    fontSize: 13,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  Alignment _alineacion(TextAlign align) => switch (align) {
        TextAlign.end || TextAlign.right => Alignment.centerRight,
        TextAlign.center => Alignment.center,
        _ => Alignment.centerLeft,
      };

  Widget _celda(ColumnaTabla columna, Widget child) {
    final contenido = Align(alignment: _alineacion(columna.alineacion), child: child);
    return columna.ancho != null
        ? SizedBox(width: columna.ancho, child: contenido)
        : Expanded(flex: columna.flex, child: contenido);
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    final cabecera = Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: tokens.paper2,
        border: Border(bottom: BorderSide(color: tokens.line)),
      ),
      child: Row(
        children: [
          for (final columna in columnas)
            _celda(
              columna,
              Text(
                columna.titulo,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: tokens.muted,
                ),
              ),
            ),
        ],
      ),
    );

    if (filas.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          cabecera,
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
            child: Text(
              mensajeVacio ?? 'Sin datos.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: tokens.muted),
            ),
          ),
        ],
      );
    }

    Widget fila(int index) {
      final datos = filas[index];
      return _FilaHover(
        key: datos.key,
        fila: datos,
        columnas: columnas,
        celda: _celda,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        cabecera,
        Expanded(
          child: desplazable
              ? ListView.separated(
                  padding: EdgeInsets.zero,
                  itemCount: filas.length,
                  separatorBuilder: (_, _) => Divider(
                    height: 1,
                    thickness: 1,
                    color: tokens.line,
                  ),
                  itemBuilder: (context, index) => fila(index),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var index = 0; index < filas.length; index++) ...[
                      if (index > 0)
                        Divider(height: 1, thickness: 1, color: tokens.line),
                      fila(index),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _FilaHover extends StatefulWidget {
  const _FilaHover({
    super.key,
    required this.fila,
    required this.columnas,
    required this.celda,
  });

  final FilaTabla fila;
  final List<ColumnaTabla> columnas;
  final Widget Function(ColumnaTabla, Widget) celda;

  @override
  State<_FilaHover> createState() => _FilaHoverState();
}

class _FilaHoverState extends State<_FilaHover> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final fondo = widget.fila.seleccionada
        ? tokens.okBg
        : (_encima ? tokens.paper : null);

    final contenido = Container(
      constraints: const BoxConstraints(minHeight: 40),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: fondo,
      child: Row(
        children: [
          for (var i = 0; i < widget.columnas.length; i++)
            widget.celda(
              widget.columnas[i],
              i < widget.fila.celdas.length
                  ? widget.fila.celdas[i]
                  : const SizedBox.shrink(),
            ),
        ],
      ),
    );

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: widget.fila.onTap == null
          ? contenido
          : InkWell(onTap: widget.fila.onTap, child: contenido),
    );
  }
}

/// Etiqueta pequeña de estado, equivalente al `Badge` de la web.
class Pildora extends StatelessWidget {
  const Pildora(this.texto, {super.key, required this.color, this.fondo});

  final String texto;
  final Color color;
  final Color? fondo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: fondo ?? color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        texto,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
          height: 1.2,
        ),
      ),
    );
  }
}
