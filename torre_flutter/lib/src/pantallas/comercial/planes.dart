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

class PantallaPlanes extends StatefulWidget {
  const PantallaPlanes({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaPlanes> createState() => _PantallaPlanesState();
}

class _PantallaPlanesState extends State<PantallaPlanes> {
  int _version = 0;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('listPlans');

  @override
  Widget build(BuildContext context) {
    return VistaDatos<List<dynamic>>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _PlanesVista(
        planes: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _PlanesVista extends StatelessWidget {
  const _PlanesVista({required this.planes, required this.api, required this.onCambio});
  final List<dynamic> planes;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Un plan se crea acá, no en el cliente. El precio que paga un puesto ya contratado está en sus líneas. Cambiar este importe no las reescribe.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        Align(alignment: Alignment.centerLeft, child: BotonPrimario('Nuevo', () => _formulario(context, null))),
        const SizedBox(height: 14),
        if (planes.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final p in planes)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Tarjeta(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(texto(p['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    ),
                    Text(
                      '${texto(p['currency'])} ${texto(p['monthlyPrice'])} / ${texto(p['periodicity']) == 'monthly' ? 'mes' : texto(p['periodicity'])}',
                      style: TextStyle(color: c.muted, fontSize: 13),
                    ),
                    const SizedBox(width: 8),
                    TextButton(onPressed: () => _formulario(context, p), child: const Text('Editar')),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  Future<void> _formulario(BuildContext context, dynamic plan) async {
    final esEdicion = plan != null;
    final nombre = TextEditingController(text: esEdicion ? texto(plan['name']) : '');
    final codigo = TextEditingController(text: esEdicion ? texto(plan['code']) : '');
    final descripcion = TextEditingController(text: esEdicion ? texto(plan['description']) : '');
    final mensual = TextEditingController(text: esEdicion ? texto(plan['monthlyPrice']) : '0');
    final puesta = TextEditingController(text: esEdicion ? texto(plan['setupPrice']) : '0');
    final desde = TextEditingController(text: esEdicion ? texto(plan['validFrom']) : '');
    final hasta = TextEditingController(text: esEdicion ? texto(plan['validTo']) : '');
    final features = TextEditingController(text: esEdicion ? texto(plan['features']) : '[]');
    final limits = TextEditingController(text: esEdicion ? texto(plan['limits']) : '{}');
    final metadata = TextEditingController(text: esEdicion ? texto(plan['metadata']) : '{}');
    final moneda = _Selector('Moneda', const [_Opcion('USD', 'USD'), _Opcion('ARS', 'ARS')], esEdicion ? texto(plan['currency']) : 'USD');
    final periodicidad = _Selector(
      'Periodicidad',
      const [_Opcion('monthly', 'Mensual'), _Opcion('yearly', 'Anual'), _Opcion('once', 'Única')],
      esEdicion ? texto(plan['periodicity']) : 'monthly',
    );
    final estado = _Selector(
      'Estado',
      const [_Opcion('active', 'Activo'), _Opcion('archived', 'Archivado')],
      esEdicion ? texto(plan['status']) : 'active',
    );
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Ficha',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: codigo, label: 'Código'),
        Campo(controller: descripcion, label: 'Descripción'),
        moneda.field(),
        periodicidad.field(),
        Campo(controller: mensual, label: 'Precio mensual', teclado: const TextInputType.numberWithOptions(decimal: true)),
        Campo(controller: puesta, label: 'Puesta en marcha', teclado: const TextInputType.numberWithOptions(decimal: true)),
        _CampoFecha(controller: desde, label: 'Vigente desde'),
        _CampoFecha(controller: hasta, label: 'Vigente hasta'),
        Campo(controller: features, label: 'Funcionalidades JSON', lineas: 3),
        Campo(controller: limits, label: 'Límites JSON', lineas: 3),
        Campo(controller: metadata, label: 'Metadata JSON', lineas: 3),
        estado.field(),
      ],
      guardar: () => api.fn('savePlan', <String, dynamic>{
        if (esEdicion) 'id': texto(plan['id']),
        'name': nombre.text,
        'description': descripcion.text,
        'monthlyPrice': numero(mensual.text),
        'setupPrice': numero(puesta.text),
        'code': codigo.text,
        'currency': moneda.valor,
        'periodicity': periodicidad.valor,
        'status': estado.valor,
        'features': features.text,
        'limits': limits.text,
        'metadata': metadata.text,
        'validFrom': desde.text,
        'validTo': hasta.text,
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Plan guardado.');
    onCambio();
  }
}
