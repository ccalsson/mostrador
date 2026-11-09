import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

String _pesosCents(dynamic cents) => fmtMoneda(numero(cents) / 100, r'$');

String _fechaHora(dynamic iso) {
  final d = DateTime.tryParse(texto(iso));
  if (d == null) return texto(iso);
  final local = d.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '${fmtFecha(local.toIso8601String())} $hh:$mm';
}

class PantallaSuperAlToque extends StatefulWidget {
  const PantallaSuperAlToque({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaSuperAlToque> createState() => _PantallaSuperAlToqueState();
}

class _PantallaSuperAlToqueState extends State<PantallaSuperAlToque> {
  static const _rangos = [(1, 'Hoy'), (7, '7 días'), (30, '30 días')];
  int _dias = 30;

  Future<Map<String, dynamic>> _cargar() => widget.api.fnMapa('kpisSuperAlToque', <String, dynamic>{'dias': _dias});

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'KPIs comerciales. Comparador de precios y delivery para Virasoro.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            for (final (valor, etiqueta) in _rangos)
              ChoiceChip(
                label: Text(etiqueta),
                selected: _dias == valor,
                onSelected: (_) => setState(() => _dias = valor),
              ),
          ],
        ),
        const SizedBox(height: 14),
        VistaDatos<Map<String, dynamic>>(
          key: ValueKey('super-$_dias'),
          cargar: _cargar,
          builder: (context, datos) => _contenido(context, datos),
        ),
      ],
    );
  }

  Widget _contenido(BuildContext context, Map<String, dynamic> d) {
    final c = torreColorsOf(context);
    final ventas = d['sales'] as Map? ?? const {};
    final comercios = d['merchants'] as Map? ?? const {};
    final repartos = d['deliveries'] as Map? ?? const {};
    final porComercio = d['byMerchant'] as List? ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Subtitulo('Ventas'),
        KpiGrilla([
          ('GMV · ${texto(ventas['ordersCount'])} pedidos', _pesosCents(ventas['gmvCents'])),
          ('Comisión plataforma · se descuenta del comercio', _pesosCents(ventas['commissionCents'])),
          ('Ticket promedio', _pesosCents(ventas['avgTicketCents'])),
          ('Tiempo hasta entregar · promedio de los entregados', '${texto(ventas['avgMinutesToDelivered'])} min'),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Comercios'),
        KpiGrilla([
          ('Activos · ${texto(comercios['openNow'])} abiertos ahora', texto(comercios['active'])),
          ('Pendientes', texto(comercios['pending'])),
          ('Suspendidos', texto(comercios['suspended'])),
          ('Cerrados', texto(comercios['closed'])),
          ('Cancelados', texto(ventas['cancelledCount'])),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Repartos'),
        KpiGrilla([
          ('En curso', texto(repartos['inFlight'])),
          ('Sin repartidor · hay que asignar', texto(repartos['unassigned'])),
          ('Flete en juego · lo cobra el comercio', _pesosCents(repartos['deliveryFeeCents'])),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Desglose por comercio'),
        if (porComercio.isEmpty)
          Text('Ningún comercio vendió en este período.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final m in porComercio)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Tarjeta(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(texto(m['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                        ),
                        Text(_pesosCents(m['salesCents']), style: TextStyle(color: c.ink, fontSize: 14)),
                      ],
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        '${texto(m['ordersCount'])} pedidos · comisión ${texto(m['commissionRatePct'])}% '
                        '(${_pesosCents(m['commissionCents'])}) · ${texto(m['status'])}',
                        style: TextStyle(color: c.muted, fontSize: 12),
                      ),
                    ),
                    if (texto(m['category']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(texto(m['category']), style: TextStyle(color: c.muted, fontSize: 12)),
                      ),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 10),
        Text(
          'Datos generados el ${_fechaHora(d['generatedAt'])} · ${texto(d['city'])} · últimos ${texto(d['days'])} días',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
      ],
    );
  }
}

class _Subtitulo extends StatelessWidget {
  const _Subtitulo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(texto, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink)),
    );
  }
}
