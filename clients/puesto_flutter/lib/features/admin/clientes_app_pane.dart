import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/comprador_app.dart';
import '../../services/compradores_app_service.dart';

/// Panel de administracion que lista los compradores de Mercado al Toque
/// del puesto. Es read-only: no se pueden crear ni editar desde aqui.
///
/// Muestra estadisticas arriba (total compradores, % verificados, promedio
/// de gasto) y una lista con busqueda. Al tocar un comprador se abre un
/// dialog con el detalle completo.
class ClientesAppPane extends ConsumerStatefulWidget {
  const ClientesAppPane({super.key});

  @override
  ConsumerState<ClientesAppPane> createState() => _ClientesAppPaneState();
}

class _ClientesAppPaneState extends ConsumerState<ClientesAppPane> {
  final _busqueda = TextEditingController();
  String _filtro = '';

  @override
  void dispose() {
    _busqueda.dispose();
    super.dispose();
  }

  void _buscar(String valor) {
    setState(() => _filtro = valor.trim().toLowerCase());
  }

  List<CompradorApp> _filtrar(List<CompradorApp> lista) {
    if (_filtro.isEmpty) return lista;
    return lista.where((c) {
      return c.nombre.toLowerCase().contains(_filtro) ||
          (c.email?.toLowerCase().contains(_filtro) ?? false) ||
          (c.telefono?.contains(_filtro) ?? false);
    }).toList();
  }

  void _verDetalle(CompradorApp comprador) {
    showDialog<void>(
      context: context,
      builder: (_) => _CompradorDetalleDialog(comprador: comprador),
    );
  }

  @override
  Widget build(BuildContext context) {
    final compradoresAsync = ref.watch(compradoresAppProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Clientes de la app',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Actualizar',
                onPressed: () => ref.invalidate(compradoresAppProvider),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        compradoresAsync.when(
          loading: () =>
              const Expanded(child: Center(child: CircularProgressIndicator())),
          error: (error, _) => Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Error al cargar compradores.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(compradoresAppProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
          ),
          data: (lista) {
            final filtrados = _filtrar(lista);
            return Expanded(
              child: Column(
                children: [
                  // Estadisticas
                  _EstadisticasBar(compradores: lista),
                  // Busqueda
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    child: TextField(
                      key: const Key('clientes_app_busqueda'),
                      controller: _busqueda,
                      onChanged: _buscar,
                      decoration: const InputDecoration(
                        labelText: 'Buscar por nombre, mail o telefono',
                        prefixIcon: Icon(Icons.search),
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  // Lista
                  Expanded(
                    child: filtrados.isEmpty
                        ? Center(
                            child: Text(
                              lista.isEmpty
                                  ? 'No hay compradores de la app.'
                                  : 'Ningun comprador coincide con la busqueda.',
                              key: const Key('clientes_app_vacia'),
                            ),
                          )
                        : ListView.separated(
                            key: const Key('clientes_app_lista'),
                            itemCount: filtrados.length,
                            separatorBuilder: (_, _) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final comprador = filtrados[index];
                              return _CompradorTile(
                                comprador: comprador,
                                onTap: () => _verDetalle(comprador),
                              );
                            },
                          ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _EstadisticasBar extends StatelessWidget {
  const _EstadisticasBar({required this.compradores});

  final List<CompradorApp> compradores;

  @override
  Widget build(BuildContext context) {
    final total = compradores.length;
    final verificados = compradores.where((c) => c.verificado).length;
    final pctVerificados =
        total > 0 ? (verificados * 100 / total).round() : 0;
    final totalGastado =
        compradores.fold<double>(0, (s, c) => s + c.totalGastado);
    final promedioGasto = total > 0 ? totalGastado / total : 0.0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _StatItem(
                label: 'Compradores',
                valor: '$total',
                icon: Icons.people_outline,
              ),
              _StatItem(
                label: 'Verificados',
                valor: '$pctVerificados%',
                icon: Icons.verified_outlined,
                color: Colors.green,
              ),
              _StatItem(
                label: 'Gasto promedio',
                valor: moneda(promedioGasto),
                icon: Icons.attach_money_outlined,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({
    required this.label,
    required this.valor,
    required this.icon,
    this.color,
  });

  final String label;
  final String valor;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20, color: color ?? theme.colorScheme.primary),
        const SizedBox(height: 4),
        Text(
          valor,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _CompradorTile extends StatelessWidget {
  const _CompradorTile({
    required this.comprador,
    required this.onTap,
  });

  final CompradorApp comprador;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: Key('comprador_app_${comprador.id}'),
      leading: CircleAvatar(
        child: Text(
          comprador.nombre.isNotEmpty
              ? comprador.nombre[0].toUpperCase()
              : '?',
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              comprador.nombre,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          if (comprador.verificado) ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.green.shade100,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.verified, size: 12, color: Colors.green.shade800),
                  const SizedBox(width: 2),
                  Text(
                    'Verificado',
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.green.shade800,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
      subtitle: Text(
        '${comprador.email ?? "Sin email"}\n'
        '${comprador.totalPedidos} pedidos - ${moneda(comprador.totalGastado)}'
        '${comprador.ultimaCompra != null ? " - Ultima: ${fechaCorta(comprador.ultimaCompra!)}" : ""}',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}

class _CompradorDetalleDialog extends StatelessWidget {
  const _CompradorDetalleDialog({required this.comprador});

  final CompradorApp comprador;

  String _identidadLabel(String identidad) {
    return switch (identidad) {
      'documentacion_cargada' => 'Documentacion cargada',
      'rechazada' => 'Documentacion rechazada',
      'aprobada' => 'Identidad aprobada',
      _ => 'Sin documento',
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: Row(
        children: [
          Expanded(
            child: Text(
              comprador.nombre,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (comprador.verificado)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.green.shade100,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.verified, size: 14, color: Colors.green.shade800),
                  const SizedBox(width: 4),
                  Text(
                    'Verificado',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.green.shade800,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Datos de contacto
              Text('Contacto',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              _InfoRow(
                icon: Icons.email_outlined,
                label: 'Email',
                valor: comprador.email ?? 'Sin email',
              ),
              _InfoRow(
                icon: Icons.phone_outlined,
                label: 'Telefono',
                valor: comprador.telefono ?? 'Sin telefono',
              ),
              _InfoRow(
                icon: Icons.badge_outlined,
                label: 'Identidad',
                valor: _identidadLabel(comprador.identidad),
              ),
              const Divider(height: 24),
              // Estadisticas
              Text('Estadisticas',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              _InfoRow(
                icon: Icons.shopping_bag_outlined,
                label: 'Total pedidos',
                valor: '${comprador.totalPedidos}',
              ),
              _InfoRow(
                icon: Icons.attach_money_outlined,
                label: 'Total gastado',
                valor: moneda(comprador.totalGastado),
              ),
              if (comprador.primeraCompra != null)
                _InfoRow(
                  icon: Icons.calendar_today_outlined,
                  label: 'Primera compra',
                  valor: fechaCorta(comprador.primeraCompra!),
                ),
              if (comprador.ultimaCompra != null)
                _InfoRow(
                  icon: Icons.event_outlined,
                  label: 'Ultima compra',
                  valor: fechaCorta(comprador.ultimaCompra!),
                ),
              const Divider(height: 24),
              // Aviso read-only
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      size: 18,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Este comprador viene de Mercado. No se puede editar desde aqui.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.valor,
  });

  final IconData icon;
  final String label;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Text('$label: ',
              style: const TextStyle(fontWeight: FontWeight.w500)),
          Expanded(child: Text(valor)),
        ],
      ),
    );
  }
}
