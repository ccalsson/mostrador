import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/ids.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/egreso.dart';
import '../../services/egresos_service.dart';

/// A partir de este ancho la ficha queda al lado de la lista, como en la web.
/// En pantallas angostas se abre en un diálogo.
const _quiebreFicha = 1024.0;

const _etiquetasCategoria = {
  'alquiler': 'Alquiler',
  'combustible': 'Combustible',
  'servicios': 'Servicios',
  'proveedores': 'Proveedores',
  'mercaderia': 'Mercadería',
  'sueldos': 'Sueldos',
  'otros': 'Otros',
  // Categorías legacy (aún pueden existir en datos viejos)
  'gasto': 'Gasto',
  'retiro': 'Retiro personal',
  'pago_proveedor': 'Pago a proveedor',
  'otro': 'Otro',
};

const _etiquetasMedio = {
  'efectivo': 'Efectivo',
  'transferencia': 'Transferencia',
  'otro': 'Otro',
};

class EgresosPane extends ConsumerStatefulWidget {
  const EgresosPane({super.key});

  @override
  ConsumerState<EgresosPane> createState() => _EgresosPaneState();
}

class _EgresosPaneState extends ConsumerState<EgresosPane> {
  Egreso? _seleccionado;

  void _seleccionar(Egreso egreso, {required bool enRail}) {
    setState(() => _seleccionado = egreso);
    if (!enRail) _abrirFicha();
  }

  void _cerrarFicha() {
    setState(() => _seleccionado = null);
  }

  Future<void> _abrirFicha() async {
    await showDialog<void>(
      context: context,
      builder: (dialogo) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420, maxHeight: 640),
          child: _TarjetaFicha(
            child: _FichaDetalle(
              egreso: _seleccionado!,
              onAnular: () async {
                final ok = await _confirmarAnularEgreso(dialogo);
                if (ok && dialogo.mounted) Navigator.of(dialogo).pop();
              },
              onCerrar: () {
                if (dialogo.mounted) Navigator.of(dialogo).pop();
                _cerrarFicha();
              },
            ),
          ),
        ),
      ),
    );
  }

  /// Muestra el diálogo de confirmación y ejecuta la anulación.
  /// Devuelve `true` si se anuló correctamente.
  Future<bool> _confirmarAnularEgreso(BuildContext dialogo) async {
    final egreso = _seleccionado;
    if (egreso == null) return false;
    final confirmar = await showDialog<bool>(
      context: dialogo,
      builder: (ctx) => AlertDialog(
        title: const Text('Anular egreso'),
        content:
            Text('¿Anular "${egreso.concepto}" por ${moneda(egreso.monto)}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Anular'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return false;
    try {
      await ref.read(egresosServiceProvider).anular(egreso.id);
      ref.invalidate(egresosProvider);
      if (!mounted) return false;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Egreso anulado.')));
      _cerrarFicha();
      return true;
    } on ApiException catch (e) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
      return false;
    } catch (_) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
            const SnackBar(content: Text('No se pudo anular el egreso.')));
      return false;
    }
  }

  /// Anular desde la fila de la lista (fuera del rail/diálogo de ficha).
  Future<void> _anularDesdeLista(Egreso egreso) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Anular egreso'),
        content:
            Text('¿Anular "${egreso.concepto}" por ${moneda(egreso.monto)}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Anular'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;
    try {
      await ref.read(egresosServiceProvider).anular(egreso.id);
      ref.invalidate(egresosProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Egreso anulado.')));
      if (_seleccionado?.id == egreso.id) _cerrarFicha();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
            const SnackBar(content: Text('No se pudo anular el egreso.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final egresos = ref.watch(egresosProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final enRail = constraints.maxWidth >= _quiebreFicha;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Egresos de caja',
                      style: TextStyle(fontSize: 12.5, color: tokens.muted),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    key: const Key('egreso_nuevo'),
                    onPressed: () => mostrarDialogoNuevoEgreso(context),
                    icon: const Icon(Icons.remove_circle_outline, size: 18),
                    label: const Text('Nuevo egreso'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: egresos.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        error is ApiException
                            ? error.message
                            : 'No se pudieron cargar los egresos.',
                        style: TextStyle(fontSize: 13, color: tokens.terra),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.tonal(
                        onPressed: () => ref.invalidate(egresosProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                ),
                data: (lista) {
                  final elegido =
                      lista.where((e) => e.id == _seleccionado?.id).firstOrNull;
                  final listado = _Listado(
                    lista: lista,
                    seleccionado: _seleccionado?.id,
                    onTap: (e) => _seleccionar(e, enRail: enRail),
                    onAnular: _anularDesdeLista,
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
                            ? Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  'Elegí un egreso para ver su detalle.',
                                  style: TextStyle(
                                      fontSize: 12.5, color: tokens.muted),
                                ),
                              )
                            : _TarjetaFicha(
                                child: _FichaDetalle(
                                  egreso: elegido,
                                  onAnular: () async {
                                    final ok =
                                        await _confirmarAnularEgreso(context);
                                    if (ok && mounted) _cerrarFicha();
                                  },
                                  onCerrar: _cerrarFicha,
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
// Listado
// ---------------------------------------------------------------------------

class _Listado extends StatelessWidget {
  const _Listado({
    required this.lista,
    required this.seleccionado,
    required this.onTap,
    required this.onAnular,
  });

  final List<Egreso> lista;
  final String? seleccionado;
  final ValueChanged<Egreso> onTap;
  final ValueChanged<Egreso> onAnular;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    if (lista.isEmpty) {
      return Tarjeta(
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
          child: Text(
            'No hay egresos en este turno de caja.',
            key: const Key('egresos_vacia'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: tokens.muted),
          ),
        ),
      );
    }
    return Tarjeta(
      padding: EdgeInsets.zero,
      child: ListView.separated(
        key: const Key('egresos_lista'),
        padding: EdgeInsets.zero,
        itemCount: lista.length,
        separatorBuilder: (_, _) =>
            Divider(height: 1, thickness: 1, color: tokens.line),
        itemBuilder: (context, index) {
          final egreso = lista[index];
          return _FilaEgreso(
            key: Key('egreso_${egreso.id}'),
            egreso: egreso,
            seleccionado: seleccionado == egreso.id,
            onTap: () => onTap(egreso),
            onAnular: () => onAnular(egreso),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Fila con hover
// ---------------------------------------------------------------------------

class _FilaEgreso extends StatefulWidget {
  const _FilaEgreso({
    super.key,
    required this.egreso,
    required this.seleccionado,
    required this.onTap,
    required this.onAnular,
  });

  final Egreso egreso;
  final bool seleccionado;
  final VoidCallback onTap;
  final VoidCallback onAnular;

  @override
  State<_FilaEgreso> createState() => _FilaEgresoState();
}

class _FilaEgresoState extends State<_FilaEgreso> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final egreso = widget.egreso;
    final fondo =
        widget.seleccionado ? tokens.okBg : (_encima ? tokens.paper : null);
    final categoria =
        _etiquetasCategoria[egreso.categoria] ?? egreso.categoria;
    final medio =
        _etiquetasMedio[egreso.medio] ?? egreso.medio;

    final contenido = Container(
      constraints: const BoxConstraints(minHeight: 40),
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
                  egreso.concepto,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 2),
                Text(
                  '${egreso.usuarioNombre} · $medio · $categoria · ${_fechaCorta(egreso.creadoAt)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: tokens.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Pildora(categoria, color: tokens.muted),
          const SizedBox(width: 8),
          Text(
            moneda(egreso.monto),
            style: TablaWeb.numeros.copyWith(
              fontWeight: FontWeight.w600,
              color: tokens.terra,
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            key: Key('egreso_anular_${egreso.id}'),
            tooltip: 'Anular',
            icon: const Icon(Icons.delete_outline),
            iconSize: 16,
            color: tokens.terra,
            visualDensity: VisualDensity.compact,
            style: IconButton.styleFrom(
              minimumSize: const Size(30, 30),
              padding: EdgeInsets.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            onPressed: widget.onAnular,
          ),
        ],
      ),
    );

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: InkWell(onTap: widget.onTap, child: contenido),
    );
  }

  String _fechaCorta(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

// ---------------------------------------------------------------------------
// Tarjeta ficha (borde superior naranja)
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

// ---------------------------------------------------------------------------
// Ficha de detalle del egreso (rail o diálogo)
// ---------------------------------------------------------------------------

class _FichaDetalle extends StatelessWidget {
  const _FichaDetalle({
    required this.egreso,
    required this.onAnular,
    required this.onCerrar,
  });

  final Egreso egreso;
  final VoidCallback onAnular;
  final VoidCallback onCerrar;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final categoria =
        _etiquetasCategoria[egreso.categoria] ?? egreso.categoria;
    final medio =
        _etiquetasMedio[egreso.medio] ?? egreso.medio;

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
                  'Egreso',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Fraunces',
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: onCerrar,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: tokens.muted,
                  textStyle: const TextStyle(fontSize: 12),
                ),
                child: const Text('Cerrar'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            egreso.concepto,
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          _campoFicha('Monto', moneda(egreso.monto),
              color: tokens.terra, negrita: true),
          _campoFicha('Categoría', categoria),
          _campoFicha('Medio', medio),
          _campoFicha('Usuario', egreso.usuarioNombre),
          _campoFicha('Fecha', _fechaLarga(egreso.creadoAt)),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: onAnular,
            style: ButtonStyle(
              minimumSize:
                  WidgetStateProperty.all(const Size.fromHeight(38)),
              backgroundColor: WidgetStateProperty.all(tokens.terra),
            ),
            child: const Text('Anular egreso'),
          ),
        ],
      ),
    );
  }

  Widget _campoFicha(String etiqueta, String valor,
      {Color? color, bool negrita = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              etiqueta,
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ),
          Expanded(
            child: Text(
              valor,
              style: TextStyle(
                fontSize: 13,
                fontWeight: negrita ? FontWeight.w600 : FontWeight.w400,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _fechaLarga(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

// ---------------------------------------------------------------------------
// Diálogo nuevo egreso
// ---------------------------------------------------------------------------

/// El alta se dispara desde el propio diálogo: si la respuesta no llega, el
/// error queda a la vista y el reintento reenvía el mismo `clientUuid`, así el
/// backend descarta el duplicado en vez de volver a sacar plata de la caja.
Future<void> mostrarDialogoNuevoEgreso(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (_) => const _NuevoEgresoDialog(),
  );
}

class _NuevoEgresoDialog extends ConsumerStatefulWidget {
  const _NuevoEgresoDialog();

  @override
  ConsumerState<_NuevoEgresoDialog> createState() => _NuevoEgresoDialogState();
}

class _NuevoEgresoDialogState extends ConsumerState<_NuevoEgresoDialog> {
  final _conceptoCtrl = TextEditingController();
  final _montoCtrl = TextEditingController();
  String _categoria = 'alquiler';
  String _medio = 'efectivo';
  late final String _clientUuid = generarUuidV4();
  var _enviando = false;
  var _error = '';

  @override
  void dispose() {
    _conceptoCtrl.dispose();
    _montoCtrl.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    final concepto = _conceptoCtrl.text.trim();
    if (concepto.isEmpty) {
      setState(() => _error = 'Ingresá el concepto.');
      return;
    }
    final monto = double.tryParse(_montoCtrl.text.trim());
    if (monto == null || monto <= 0) {
      setState(() => _error = 'Monto inválido.');
      return;
    }
    setState(() {
      _enviando = true;
      _error = '';
    });
    // El SnackBar vive en el Scaffold raíz: se muestra después de cerrar, así
    // su rebuild no toca el diálogo que todavía está saliendo.
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(egresosServiceProvider).crear(
            monto: monto,
            concepto: concepto,
            categoria: _categoria,
            medio: _medio,
            clientUuid: _clientUuid,
          );
      if (!mounted) return;
      ref.invalidate(egresosProvider);
      Navigator.of(context).pop();
      messenger
        ..removeCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Egreso registrado.')));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _error = 'No se pudo registrar el egreso.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Nuevo egreso'),
        content: SizedBox(
          width: 360,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                key: const Key('egreso_concepto'),
                controller: _conceptoCtrl,
                decoration: const InputDecoration(
                  labelText: 'Concepto',
                  hintText: 'Ej: Pago a proveedor',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                maxLength: 200,
              ),
              TextField(
                key: const Key('egreso_monto'),
                controller: _montoCtrl,
                decoration: const InputDecoration(
                  labelText: 'Monto',
                  prefixText: '\$ ',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _categoria,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Categoría',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'alquiler', child: Text('Alquiler')),
                  DropdownMenuItem(
                      value: 'combustible', child: Text('Combustible')),
                  DropdownMenuItem(value: 'servicios', child: Text('Servicios')),
                  DropdownMenuItem(
                      value: 'proveedores', child: Text('Proveedores')),
                  DropdownMenuItem(
                      value: 'mercaderia', child: Text('Mercadería')),
                  DropdownMenuItem(value: 'sueldos', child: Text('Sueldos')),
                  DropdownMenuItem(value: 'otros', child: Text('Otros')),
                ],
                onChanged: (v) => setState(() => _categoria = v ?? 'alquiler'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _medio,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Medio',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                      value: 'efectivo', child: Text('Efectivo')),
                  DropdownMenuItem(
                      value: 'transferencia', child: Text('Transferencia')),
                  DropdownMenuItem(value: 'otro', child: Text('Otro')),
                ],
                onChanged: (v) => setState(() => _medio = v ?? 'efectivo'),
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  _error,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: _enviando ? null : () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('egreso_guardar'),
            onPressed: _enviando ? null : _registrar,
            style: ButtonStyle(
              minimumSize:
                  WidgetStateProperty.all(const Size.fromHeight(38)),
            ),
            child: const Text('Registrar'),
          ),
        ],
      );
}
