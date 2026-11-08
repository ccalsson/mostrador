import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/remito.dart';
import '../../services/remitos_service.dart';
import 'remito_alta_dialog.dart';
import 'remito_detalle_pane.dart';

/// A partir de este ancho el detalle queda al lado de la lista, como en la web.
const _quiebreFicha = 1024.0;

const _estadosFiltro = {
  'todos': 'Todos',
  'procesado': 'Borrador',
  'confirmado': 'Confirmado',
  'anulado': 'Anulado',
};

class RemitosPane extends ConsumerStatefulWidget {
  const RemitosPane({super.key});

  @override
  ConsumerState<RemitosPane> createState() => _RemitosPaneState();
}

class _RemitosPaneState extends ConsumerState<RemitosPane> {
  Remito? _seleccionado;
  String _filtroEstado = 'todos';

  List<Remito> _filtrar(List<Remito> lista) {
    if (_filtroEstado == 'todos') return lista;
    return lista.where((r) => r.estado == _filtroEstado).toList();
  }

  void _seleccionar(Remito remito, {required bool enRail}) {
    setState(() => _seleccionado = remito);
    if (!enRail) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => RemitoDetallePane(remitoId: remito.id),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final remitos = ref.watch(remitosProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final enRail = constraints.maxWidth >= _quiebreFicha;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Nota muted + acciones
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Sacale una foto al remito o cargá las líneas a mano. '
                    'El texto se lee en el celular y después confirmás el match.',
                    style: TextStyle(fontSize: 12.5, color: tokens.muted),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton.icon(
                  key: const Key('admin_remito_nuevo'),
                  onPressed: () => mostrarAltaRemito(context),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Nuevo remito'),
                ),
                const SizedBox(width: 8),
                IconButton(
                  key: const Key('admin_remitos_actualizar'),
                  icon: const Icon(Icons.refresh),
                  onPressed: () => ref.invalidate(remitosProvider),
                  tooltip: 'Actualizar',
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Filtro de estado
            SizedBox(
              height: 34,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final entry in _estadosFiltro.entries)
                    _FiltroChip(
                      etiqueta: entry.value,
                      seleccionado: _filtroEstado == entry.key,
                      onTap: () => setState(() => _filtroEstado = entry.key),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Cuerpo: lista + rail
            Expanded(
              child: remitos.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Error al cargar remitos.',
                        style: TextStyle(fontSize: 13, color: tokens.terra),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.tonal(
                        key: const Key('admin_remitos_reintentar'),
                        onPressed: () => ref.invalidate(remitosProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                ),
                data: (lista) {
                  final filtrados = _filtrar(lista);
                  final elegido = lista
                      .where((r) => r.id == _seleccionado?.id)
                      .firstOrNull;

                  final listado = _Listado(
                    remitos: filtrados,
                    seleccion: _seleccionado?.id,
                    onElegir: (r) => _seleccionar(r, enRail: enRail),
                  );

                  if (!enRail) return listado;

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: listado),
                      const SizedBox(width: 16),
                      SizedBox(
                        width: 340,
                        child: elegido == null
                            ? Text(
                                'Elegí un remito para ver el detalle.',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: tokens.muted,
                                ),
                              )
                            : _TarjetaFicha(
                                child: _DetalleRail(
                                  remito: elegido,
                                  onVerDetalle: () => Navigator.of(context)
                                      .push(MaterialPageRoute(
                                    builder: (_) =>
                                        RemitoDetallePane(remitoId: elegido.id),
                                  )),
                                ),
                              ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Filtro chip
// ---------------------------------------------------------------------------

class _FiltroChip extends StatelessWidget {
  const _FiltroChip({
    required this.etiqueta,
    required this.seleccionado,
    required this.onTap,
  });

  final String etiqueta;
  final bool seleccionado;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: FilterChip(
        label: Text(etiqueta),
        selected: seleccionado,
        onSelected: (_) => onTap(),
        showCheckmark: false,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
        selectedColor: tokens.okBg,
        backgroundColor: tokens.surface,
        side: BorderSide(color: seleccionado ? tokens.ok : tokens.line),
        labelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: seleccionado ? tokens.ok : tokens.inkSoft,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

class _Listado extends StatelessWidget {
  const _Listado({
    required this.remitos,
    required this.seleccion,
    required this.onElegir,
  });

  final List<Remito> remitos;
  final String? seleccion;
  final void Function(Remito) onElegir;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    if (remitos.isEmpty) {
      return Tarjeta(
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
          child: Text(
            'No hay remitos pendientes.',
            key: const Key('admin_remitos_vacia'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: tokens.muted),
          ),
        ),
      );
    }

    return Tarjeta(
      key: const Key('admin_remitos_lista'),
      padding: EdgeInsets.zero,
      child: ListView.separated(
        padding: EdgeInsets.zero,
        itemCount: remitos.length,
        separatorBuilder: (_, _) =>
            Divider(height: 1, thickness: 1, color: tokens.line),
        itemBuilder: (context, index) {
          final remito = remitos[index];
          return _FilaRemito(
            key: Key('admin_remito_${remito.id}'),
            remito: remito,
            seleccionado: seleccion == remito.id,
            onTap: () => onElegir(remito),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Fila con hover
// ---------------------------------------------------------------------------

class _FilaRemito extends StatefulWidget {
  const _FilaRemito({
    super.key,
    required this.remito,
    required this.seleccionado,
    required this.onTap,
  });

  final Remito remito;
  final bool seleccionado;
  final VoidCallback onTap;

  @override
  State<_FilaRemito> createState() => _FilaRemitoState();
}

class _FilaRemitoState extends State<_FilaRemito> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final remito = widget.remito;

    final fondo = widget.seleccionado
        ? tokens.okBg
        : (_encima ? tokens.paper : null);

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: InkWell(
        onTap: widget.onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          color: fondo,
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      remito.proveedor ?? 'Proveedor desconocido',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: tokens.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${fechaCorta(remito.createdAt)} · Fuente: ${remito.fuente}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: tokens.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _PildoraEstado(remito.estado),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right, size: 18, color: tokens.muted),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Píldora de estado
// ---------------------------------------------------------------------------

class _PildoraEstado extends StatelessWidget {
  const _PildoraEstado(this.estado);

  final String estado;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    switch (estado) {
      case 'confirmado':
        return Pildora('Confirmado', color: tokens.ok);
      case 'anulado':
        return Pildora('Anulado', color: tokens.alerta);
      case 'procesado':
      default:
        return Pildora('Borrador', color: tokens.ambar);
    }
  }
}

// ---------------------------------------------------------------------------
// Detalle en el rail
// ---------------------------------------------------------------------------

class _DetalleRail extends StatelessWidget {
  const _DetalleRail({required this.remito, required this.onVerDetalle});

  final Remito remito;
  final VoidCallback onVerDetalle;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final itemsConfirmados =
        remito.items.where((i) => i.confirmado).length;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Detalle',
                  style: const TextStyle(
                    fontFamily: 'Fraunces',
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              _PildoraEstado(remito.estado),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            remito.proveedor ?? 'Sin proveedor',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: tokens.ink),
          ),
          const SizedBox(height: 4),
          Text(
            'Creado: ${fechaCorta(remito.createdAt)}',
            style: TextStyle(fontSize: 12.5, color: tokens.muted),
          ),
          Text(
            'Fuente: ${remito.fuente}',
            style: TextStyle(fontSize: 12.5, color: tokens.muted),
          ),
          if (remito.items.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '${remito.items.length} línea(s) · $itemsConfirmados confirmada(s)',
              style: TextStyle(fontSize: 12.5, color: tokens.muted),
            ),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            key: const Key('admin_remito_ver_detalle'),
            onPressed: onVerDetalle,
            icon: const Icon(Icons.open_in_new, size: 16),
            label: const Text('Ver detalle completo'),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tarjeta con borde superior naranja (misma que clientes_pane)
// ---------------------------------------------------------------------------

class _TarjetaFicha extends StatelessWidget {
  const _TarjetaFicha({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 2, color: tokens.naranja),
          Flexible(child: child),
        ],
      ),
    );
  }
}
