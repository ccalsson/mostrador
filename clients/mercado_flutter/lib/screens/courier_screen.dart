import 'package:flutter/material.dart';

import '../market_api.dart';
import '../models.dart';
import '../widgets/common.dart';

class CourierScreen extends StatefulWidget {
  const CourierScreen({required this.api, required this.actor, super.key});

  final MercadoApi api;
  final MercadoActor actor;

  @override
  State<CourierScreen> createState() => _CourierScreenState();
}

class _CourierScreenState extends State<CourierScreen> {
  late Future<List<Recorrido>> _routes;
  late bool _available;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _available = widget.actor.estaDisponible;
    _routes = widget.api.listarRecorridos();
  }

  Future<void> _refresh() async {
    setState(() {
      _routes = widget.api.listarRecorridos();
    });
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
      await widget.api.accionRecorrido(
        widget.actor.id,
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
        child: FutureBuilder<List<Recorrido>>(
          future: _routes,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return ErrorPanel(error: snapshot.error, onRetry: _refresh);
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final routes = snapshot.data!;
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
                                '${quantity(route.bultos)} bultos · '
                                '${route.estado.label}',
                              ),
                              subtitle: Text(
                                '${route.compradorNombre} · '
                                '${route.compradorTelefono}',
                              ),
                            ),
                            if (route.estado == EstadoRecorrido.asignado)
                              Wrap(
                                spacing: 8,
                                children: [
                                  OutlinedButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _action(
                                            route.id,
                                            'rechazar',
                                          ),
                                    child: const Text('Rechazar'),
                                  ),
                                  FilledButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _action(
                                            route.id,
                                            'aceptar',
                                          ),
                                    child: const Text('Aceptar'),
                                  ),
                                ],
                              ),
                            for (final stop in route.paradas)
                              ListTile(
                                leading: const Icon(Icons.storefront_outlined),
                                title: Text(stop.puesto),
                                subtitle: Text(
                                  '${quantity(stop.bultos)} bultos · '
                                  '${stop.estado.label}',
                                ),
                                trailing: stop.estado == EstadoParada.aceptado
                                    ? FilledButton.tonal(
                                        onPressed: _busy
                                            ? null
                                            : () => _action(
                                                route.id,
                                                'retirar',
                                                orderId: stop.pedidoId,
                                              ),
                                        child: const Text('Retiré'),
                                      )
                                    : stop.estado == EstadoParada.retirado
                                    ? FilledButton(
                                        onPressed: _busy
                                            ? null
                                            : () => _action(
                                                route.id,
                                                'entregar',
                                                orderId: stop.pedidoId,
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
