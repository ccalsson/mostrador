import 'package:flutter/material.dart';

import '../market_api.dart';
import '../models.dart';
import '../widgets/common.dart';

/// Ranking de cargadores (`GET ranking`). El servidor ordena, puntúa y
/// anonimiza los nombres: acá sólo se numera y se muestra.
class RankingScreen extends StatefulWidget {
  const RankingScreen({required this.api, super.key});

  final MercadoApi api;

  @override
  State<RankingScreen> createState() => _RankingScreenState();
}

class _RankingScreenState extends State<RankingScreen> {
  late Future<List<RankingCargador>> _ranking;

  @override
  void initState() {
    super.initState();
    _ranking = widget.api.listarRankingCargadores();
  }

  Future<void> _refresh() async {
    setState(() {
      _ranking = widget.api.listarRankingCargadores();
    });
    await _ranking;
  }

  Color _colorPuesto(int puesto, ColorScheme scheme) => switch (puesto) {
    1 => Colors.amber.shade200,
    2 => Colors.blueGrey.shade100,
    3 => Colors.brown.shade200,
    _ => scheme.surfaceContainerHigh,
  };

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ranking de cargadores'),
        actions: [
          IconButton(
            tooltip: 'Actualizar',
            onPressed: _refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: FutureBuilder<List<RankingCargador>>(
        future: _ranking,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return ErrorPanel(error: snapshot.error, onRetry: _refresh);
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final items = snapshot.data!;
          if (items.isEmpty) {
            return const Center(
              child: Text('Todavía no hay cargadores activos.'),
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child: Text(
                    'Posiciones y puntos calculados por Mercado al Toque.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                for (final item in items)
                  Card(
                    key: Key('ranking_cargador_${item.puesto}'),
                    margin: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: _colorPuesto(item.puesto, scheme),
                        child: Text('${item.puesto}'),
                      ),
                      title: Text(
                        item.nombre,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        '${item.nivel} · ${item.puntos} pts · '
                        '${item.recorridosCompletados} entregados',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.star_rounded,
                            size: 18,
                            color: scheme.primary,
                          ),
                          const SizedBox(width: 4),
                          Text(item.calificacion.toStringAsFixed(1)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
