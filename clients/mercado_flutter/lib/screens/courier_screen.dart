import 'package:flutter/material.dart';

import '../market_api.dart';
import '../widgets/common.dart';

class CourierScreen extends StatefulWidget {
  const CourierScreen({required this.api, required this.actor, super.key});

  final MercadoApi api;
  final Map<String, dynamic> actor;

  @override
  State<CourierScreen> createState() => _CourierScreenState();
}

class _CourierScreenState extends State<CourierScreen> {
  late Future<Map<String, dynamic>> _routes;
  bool _busy = false;
  bool _available = false;

  @override
  void initState() {
    super.initState();
    _available = widget.actor['disponibilidad'] == 'disponible';
    _routes = widget.api.routes();
  }

  Future<void> _refresh() async {
    setState(() => _routes = widget.api.routes());
    await _routes;
  }

  Future<void> _setAvailability(bool value) async {
    setState(() => _busy = true);
    try {
      await widget.api.changeAvailability(value);
      if (mounted) setState(() => _available = value);
    } on MercadoApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _action(String routeId, String action, {String? orderId}) async {
    setState(() => _busy = true);
    try {
      await widget.api.routeAction(
        widget.actor['id'] as String,
        routeId,
        action,
        orderId: orderId,
      );
      await _refresh();
    } on MercadoApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      SwitchListTile(
        title: const Text('Disponible para recorridos'),
        subtitle: Text(
          _available
              ? 'Podés recibir asignaciones'
              : 'No recibirás asignaciones nuevas',
        ),
        value: _available,
        onChanged: _busy ? null : _setAvailability,
      ),
      const Divider(height: 1),
      Expanded(
        child: FutureBuilder<Map<String, dynamic>>(
          future: _routes,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return ErrorPanel(error: snapshot.error, onRetry: _refresh);
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final routes = (snapshot.data!['recorridos'] as List)
                .cast<Map<String, dynamic>>();
            if (routes.isEmpty) {
              return const Center(child: Text('Todavía no tenés recorridos.'));
            }
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  for (final route in routes)
                    Card(
                      margin: const EdgeInsets.all(12),
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Column(
                          children: [
                            ListTile(
                              leading: const Icon(Icons.route_outlined),
                              title: Text(
                                '${route['bultos']} bultos · ${statusLabel(route['estado'] as String)}',
                              ),
                              subtitle: Text(
                                '${route['compradorNombre']} · ${route['compradorTelefono']}',
                              ),
                            ),
                            if (route['estado'] == 'asignado')
                              Wrap(
                                spacing: 8,
                                children: [
                                  OutlinedButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _action(
                                            route['id'] as String,
                                            'rechazar',
                                          ),
                                    child: const Text('Rechazar'),
                                  ),
                                  FilledButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _action(
                                            route['id'] as String,
                                            'aceptar',
                                          ),
                                    child: const Text('Aceptar'),
                                  ),
                                ],
                              ),
                            for (final stop
                                in (route['paradas'] as List)
                                    .cast<Map<String, dynamic>>())
                              ListTile(
                                leading: const Icon(Icons.storefront_outlined),
                                title: Text(stop['puesto'] as String),
                                subtitle: Text(
                                  '${stop['bultos']} bultos · ${statusLabel(stop['estado'] as String)}',
                                ),
                                trailing: stop['estado'] == 'aceptado'
                                    ? FilledButton.tonal(
                                        onPressed: _busy
                                            ? null
                                            : () => _action(
                                                route['id'] as String,
                                                'retirar',
                                                orderId:
                                                    stop['pedidoId'] as String,
                                              ),
                                        child: const Text('Retiré'),
                                      )
                                    : stop['estado'] == 'retirado'
                                    ? FilledButton(
                                        onPressed: _busy
                                            ? null
                                            : () => _action(
                                                route['id'] as String,
                                                'entregar',
                                                orderId:
                                                    stop['pedidoId'] as String,
                                              ),
                                        child: const Text('Entregué'),
                                      )
                                    : null,
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    ],
  );
}
