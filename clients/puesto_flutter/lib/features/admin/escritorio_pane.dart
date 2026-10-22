import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/escritorio.dart';
import '../../services/escritorio_service.dart';
import 'mensajes_tab.dart';

class EscritorioPane extends ConsumerWidget {
  const EscritorioPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final escritorio = ref.watch(escritorioProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Escritorio del dueño',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton(
                key: const Key('escritorio_refresh'),
                tooltip: 'Actualizar',
                onPressed: () => ref.invalidate(escritorioProvider),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        Expanded(
          child: escritorio.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error is ApiException
                      ? error.message
                      : 'No se pudo cargar el escritorio.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(escritorioProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (data) => _EscritorioBody(data: data),
          ),
        ),
      ],
    );
  }
}

class _EscritorioBody extends StatelessWidget {
  const _EscritorioBody({required this.data});

  final EscritorioDueno data;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 5,
      child: Column(
        children: [
          TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: const [
              Tab(text: 'Mensajes'),
              Tab(text: 'Margen'),
              Tab(text: 'Deudas'),
              Tab(text: 'Cierres'),
              Tab(text: 'Lista publicada'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                const MensajesTab(),
                _MargenTab(margen: data.margen),
                _DeudasTab(deudas: data.deudas),
                _CierresTab(cierres: data.cierres),
                _ListaTab(lista: data.lista),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MargenTab extends StatelessWidget {
  const _MargenTab({required this.margen});

  final Margen margen;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            final columnas = constraints.maxWidth >= 600 ? 3 : 1;
            return GridView.count(
              crossAxisCount: columnas,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 2.5,
              children: [
                _Tarjeta('Cobrado (7d)', moneda(margen.cobrado), Colors.green),
                _Tarjeta('Costo (7d)', moneda(margen.costo), Colors.orange),
                _Tarjeta(
                  'Diferencia',
                  moneda(margen.diferencia),
                  margen.diferencia >= 0 ? Colors.green : Colors.red,
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Últimos remitos confirmados',
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                for (final entrada in margen.entradas)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(entrada.proveedor),
                    subtitle: Text(
                      '${entrada.lineas} líneas · ${_fechaCorta(entrada.cuando)}',
                    ),
                    trailing: Text(
                      moneda(entrada.costo),
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: colorScheme.primary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (margen.sinPrecio > 0) ...[
          const SizedBox(height: 12),
          Card(
            color: colorScheme.errorContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_outlined, color: colorScheme.onErrorContainer),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      '${margen.sinPrecio} ítems de remito sin precio asignado',
                      style: TextStyle(color: colorScheme.onErrorContainer),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  String _fechaCorta(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

class _DeudasTab extends StatelessWidget {
  const _DeudasTab({required this.deudas});

  final List<Deuda> deudas;

  @override
  Widget build(BuildContext context) {
    if (deudas.isEmpty) {
      return const Center(child: Text('No hay deudas pendientes'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: deudas.length,
      itemBuilder: (context, index) {
        final deuda = deudas[index];
        return Card(
          child: ListTile(
            title: Text(deuda.nombre),
            trailing: Text(
              moneda(deuda.saldo),
              style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.red),
            ),
          ),
        );
      },
    );
  }
}

class _CierresTab extends StatelessWidget {
  const _CierresTab({required this.cierres});

  final List<Cierre> cierres;

  @override
  Widget build(BuildContext context) {
    if (cierres.isEmpty) {
      return const Center(child: Text('No hay cierres registrados'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: cierres.length,
      itemBuilder: (context, index) {
        final cierre = cierres[index];
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        cierre.quien,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                    Text(
                      _fechaCorta(cierre.cerradoAt),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: _Valor('Esperado', moneda(cierre.esperado))),
                    Expanded(child: _Valor('Real', moneda(cierre.real))),
                    Expanded(
                      child: _Valor(
                        'Diferencia',
                        moneda(cierre.diferencia),
                        color: cierre.diferencia.abs() < 0.01 ? Colors.green : Colors.red,
                      ),
                    ),
                  ],
                ),
                if (cierre.notas.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(cierre.notas,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  String _fechaCorta(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

class _ListaTab extends StatelessWidget {
  const _ListaTab({required this.lista});

  final Lista lista;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Text('${lista.productos.length} productos publicados'),
              ),
              Text('${lista.ocultos} ocultos',
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: lista.productos.length,
            itemBuilder: (context, index) {
              final prod = lista.productos[index];
              return ListTile(
                dense: true,
                title: Text(prod.nombre),
                subtitle: Text(
                  'Stock: ${_num(prod.stock)} ${prod.unidad}',
                ),
                trailing: Text(
                  moneda(prod.precio),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  String _num(double v) => v == v.toInt() ? '${v.toInt()}' : v.toStringAsFixed(2);
}

class _Tarjeta extends StatelessWidget {
  const _Tarjeta(this.titulo, this.valor, this.color);

  final String titulo;
  final String valor;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titulo, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            Text(
              valor,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Valor extends StatelessWidget {
  const _Valor(this.label, this.value, {this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
      ],
    );
  }
}
