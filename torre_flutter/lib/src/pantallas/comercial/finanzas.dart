import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';
import 'materiales_ya.dart';

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
      decoration: InputDecoration(labelText: label, suffixIcon: const Icon(Icons.calendar_today, size: 18)),
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

class _Casilla extends StatefulWidget {
  const _Casilla({required this.label, required this.inicial, required this.onCambiar});
  final String label;
  final bool inicial;
  final ValueChanged<bool> onCambiar;

  @override
  State<_Casilla> createState() => _CasillaState();
}

class _CasillaState extends State<_Casilla> {
  late bool _valor = widget.inicial;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: _valor,
      onChanged: (v) => setState(() {
        _valor = v ?? false;
        widget.onCambiar(_valor);
      }),
      title: Text(widget.label, style: const TextStyle(fontSize: 14)),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
    );
  }
}

class _FinanzasDatos {
  _FinanzasDatos(this.resumen, this.pagos, this.gastos, this.clientes, this.subs, this.apps, this.lineas);
  final Map<String, dynamic> resumen;
  final List<dynamic> pagos;
  final List<dynamic> gastos;
  final List<dynamic> clientes;
  final List<dynamic> subs;
  final List<dynamic> apps;
  final List<dynamic> lineas;
}

class PantallaFinanzas extends StatefulWidget {
  const PantallaFinanzas({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaFinanzas> createState() => _PantallaFinanzasState();
}

class _PantallaFinanzasState extends State<PantallaFinanzas> {
  int _version = 0;

  Future<_FinanzasDatos> _cargar() async {
    final resumen = await widget.api.fnMapa('resumenComercial');
    final pagos = await widget.api.fnLista('listPayments');
    final gastos = await widget.api.fnLista('listExpenses');
    final clientes = await widget.api.fnLista('listClients');
    final subs = await widget.api.fnLista('listSubscriptions');
    final apps = await widget.api.fnLista('listApps');
    final lineas = await widget.api.fnLista('listLineas');
    return _FinanzasDatos(resumen, pagos, gastos, clientes, subs, apps, lineas);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_FinanzasDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _FinanzasVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _FinanzasVista extends StatelessWidget {
  const _FinanzasVista({required this.datos, required this.api, required this.onCambio});
  final _FinanzasDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final r = datos.resumen;
    final mrr = (r['mrr'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    final abono = mrr.entries.map((e) => '${e.key} ${texto(e.value)}').join(' · ');
    final pendiente = (r['pending'] as List? ?? const [])
        .map((p) => '${texto(p['currency'])} ${texto(p['amount'])}')
        .join(' · ');
    final alertas = (r['alertas'] as List? ?? const []).map(texto).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Abono mensual', abono.isEmpty ? '0' : abono),
          ('Pendiente de cobro', pendiente.isEmpty ? '0' : pendiente),
          ('Suscripciones', texto(r['subscriptions'])),
          ('Add-ons', texto(r['addons'])),
          ('Mostrador', texto(r['mostrador'])),
          ('Mercado', texto(r['mercado'])),
          ('Sucursales', texto(r['branches'])),
          ('Publicidad', texto(r['ads'])),
        ]),
        const SizedBox(height: 18),
        Text('Alertas (${alertas.length})', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink)),
        const SizedBox(height: 8),
        if (alertas.isEmpty)
          Text('Nada pendiente.', style: TextStyle(color: c.muted))
        else
          for (final a in alertas)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
                child: Text(a, style: TextStyle(color: c.terra)),
              ),
            ),
        const SizedBox(height: 18),
        _EncabezadoSeccion(
          titulo: 'Ingresos',
          accion: 'Registrar',
          onAccion: () => _formularioPago(context),
        ),
        const SizedBox(height: 8),
        if (datos.pagos.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final p in datos.pagos)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Tarjeta(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(texto(p['concept']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(_detallePago(p), style: TextStyle(color: c.muted, fontSize: 12)),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('${texto(p['currency'])} ${texto(p['amount'])}', style: TextStyle(color: c.ink, fontSize: 14)),
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text('${texto(p['kind'])} · ${texto(p['status'])}', style: TextStyle(color: c.muted, fontSize: 12)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 18),
        _EncabezadoSeccion(
          titulo: 'Gastos',
          accion: 'Registrar',
          onAccion: () => _formularioGasto(context),
        ),
        const SizedBox(height: 4),
        Text('El gasto no tiene moneda en el registro. El número se muestra tal cual.', style: TextStyle(color: c.muted, fontSize: 12)),
        const SizedBox(height: 8),
        if (datos.gastos.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final g in datos.gastos)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Tarjeta(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(texto(g['concept']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              '${[texto(g['provider']), texto(g['appName'])].firstWhere((v) => v.isNotEmpty, orElse: () => 'General')} · ${texto(g['frequency'])}',
                              style: TextStyle(color: c.muted, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(texto(g['amount']), style: TextStyle(color: c.ink, fontSize: 14)),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 18),
        Text('Materiales Ya', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink)),
        const SizedBox(height: 8),
        PantallaMaterialesYa(api: api),
      ],
    );
  }

  String _detallePago(dynamic p) {
    var t = '${texto(p['clientName'])} · ${texto(p['paymentDate'])}';
    final notas = texto(p['notes']);
    if (notas.isNotEmpty) t += ' · $notas';
    final comprobante = texto(p['comprobanteNombre']);
    if (comprobante.isNotEmpty) t += ' · $comprobante';
    return t;
  }

  Future<void> _formularioPago(BuildContext context) async {
    final cliente = _Selector(
      'Cliente',
      [for (final x in datos.clientes) _Opcion(texto(x['id']), texto(x['name']))],
      '',
    );
    final sub = _Selector(
      'Suscripción',
      [
        const _Opcion('', 'Sin suscripción'),
        for (final s in datos.subs) _Opcion(texto(s['id']), texto(s['tenantName'])),
      ],
      '',
    );
    final linea = _Selector(
      'Línea',
      [
        const _Opcion('', 'Sin línea'),
        for (final l in datos.lineas) _Opcion(texto(l['id']), '${texto(l['tenantName'])} · ${texto(l['productName'])}'),
      ],
      '',
    );
    final tipo = _Selector(
      'Tipo',
      const [
        _Opcion('instalacion', 'Instalación'),
        _Opcion('mensualidad', 'Mensualidad'),
        _Opcion('addon', 'Add-on'),
        _Opcion('sucursal', 'Sucursal'),
        _Opcion('mercado', 'Mercado al Toque'),
        _Opcion('publicidad', 'Publicidad'),
        _Opcion('push', 'Push'),
        _Opcion('otro', 'Otro'),
      ],
      'mensualidad',
    );
    final moneda = _Selector('Moneda', const [_Opcion('USD', 'USD'), _Opcion('ARS', 'ARS')], 'USD');
    final estado = _Selector(
      'Estado',
      const [_Opcion('paid', 'Cobrado'), _Opcion('pending', 'Pendiente'), _Opcion('void', 'Anulado')],
      'paid',
    );
    final concepto = TextEditingController();
    final importe = TextEditingController();
    final fecha = TextEditingController(text: _iso(DateTime.now()));
    var aplicarPeriodo = true;
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Registrar ingreso',
      campos: [
        cliente.field(),
        sub.field(),
        linea.field(),
        tipo.field(),
        Campo(controller: concepto, label: 'Concepto'),
        Campo(controller: importe, label: 'Importe', teclado: const TextInputType.numberWithOptions(decimal: true)),
        moneda.field(),
        _CampoFecha(controller: fecha, label: 'Fecha'),
        estado.field(),
        _Casilla(label: 'Correr el vencimiento según la frecuencia de la línea', inicial: true, onCambiar: (v) => aplicarPeriodo = v),
      ],
      guardar: () {
        dynamic seleccionada;
        if (linea.valor.isNotEmpty) {
          for (final l in datos.lineas) {
            if (texto(l['id']) == linea.valor) {
              seleccionada = l;
              break;
            }
          }
        }
        final subId = seleccionada != null && texto(seleccionada['subscriptionId']).isNotEmpty
            ? texto(seleccionada['subscriptionId'])
            : sub.valor;
        return api.fn('savePayment', <String, dynamic>{
          'clientId': cliente.valor,
          'subscriptionId': subId,
          'amount': numero(importe.text),
          'paymentDate': fecha.text,
          'concept': concepto.text,
          'status': estado.valor,
          'notes': '',
          'tenantId': seleccionada != null ? texto(seleccionada['tenantId']) : '',
          'productId': seleccionada != null ? texto(seleccionada['productId']) : '',
          'lineId': linea.valor,
          'kind': tipo.valor,
          'currency': moneda.valor,
          'applyPeriod': aplicarPeriodo,
        });
      },
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Ingreso registrado.');
    onCambio();
  }

  Future<void> _formularioGasto(BuildContext context) async {
    final app = _Selector(
      'Aplicación',
      [
        const _Opcion('', 'General'),
        for (final a in datos.apps) _Opcion(texto(a['id']), texto(a['name'])),
      ],
      '',
    );
    final rubro = _Selector(
      'Rubro',
      const [
        _Opcion('hosting', 'Hosting'),
        _Opcion('database', 'Base de datos'),
        _Opcion('domain', 'Dominios'),
        _Opcion('ai', 'Servicios de IA'),
        _Opcion('tools', 'Herramientas'),
        _Opcion('api', 'APIs'),
        _Opcion('other', 'Otros'),
      ],
      'hosting',
    );
    final frecuencia = _Selector(
      'Frecuencia',
      const [_Opcion('monthly', 'Mensual'), _Opcion('yearly', 'Anual'), _Opcion('once', 'Único')],
      'monthly',
    );
    final concepto = TextEditingController();
    final proveedor = TextEditingController();
    final importe = TextEditingController();
    final fecha = TextEditingController(text: _iso(DateTime.now()));
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Registrar gasto',
      campos: [
        app.field(),
        rubro.field(),
        Campo(controller: concepto, label: 'Concepto'),
        Campo(controller: proveedor, label: 'Proveedor'),
        Campo(controller: importe, label: 'Importe', teclado: const TextInputType.numberWithOptions(decimal: true)),
        frecuencia.field(),
        _CampoFecha(controller: fecha, label: 'Fecha'),
      ],
      guardar: () => api.fn('saveExpense', <String, dynamic>{
        'appId': app.valor,
        'concept': concepto.text,
        'provider': proveedor.text,
        'amount': numero(importe.text),
        'frequency': frecuencia.valor,
        'category': rubro.valor,
        'expenseDate': fecha.text,
        'notes': '',
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Gasto registrado.');
    onCambio();
  }
}

class _EncabezadoSeccion extends StatelessWidget {
  const _EncabezadoSeccion({required this.titulo, required this.accion, required this.onAccion});
  final String titulo;
  final String accion;
  final VoidCallback onAccion;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Row(
      children: [
        Expanded(child: Text(titulo, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink))),
        BotonPrimario(accion, onAccion),
      ],
    );
  }
}
