import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class PantallaMaterialesYa extends StatefulWidget {
  const PantallaMaterialesYa({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaMaterialesYa> createState() => _PantallaMaterialesYaState();
}

class _PantallaMaterialesYaState extends State<PantallaMaterialesYa> {
  int _version = 0;

  Future<Map<String, dynamic>> _cargar() => widget.api.fnMapa('usoMaterialesYa');

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Uso del corralón, leído por HTTP de servidor a servidor. La app siempre devuelve su mes en curso.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 14),
        VistaDatos<Map<String, dynamic>>(
          key: ValueKey(_version),
          cargar: _cargar,
          builder: (context, datos) => _lectura(context, datos),
        ),
      ],
    );
  }

  Widget _lectura(BuildContext context, Map<String, dynamic> lectura) {
    final c = torreColorsOf(context);
    if (lectura['disponible'] != true) {
      return Tarjeta(
        child: Text(
          texto(lectura['motivo']).isEmpty ? 'Materiales Ya no devolvió datos de uso.' : texto(lectura['motivo']),
          style: TextStyle(color: c.terra, fontSize: 14),
        ),
      );
    }
    final uso = lectura['uso'] as Map? ?? const {};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Tarjeta(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LineaDato('Aplicación', texto(uso['app'])),
              LineaDato('Mes del corralón', texto(uso['mes'])),
            ],
          ),
        ),
        const SizedBox(height: 12),
        KpiGrilla([
          ('Ventas del mes · pesos', fmtMoneda(uso['ventas'], r'$')),
          ('Tickets del mes', texto(uso['tickets'])),
          ('Operadores · cajeros que vendieron', texto(uso['operadores'])),
          ('Clientes con venta', texto(uso['clientes_con_venta'])),
          ('Cajas abiertas · turnos sin cerrar', texto(uso['cajas_abiertas'])),
          ('Sucursales', texto(uso['sucursales'])),
          ('Moneda · enteros de pesos', texto(uso['moneda'])),
        ]),
        const SizedBox(height: 14),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(onPressed: () => setState(() => _version++), child: const Text('Volver a leer')),
        ),
      ],
    );
  }
}
