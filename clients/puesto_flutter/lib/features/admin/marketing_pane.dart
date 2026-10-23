import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/creativo.dart';
import '../../services/creativos_service.dart';

/// Panel de Marketing / Creativos. Replica la sección "Creativos" de la web
/// (`src/routes/marketing.tsx`): grilla de pedidos, generación IA con selector
/// de tipo y brief, preview de variantes, envío y borrado.
class MarketingPane extends ConsumerStatefulWidget {
  const MarketingPane({super.key});

  @override
  ConsumerState<MarketingPane> createState() => _MarketingPaneState();
}

class _MarketingPaneState extends ConsumerState<MarketingPane> {
  TipoCreativo? _filtroTipo;
  EstadoCreativo? _filtroEstado;

  List<Creativo> _aplicarFiltros(List<Creativo> pedidos) {
    var resultado = pedidos;
    if (_filtroTipo != null) {
      resultado = resultado.where((p) => p.tipo == _filtroTipo).toList();
    }
    if (_filtroEstado != null) {
      resultado = resultado.where((p) => p.estado == _filtroEstado).toList();
    }
    return resultado;
  }

  Future<void> _generar() async {
    final resultado = await showDialog<ResultadoGeneracion>(
      context: context,
      builder: (_) => const _DialogoGenerar(),
    );
    if (resultado != null && mounted) {
      ref.invalidate(creativosEstadoProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Pieza generada: ${resultado.variantes.length} variantes, '
            '${resultado.creditos} créditos.',
          ),
        ),
      );
    }
  }

  Future<void> _enviar(Creativo pedido) async {
    final mensajero = ScaffoldMessenger.of(context);
    try {
      await ref.read(creativosServiceProvider).enviar(pedido.id);
      if (!mounted) return;
      mensajero.showSnackBar(
        const SnackBar(content: Text('Creativo enviado.')),
      );
      ref.invalidate(creativosEstadoProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _borrar(Creativo pedido) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Borrar creativo'),
        content: Text(
          'Se borra el pedido "${pedido.brief}". '
          'Esto gasta ${pedido.creditos} crédito(s) de IA. ¿Continuar?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Borrar'),
          ),
        ],
      ),
    );
    if (confirmado != true) return;
    if (!mounted) return;
    final mensajero = ScaffoldMessenger.of(context);
    try {
      await ref.read(creativosServiceProvider).borrar(pedido.id);
      if (!mounted) return;
      mensajero.showSnackBar(
        const SnackBar(content: Text('Creativo borrado.')),
      );
      ref.invalidate(creativosEstadoProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final estadoAsync = ref.watch(creativosEstadoProvider);
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Marketing',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => ref.invalidate(creativosEstadoProvider),
                tooltip: 'Actualizar',
              ),
            ],
          ),
        ),
        Expanded(
          child: estadoAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Error al cargar los creativos.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(creativosEstadoProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (estado) => _Contenido(
              estado: estado,
              pedidos: _aplicarFiltros(estado.pedidos),
              filtroTipo: _filtroTipo,
              filtroEstado: _filtroEstado,
              onFiltroTipo: (v) => setState(() => _filtroTipo = v),
              onFiltroEstado: (v) => setState(() => _filtroEstado = v),
              onGenerar: _generar,
              onEnviar: _enviar,
              onBorrar: _borrar,
            ),
          ),
        ),
      ],
    );
  }
}

class _Contenido extends StatelessWidget {
  const _Contenido({
    required this.estado,
    required this.pedidos,
    required this.filtroTipo,
    required this.filtroEstado,
    required this.onFiltroTipo,
    required this.onFiltroEstado,
    required this.onGenerar,
    required this.onEnviar,
    required this.onBorrar,
  });

  final EstadoCreativos estado;
  final List<Creativo> pedidos;
  final TipoCreativo? filtroTipo;
  final EstadoCreativo? filtroEstado;
  final ValueChanged<TipoCreativo?> onFiltroTipo;
  final ValueChanged<EstadoCreativo?> onFiltroEstado;
  final VoidCallback onGenerar;
  final ValueChanged<Creativo> onEnviar;
  final ValueChanged<Creativo> onBorrar;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final puedeGenerar = estado.creditos >= estado.costo;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        // Saldo y botón generar
        Card(
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Créditos',
                        style: theme.textTheme.labelMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${estado.creditos}',
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Cada foto cuesta ${estado.costo} créditos '
                        'y trae ${estado.textos} textos.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                FilledButton.icon(
                  key: const Key('marketing_generar'),
                  onPressed: puedeGenerar ? onGenerar : null,
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(puedeGenerar ? 'Nuevo creativo' : 'Sin créditos'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Paquetes
        if (estado.paquetes.isNotEmpty) ...[
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: estado.paquetes.map((pack) {
              return ActionChip(
                label: Text('${pack.creditos} · USD ${pack.usd.toStringAsFixed(2)}'),
                onPressed: () {
                  // La compra de créditos se hace desde la web (Torre).
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
        ],

        // Filtros
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<TipoCreativo?>(
                initialValue: filtroTipo,
                decoration: const InputDecoration(
                  labelText: 'Tipo',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Todos')),
                  ...TipoCreativo.values.map(
                    (t) => DropdownMenuItem(value: t, child: Text(t.nombre)),
                  ),
                ],
                onChanged: onFiltroTipo,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonFormField<EstadoCreativo?>(
                initialValue: filtroEstado,
                decoration: const InputDecoration(
                  labelText: 'Estado',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Todos')),
                  ...EstadoCreativo.values.map(
                    (e) => DropdownMenuItem(value: e, child: Text(e.nombre)),
                  ),
                ],
                onChanged: onFiltroEstado,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Grilla de pedidos
        if (pedidos.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'No hay creativos${filtroTipo != null || filtroEstado != null ? " con esos filtros" : ""}.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.outline,
                ),
              ),
            ),
          )
        else
          ...pedidos.map(
            (pedido) => _TarjetaCreativo(
              pedido: pedido,
              onEnviar: () => onEnviar(pedido),
              onBorrar: () => onBorrar(pedido),
            ),
          ),
      ],
    );
  }
}

class _TarjetaCreativo extends StatelessWidget {
  const _TarjetaCreativo({
    required this.pedido,
    required this.onEnviar,
    required this.onBorrar,
  });

  final Creativo pedido;
  final VoidCallback onEnviar;
  final VoidCallback onBorrar;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final variante = pedido.variantes.isNotEmpty ? pedido.variantes.first : null;

    return Card(
      key: Key('creativo_${pedido.id}'),
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Cabecera: tipo, estado, fecha
            Row(
              children: [
                Chip(
                  label: Text(pedido.tipo.nombre),
                  visualDensity: VisualDensity.compact,
                ),
                const SizedBox(width: 8),
                Chip(
                  label: Text(pedido.estado.nombre),
                  visualDensity: VisualDensity.compact,
                  backgroundColor: pedido.estado == EstadoCreativo.enviado
                      ? theme.colorScheme.primaryContainer
                      : null,
                ),
                const Spacer(),
                Text(
                  _fechaLegible(pedido.createdAt),
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Brief
            Text(
              pedido.brief,
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 4),
            Text(
              '${pedido.variantes.length} texto(s) · ${pedido.creditos} crédito(s)',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),

            // Preview de la primera variante
            if (variante != null) ...[
              const SizedBox(height: 12),
              _PreviewVariante(variante: variante),
            ],

            // Acciones
            const SizedBox(height: 12),
            Row(
              children: [
                if (pedido.estado == EstadoCreativo.borrador ||
                    pedido.estado == EstadoCreativo.listo)
                  FilledButton.tonal(
                    key: Key('creativo_enviar_${pedido.id}'),
                    onPressed: onEnviar,
                    child: const Text('Enviar'),
                  ),
                const SizedBox(width: 8),
                TextButton(
                  key: Key('creativo_borrar_${pedido.id}'),
                  onPressed: onBorrar,
                  child: const Text('Borrar'),
                ),
                const Spacer(),
                if (pedido.variantes.length > 1)
                  TextButton(
                    onPressed: () => _verTodasVariantes(context, pedido),
                    child: Text('Ver ${pedido.variantes.length} variantes'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _verTodasVariantes(BuildContext context, Creativo pedido) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Variantes'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView(
            shrinkWrap: true,
            children: pedido.variantes.map((v) {
              return _PreviewVariante(variante: v);
            }).toList(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }
}

class _PreviewVariante extends StatelessWidget {
  const _PreviewVariante({required this.variante});

  final VarianteCreativo variante;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final esDataUri = variante.imagen.startsWith('data:');
    final ImageProvider? imageProvider = esDataUri
        ? MemoryImage(base64Decode(
            variante.imagen.split(',').last,
          ))
        : (variante.imagen.isNotEmpty ? NetworkImage(variante.imagen) : null);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (imageProvider != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image(
                image: imageProvider,
                width: 80,
                height: 80,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  width: 80,
                  height: 80,
                  color: theme.colorScheme.surfaceContainerHighest,
                  child: const Icon(Icons.broken_image),
                ),
              ),
            )
          else
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.image),
            ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  variante.titulo,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  variante.texto,
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Diálogo para generar un nuevo creativo: selector de tipo, campo brief
/// (max 400 chars), y upload de foto opcional.
class _DialogoGenerar extends ConsumerStatefulWidget {
  const _DialogoGenerar();

  @override
  ConsumerState<_DialogoGenerar> createState() => _DialogoGenerarState();
}

class _DialogoGenerarState extends ConsumerState<_DialogoGenerar> {
  final _formKey = GlobalKey<FormState>();
  final _briefCtrl = TextEditingController();
  TipoCreativo _tipo = TipoCreativo.banner;
  String? _fotoUrl;
  bool _generando = false;

  @override
  void dispose() {
    _briefCtrl.dispose();
    super.dispose();
  }

  Future<void> _generar() async {
    if (!_formKey.currentState!.validate()) return;
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _generando = true);
    try {
      final resultado = await ref.read(creativosServiceProvider).generar(
            tipo: _tipo,
            brief: _briefCtrl.text.trim(),
            fotoUrl: _fotoUrl,
          );
      if (!mounted) return;
      Navigator.of(context).pop(resultado);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _generando = false);
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final estadoAsync = ref.watch(creativosEstadoProvider);
    final estado = estadoAsync.value;
    final puedeGenerar = estado != null && estado.creditos >= estado.costo;

    return AlertDialog(
      title: const Text('Nuevo creativo'),
      content: SizedBox(
        width: 400,
        child: Form(
          key: _formKey,
          child: ListView(
            shrinkWrap: true,
            children: [
              // Selector de tipo
              DropdownButtonFormField<TipoCreativo>(
                initialValue: _tipo,
                decoration: const InputDecoration(
                  labelText: 'Tipo de pieza',
                  border: OutlineInputBorder(),
                ),
                items: TipoCreativo.values
                    .map((t) => DropdownMenuItem(
                          value: t,
                          child: Text(t.nombre),
                        ))
                    .toList(),
                onChanged: _generando
                    ? null
                    : (v) {
                        if (v != null) setState(() => _tipo = v);
                      },
              ),
              const SizedBox(height: 16),

              // Brief
              TextFormField(
                key: const Key('generar_brief'),
                controller: _briefCtrl,
                maxLength: 400,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Qué tiene que decir',
                  hintText: 'Tomate perita, cajón de hoy, precio de puesto.',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  final texto = v?.trim() ?? '';
                  if (texto.length < 8) {
                    return 'Contá un poco más, aunque sea una frase.';
                  }
                  return null;
                },
                enabled: !_generando,
              ),
              const SizedBox(height: 16),

              // Foto opcional
              TextFormField(
                key: const Key('generar_foto'),
                decoration: const InputDecoration(
                  labelText: 'URL de foto (opcional)',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => _fotoUrl = v.trim().isEmpty ? null : v.trim(),
                enabled: !_generando,
              ),
              const SizedBox(height: 16),

              // Info de créditos
              if (estado != null)
                Text(
                  puedeGenerar
                      ? 'Tenés ${estado.creditos} créditos. Alcanzan para '
                        '${estado.creditos ~/ estado.costo} foto(s).'
                      : 'No alcanzán los créditos. Necesitás ${estado.costo}.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _generando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('generar_confirmar'),
          onPressed: _generando || !puedeGenerar ? null : _generar,
          child: Text(_generando ? 'Generando…' : 'Generar'),
        ),
      ],
    );
  }
}

String _fechaLegible(String iso) {
  if (iso.isEmpty) return '';
  final legible = iso.replaceFirst('T', ' ');
  return legible.length >= 16 ? legible.substring(0, 16) : legible;
}
