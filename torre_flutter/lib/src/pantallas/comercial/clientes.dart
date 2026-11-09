import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _estadosPedido = {
  'borrador': 'Borrador',
  'enviado': 'En caja',
  'en_preparacion': 'Preparando',
  'listo': 'Listo',
  'cobrado': 'Cobrado',
  'anulado': 'Anulado',
  'entregado': 'Entregado',
};

const _pagosLabel = {
  'efectivo': 'Efectivo',
  'transferencia': 'Transferencia',
  'tarjeta': 'Tarjeta',
  'cuenta_corriente': 'Cuenta corriente',
};

String _plata(String currency, dynamic monto) => currency == 'ARS' ? fmtMoneda(monto, 'ARS') : 'USD ${texto(monto)}';

String _estadoPedido(String estado) => _estadosPedido[estado] ?? estado;

String _formaPago(String forma) => _pagosLabel[forma] ?? forma;

class PantallaClientes extends StatefulWidget {
  const PantallaClientes({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaClientes> createState() => _PantallaClientesState();
}

class _PantallaClientesState extends State<PantallaClientes> {
  int _version = 0;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('listClients');

  @override
  Widget build(BuildContext context) {
    return VistaDatos<List<dynamic>>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _ClientesVista(
        clientes: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _ClientesVista extends StatelessWidget {
  const _ClientesVista({required this.clientes, required this.api, required this.onCambio});
  final List<dynamic> clientes;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Cada cliente puede tener varios negocios. La ficha queda abajo de las cifras.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Align(alignment: Alignment.centerLeft, child: BotonPrimario('Nuevo', () => _formulario(context, null, api, onCambio))),
        const SizedBox(height: 14),
        if (clientes.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final cli in clientes)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _detalle(context, cli),
                child: Tarjeta(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(texto(cli['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                [texto(cli['businessName']), texto(cli['email'])].firstWhere((v) => v.isNotEmpty, orElse: () => 'Sin datos'),
                                style: TextStyle(color: c.muted, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      ),
                      ChipEstado(
                        texto(cli['status']) == 'active'
                            ? 'Activo'
                            : texto(cli['status']) == 'paused'
                                ? 'Pausado'
                                : 'Archivado',
                        activo: texto(cli['status']) == 'active',
                      ),
                    ],
                  ),
                ),
              ),
            ),
      ],
    );
  }

  void _detalle(BuildContext context, dynamic cli) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _DetallesCliente(cliente: cli, api: api, onCambio: onCambio, onEditar: () => _formulario(context, cli, api, onCambio)),
    );
  }

  static Future<void> _formulario(BuildContext context, dynamic cliente, TorreApi api, VoidCallback onCambio) async {
    final esEdicion = cliente != null;
    final nombre = TextEditingController(text: esEdicion ? texto(cliente['name']) : '');
    final razon = TextEditingController(text: esEdicion ? texto(cliente['businessName']) : '');
    final contacto = TextEditingController(text: esEdicion ? texto(cliente['contactName']) : '');
    final telefono = TextEditingController(text: esEdicion ? texto(cliente['phone']) : '');
    final email = TextEditingController(text: esEdicion ? texto(cliente['email']) : '');
    final notas = TextEditingController(text: esEdicion ? texto(cliente['notes']) : '');
    final estadoOpciones = [
      const _Opcion('active', 'Activo'),
      const _Opcion('paused', 'Pausado'),
      const _Opcion('archived', 'Archivado'),
    ];
    var estado = esEdicion ? texto(cliente['status']) : 'active';
    if (!estadoOpciones.any((o) => o.id == estado)) estado = 'active';
    final estadoSel = _Selector('Estado', estadoOpciones, estado);
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Datos',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: razon, label: 'Razón social'),
        Campo(controller: contacto, label: 'Contacto'),
        Campo(controller: telefono, label: 'Teléfono', teclado: TextInputType.phone),
        Campo(controller: email, label: 'Email', teclado: TextInputType.emailAddress),
        Campo(controller: notas, label: 'Notas', lineas: 3),
        estadoSel.field(),
      ],
      guardar: () => api.fn('saveClient', <String, dynamic>{
        if (esEdicion) 'id': texto(cliente['id']),
        'name': nombre.text,
        'businessName': razon.text,
        'contactName': contacto.text,
        'phone': telefono.text,
        'email': email.text,
        'notes': notas.text,
        'status': estadoSel.valor,
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Cliente guardado.');
    onCambio();
  }
}

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

class _DetallesCliente extends StatefulWidget {
  const _DetallesCliente({required this.cliente, required this.api, required this.onCambio, required this.onEditar});
  final dynamic cliente;
  final TorreApi api;
  final VoidCallback onCambio;
  final VoidCallback onEditar;

  @override
  State<_DetallesCliente> createState() => _DetallesClienteState();
}

class _DetallesClienteState extends State<_DetallesCliente> {
  int _dias = 30;
  late Future<Map<String, dynamic>> _futuro = _cargar();

  Future<Map<String, dynamic>> _cargar() =>
      widget.api.fnMapa('estadisticasCliente', {'clientId': widget.cliente['id'], 'dias': _dias});

  void _rango(int dias) => setState(() {
        _dias = dias;
        _futuro = _cargar();
      });

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final cliente = widget.cliente;
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
                    Text(texto(cliente['name']), style: TextStyle(fontFamily: 'serif', fontSize: 20, fontWeight: FontWeight.w600, color: c.ink)),
                    Text(
                      texto(cliente['businessName']).isEmpty ? 'Sin razón social' : texto(cliente['businessName']),
                      style: TextStyle(fontSize: 13, color: c.muted),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: widget.onEditar,
                child: Text('Ficha', style: TextStyle(color: c.leaf)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 1, label: Text('Hoy')),
              ButtonSegment(value: 7, label: Text('7 días')),
              ButtonSegment(value: 30, label: Text('30 días')),
            ],
            selected: {_dias},
            onSelectionChanged: (s) => _rango(s.first),
          ),
          const SizedBox(height: 12),
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
              return _cifras(snap.data!);
            },
          ),
        ],
      ),
    );
  }

  Widget _cifras(Map<String, dynamic> d) {
    final negocios = d['negocios'] as List? ?? const [];
    final abono = (d['abono'] as List? ?? const [])
        .map((r) => _plata(texto(r['currency']), r['monto']))
        .join(' · ');
    final cobrado = _sumarPagos(d['pagos'], 'paid');
    final pendiente = _sumarPagos(d['pagos'], 'pending');
    final operacion = d['operacion'] as List? ?? const [];
    final medios = d['medios'] as List? ?? const [];
    var vendido = 0.0;
    var mostrador = 0;
    var mercado = 0;
    for (final r in operacion) {
      final estado = texto(r['estado']);
      if (estado == 'cobrado' || estado == 'entregado') vendido += numero(r['monto']);
      if (texto(r['origen']) == 'mercado') {
        mercado += numero(r['n']).round();
      } else if (texto(r['origen']) == 'mostrador') {
        mostrador += numero(r['n']).round();
      }
    }
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Negocios', texto(negocios.length)),
          ('Abono mensual', abono.isEmpty ? '0' : abono),
          ('Nos pagó', cobrado),
          ('Nos debe', pendiente),
        ]),
        const SizedBox(height: 14),
        Tarjeta(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Negocios', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
              if (negocios.isEmpty)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text('Todavía no tiene negocios.', style: TextStyle(color: c.muted, fontSize: 13)))
              else
                for (final n in negocios)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(texto(n['nombre']), style: TextStyle(color: c.ink, fontSize: 14)),
                              Text(
                                '${texto(n['app'])} · ${texto(n['version']).isEmpty ? 'sin versión' : texto(n['version'])}',
                                style: TextStyle(color: c.muted, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        Text(texto(n['estado']) == 'active' ? 'Activo' : 'Inactivo', style: TextStyle(color: c.muted, fontSize: 13)),
                      ],
                    ),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Tarjeta(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Lo que vende', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '${fmtMoneda(vendido, 'ARS')} en pedidos cerrados · $mostrador de mostrador · $mercado de Mercado',
                  style: TextStyle(color: c.muted, fontSize: 13),
                ),
              ),
              if (operacion.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('Sin operación vinculada en este período.', style: TextStyle(color: c.muted, fontSize: 13)),
                )
              else
                for (final r in operacion)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            '${texto(r['origen']) == 'mercado' ? 'Mercado' : 'Mostrador'} · ${_estadoPedido(texto(r['estado']))}',
                            style: TextStyle(color: c.ink, fontSize: 14),
                          ),
                        ),
                        Text('${texto(r['n'])} · ${fmtMoneda(r['monto'])}', style: TextStyle(color: c.muted, fontSize: 13)),
                      ],
                    ),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Tarjeta(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Medios de pago de sus puestos', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
              if (medios.isEmpty)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text('Sin cobros en los puestos.', style: TextStyle(color: c.muted, fontSize: 13)))
              else
                for (final r in medios)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(child: Text(_formaPago(texto(r['forma'])), style: TextStyle(color: c.ink, fontSize: 14))),
                        Text('${texto(r['n'])} · ${fmtMoneda(r['monto'])}', style: TextStyle(color: c.muted, fontSize: 13)),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }

  static String _sumarPagos(dynamic pagos, String estado) {
    final rows = (pagos as List? ?? const []).where((r) => texto(r['estado']) == estado).toList();
    if (rows.isEmpty) return '0';
    return rows.map((r) => _plata(texto(r['currency']), r['monto'])).join(' · ');
  }
}
