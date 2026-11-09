import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class _Opcion {
  const _Opcion(this.id, this.label);
  final String id;
  final String label;
}

class _Selector {
  _Selector(this.label, this.opciones, String inicial)
      : valor = opciones.any((o) => o.id == inicial) ? inicial : (opciones.isEmpty ? '' : opciones.first.id);

  final String label;
  final List<_Opcion> opciones;
  String valor;

  Widget field() => Desplegable(
        label: label,
        valor: _etiquetaActual(),
        opciones: [for (final o in opciones) o.label],
        onChanged: (v) => valor = opciones.firstWhere((o) => o.label == v).id,
      );

  String _etiquetaActual() {
    for (final o in opciones) {
      if (o.id == valor) return o.label;
    }
    return opciones.isEmpty ? '' : opciones.first.label;
  }
}

class _CampoFecha extends StatelessWidget {
  const _CampoFecha({required this.controller, required this.label});
  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      readOnly: true,
      decoration: InputDecoration(
        labelText: label,
        suffixIcon: IconButton(
          tooltip: 'Limpiar',
          icon: const Icon(Icons.clear, size: 18),
          onPressed: () => controller.text = '',
        ),
      ),
      onTap: () async {
        final hoy = DateTime.now();
        final elegido = await showDatePicker(
          context: context,
          initialDate: DateTime.tryParse(controller.text) ?? hoy,
          firstDate: DateTime(hoy.year - 10),
          lastDate: DateTime(hoy.year + 10),
        );
        if (elegido != null) controller.text = _iso(elegido);
      },
    );
  }
}

class _SubsDatos {
  _SubsDatos(this.subs, this.clientes, this.tenants, this.planes);
  final List<dynamic> subs;
  final List<dynamic> clientes;
  final List<dynamic> tenants;
  final List<dynamic> planes;
}

class PantallaSuscripciones extends StatefulWidget {
  const PantallaSuscripciones({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaSuscripciones> createState() => _PantallaSuscripcionesState();
}

class _PantallaSuscripcionesState extends State<PantallaSuscripciones> {
  int _version = 0;

  Future<_SubsDatos> _cargar() async {
    final subs = await widget.api.fnLista('listSubscriptions');
    final clientes = await widget.api.fnLista('listClients');
    final tenants = await widget.api.fnLista('listTenants');
    final planes = await widget.api.fnLista('listPlans');
    return _SubsDatos(subs, clientes, tenants, planes);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_SubsDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _SubsVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _SubsVista extends StatelessWidget {
  const _SubsVista({required this.datos, required this.api, required this.onCambio});
  final _SubsDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'El estado sale de acá. El importe del encabezado no es el precio del puesto: implementación, abono y add-ons viven en las líneas. Una bonificación no los pisa.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Align(alignment: Alignment.centerLeft, child: BotonPrimario('Nueva', () => _formulario(context, null))),
        const SizedBox(height: 14),
        if (datos.subs.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final s in datos.subs)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  builder: (_) => _DetalleSuscripcion(
                    sub: s,
                    api: api,
                    onEditar: () => _formulario(context, s),
                  ),
                ),
                child: Tarjeta(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(texto(s['tenantName']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                '${texto(s['clientName'])} · ${texto(s['planName'])} · próx. ${texto(s['nextPaymentDate']).isEmpty ? '—' : texto(s['nextPaymentDate'])}',
                                style: TextStyle(color: c.muted, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('${texto(s['planCurrency'])} ${texto(s['monthlyPrice'])}', style: TextStyle(color: c.ink, fontSize: 14)),
                          const SizedBox(height: 4),
                          ChipEstado(texto(s['status']), activo: texto(s['status']) == 'active'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
      ],
    );
  }

  Future<void> _formulario(BuildContext context, dynamic sub) async {
    final esEdicion = sub != null;
    final precio = TextEditingController(
      text: esEdicion
          ? texto(sub['monthlyPrice'])
          : (datos.planes.isEmpty ? '0' : texto(datos.planes.first['monthlyPrice'])),
    );
    final inicio = TextEditingController(text: esEdicion ? texto(sub['startDate']) : _iso(DateTime.now()));
    final proximo = TextEditingController(text: esEdicion ? texto(sub['nextPaymentDate']) : '');
    final clientes = _Selector(
      'Cliente',
      [for (final x in datos.clientes) _Opcion(texto(x['id']), texto(x['name']))],
      esEdicion ? texto(sub['clientId']) : '',
    );
    final tenants = _Selector(
      'Tenant',
      [for (final t in datos.tenants) _Opcion(texto(t['id']), texto(t['name']))],
      esEdicion ? texto(sub['tenantId']) : '',
    );
    final planes = _Selector(
      'Plan',
      [for (final p in datos.planes) _Opcion(texto(p['id']), texto(p['name']))],
      esEdicion ? texto(sub['planId']) : '',
    );
    final estado = _Selector(
      'Estado',
      const [
        _Opcion('pending', 'Pendiente'),
        _Opcion('active', 'Activa'),
        _Opcion('past_due', 'Vencida'),
        _Opcion('paused', 'Pausada'),
        _Opcion('suspended', 'Suspendida'),
        _Opcion('cancelled', 'Cancelada'),
      ],
      esEdicion ? texto(sub['status']) : 'active',
    );
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Ficha',
      campos: [
        clientes.field(),
        tenants.field(),
        planes.field(),
        Campo(controller: precio, label: 'Precio mensual', teclado: const TextInputType.numberWithOptions(decimal: true)),
        _CampoFecha(controller: inicio, label: 'Inicio'),
        _CampoFecha(controller: proximo, label: 'Próximo pago'),
        estado.field(),
      ],
      guardar: () => api.fn('saveSubscription', <String, dynamic>{
        if (esEdicion) 'id': texto(sub['id']),
        'clientId': clientes.valor,
        'tenantId': tenants.valor,
        'planId': planes.valor,
        'monthlyPrice': numero(precio.text),
        'status': estado.valor,
        'startDate': inicio.text,
        'nextPaymentDate': proximo.text,
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Suscripción guardada.');
    onCambio();
  }
}

class _DetalleSuscripcion extends StatefulWidget {
  const _DetalleSuscripcion({required this.sub, required this.api, required this.onEditar});
  final dynamic sub;
  final TorreApi api;
  final VoidCallback onEditar;

  @override
  State<_DetalleSuscripcion> createState() => _DetalleSuscripcionState();
}

class _DetalleSuscripcionState extends State<_DetalleSuscripcion> {
  late Future<Map<String, dynamic>> _futuro = _cargar();

  Future<Map<String, dynamic>> _cargar() => widget.api.fnMapa('serviciosDeTenant', texto(widget.sub['tenantId']));

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final sub = widget.sub;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(texto(sub['tenantName']), style: TextStyle(fontFamily: 'serif', fontSize: 20, fontWeight: FontWeight.w600, color: c.ink)),
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        '${texto(sub['clientName'])} · ${texto(sub['planName'])} · próx. ${texto(sub['nextPaymentDate']).isEmpty ? '—' : texto(sub['nextPaymentDate'])}',
                        style: TextStyle(color: c.muted, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${texto(sub['planCurrency'])} ${texto(sub['monthlyPrice'])}', style: TextStyle(color: c.ink, fontSize: 14)),
                  const SizedBox(height: 4),
                  ChipEstado(texto(sub['status']), activo: texto(sub['status']) == 'active'),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: widget.onEditar, child: const Text('Editar'))),
          const SizedBox(height: 6),
          Text('Líneas de este tenant. Contratado y a cobrar salen del servidor.', style: TextStyle(color: c.muted, fontSize: 12)),
          const SizedBox(height: 8),
          FutureBuilder<Map<String, dynamic>>(
            future: _futuro,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 32),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snap.hasError) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('${snap.error}', style: TextStyle(color: c.terra, fontSize: 13)),
                    TextButton(onPressed: () => setState(() => _futuro = _cargar()), child: const Text('Reintentar')),
                  ],
                );
              }
              return _lineas(snap.data!);
            },
          ),
        ],
      ),
    );
  }

  Widget _lineas(Map<String, dynamic> data) {
    final c = torreColorsOf(context);
    final lineas = data['lines'] as List? ?? const [];
    final due = (data['monthlyDue'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    final aCobrar = due.entries.map((e) => '${e.key} ${texto(e.value)}').join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('A cobrar este mes: ${aCobrar.isEmpty ? '0' : aCobrar}', style: TextStyle(color: c.inkSoft, fontSize: 13)),
        const SizedBox(height: 8),
        if (lineas.isEmpty)
          Text('Sin líneas.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final l in lineas)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(_lineaTexto(l), style: TextStyle(color: c.inkSoft, fontSize: 13)),
            ),
      ],
    );
  }

  String _lineaTexto(dynamic l) {
    var t = '${texto(l['productName'])} · ${texto(l['charge'])} · ${texto(l['frequency'])}'
        ' · contratado ${texto(l['currency'])} ${texto(l['unitPrice'])}'
        ' · a cobrar ${texto(l['currency'])} ${texto(l['amountDue'])}'
        ' · ${texto(l['status'])}';
    if (l['frozen'] == true) t += ' · congelado';
    final inicio = texto(l['startsOn']);
    if (inicio.isNotEmpty) t += ' · $inicio';
    final fin = texto(l['endsOn']);
    if (fin.isNotEmpty) t += ' → $fin';
    return t;
  }
}
