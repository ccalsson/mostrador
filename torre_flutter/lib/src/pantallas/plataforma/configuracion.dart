import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

const _fuentePorDefecto = 'dólar oficial vendedor Banco Nación';

const _roles = <String, String>{
  'administracion': 'Administración',
  'comercial': 'Comercial',
  'legal': 'Legal',
  'soporte': 'Soporte',
  'auditoria': 'Auditoría',
};

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

class _ConfigDatos {
  _ConfigDatos(this.fx, this.cambio, this.acceso);
  final List<dynamic> fx;
  final Map<String, dynamic> cambio;
  final Map<String, dynamic> acceso;

  dynamic get vigente => fx.isEmpty ? null : fx.first;
  Map<String, dynamic> get medio => (cambio['medio'] as Map? ?? const {}).map((k, v) => MapEntry(k.toString(), v));
  List<dynamic> get accounts => acceso['accounts'] as List? ?? const [];
  String get me => texto(acceso['me']);
}

class PantallaConfiguracion extends StatefulWidget {
  const PantallaConfiguracion({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaConfiguracion> createState() => _PantallaConfiguracionState();
}

class _PantallaConfiguracionState extends State<PantallaConfiguracion> {
  int _version = 0;

  Future<_ConfigDatos> _cargar() async {
    final fx = await widget.api.fnLista('listFx');
    final cambio = await widget.api.fnMapa('leerMedioPago');
    final acceso = await widget.api.fnMapa('listAccess');
    return _ConfigDatos(fx, cambio, acceso);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_ConfigDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _ConfigVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _ConfigVista extends StatefulWidget {
  const _ConfigVista({required this.datos, required this.api, required this.onCambio});
  final _ConfigDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_ConfigVista> createState() => _ConfigVistaState();
}

class _ConfigVistaState extends State<_ConfigVista> {
  bool _ocupado = false;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final vigente = widget.datos.vigente;
    final medio = widget.datos.medio;
    final detalle = [
      if (texto(medio['alias']).isNotEmpty) 'alias ${texto(medio['alias'])}',
      if (texto(medio['cbu']).isNotEmpty) 'CBU ${texto(medio['cbu'])}',
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Subtitulo('Tipo de cambio de referencia'),
        Text(
          vigente == null
              ? 'Sin cotización.'
              : '${texto(vigente['source'])}: ${texto(vigente['usdArs'])} ARS por USD al ${texto(vigente['asOf'])}. No reescribe contratos.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: BotonPrimario('Guardar cotización', () => _formularioFx(context)),
        ),
        const SizedBox(height: 22),
        _Subtitulo('Medios de pago'),
        Text(
          detalle.isEmpty
              ? 'Todavía no hay alias ni CBU. Sin eso el puesto no sabe a dónde transferir.'
              : 'Transferencia: $detalle. El puesto lo ve al contratar.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: BotonPrimario('Editar medio de pago', () => _formularioMedio(context)),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('La tarjeta queda para más adelante.', style: TextStyle(fontSize: 12, color: c.muted)),
        ),
        const SizedBox(height: 22),
        _Subtitulo('Accesos a la Torre'),
        Text('Solo estas cuentas pueden abrir la Torre. El puesto no entra.', style: TextStyle(fontSize: 13, color: c.muted)),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: BotonPrimario('Agregar acceso', () => _formularioAcceso(context)),
        ),
        const SizedBox(height: 14),
        if (widget.datos.accounts.isEmpty)
          Text('Sin cuentas autorizadas.', style: TextStyle(color: c.muted))
        else
          for (final item in widget.datos.accounts)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _cuenta(item),
            ),
      ],
    );
  }

  Widget _cuenta(dynamic item) {
    final c = torreColorsOf(context);
    final esYo = texto(item['email']) == widget.datos.me;
    return Tarjeta(
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${texto(item['email'])} · ${texto(item['role'])}${esYo ? ' · vos' : ''}',
              style: TextStyle(color: c.ink, fontSize: 14),
            ),
          ),
          if (!esYo)
            TextButton(
              onPressed: _ocupado ? null : () => _quitarAcceso(texto(item['email'])),
              child: Text('Quitar', style: TextStyle(color: c.terra)),
            ),
        ],
      ),
    );
  }

  Future<void> _formularioFx(BuildContext context) async {
    final fuente = TextEditingController(text: _fuentePorDefecto);
    final fecha = TextEditingController(text: _iso(DateTime.now()));
    final valor = TextEditingController();
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Cotización de referencia',
      campos: [
        Campo(controller: fuente, label: 'Fuente'),
        _CampoFecha(controller: fecha, label: 'Vigente al'),
        Campo(
          controller: valor,
          label: 'ARS por USD',
          teclado: const TextInputType.numberWithOptions(decimal: true),
        ),
      ],
      guardar: () => widget.api.fn('saveFx', <String, dynamic>{
        'source': fuente.text.trim(),
        'asOf': fecha.text.trim(),
        'usdArs': numero(valor.text),
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Cotización guardada');
    widget.onCambio();
  }

  Future<void> _formularioMedio(BuildContext context) async {
    final medio = widget.datos.medio;
    final alias = TextEditingController(text: texto(medio['alias']));
    final cbu = TextEditingController(text: texto(medio['cbu']));
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Medio de pago',
      campos: [
        Campo(controller: alias, label: 'Alias'),
        Campo(controller: cbu, label: 'CBU, 22 números', teclado: TextInputType.number),
      ],
      guardar: () => widget.api.fn('guardarMedioPago', <String, dynamic>{
        'alias': alias.text.trim(),
        'cbu': cbu.text.replaceAll(RegExp(r'\s'), ''),
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Medio de pago guardado');
    widget.onCambio();
  }

  Future<void> _formularioAcceso(BuildContext context) async {
    final email = TextEditingController();
    final rol = _Selector('Rol', [for (final e in _roles.entries) _Opcion(e.key, e.value)], 'soporte');
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Agregar acceso',
      campos: [
        Campo(controller: email, label: 'correo autorizado', teclado: TextInputType.emailAddress),
        rol.field(),
      ],
      guardar: () => widget.api.fn('addAccess', <String, dynamic>{
        'email': email.text.trim(),
        'role': rol.valor,
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Acceso agregado');
    widget.onCambio();
  }

  Future<void> _quitarAcceso(String email) async {
    final ok = await confirmarTorre(context, 'Quitar acceso', 'Se quita el acceso de $email de la Torre.');
    if (!ok || !mounted) return;
    setState(() => _ocupado = true);
    try {
      await widget.api.fn('removeAccess', email);
      if (!mounted) return;
      aviso(context, 'Acceso quitado');
      widget.onCambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
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
