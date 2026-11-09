import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _scopes = ['read', 'write', 'webhooks'];
const _eventos = ['pedido.creado', 'pedido.cobrado', 'producto.stock_bajo', 'cliente.creado', 'pago.recibido'];

List<dynamic> _lista(dynamic v) => v is List ? v : const [];

String _fechaHora(dynamic v) {
  final s = texto(v);
  if (s.length < 16) return s;
  return '${s.substring(8, 10)}/${s.substring(5, 7)}/${s.substring(0, 4)} ${s.substring(11, 16)}';
}

typedef _ConClientes = ({List<dynamic> filas, List<dynamic> clientes});

class PantallaApiMarketplace extends StatefulWidget {
  const PantallaApiMarketplace({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaApiMarketplace> createState() => _PantallaApiMarketplaceState();
}

class _PantallaApiMarketplaceState extends State<PantallaApiMarketplace> {
  int _tab = 0;
  int _version = 0;

  Future<_ConClientes> _cargarKeys() async {
    final resultados = await Future.wait<Object>(<Future<Object>>[
      widget.api.fnLista('listarApiKeys'),
      widget.api.fnLista('listClients'),
    ]);
    return (filas: _lista(resultados[0]), clientes: _lista(resultados[1]));
  }

  Future<_ConClientes> _cargarWebhooks() async {
    final resultados = await Future.wait<Object>(<Future<Object>>[
      widget.api.fnLista('listarWebhooks'),
      widget.api.fnLista('listClients'),
    ]);
    return (filas: _lista(resultados[0]), clientes: _lista(resultados[1]));
  }

  Future<void> _nuevaKey(List<dynamic> clientes) async {
    if (clientes.isEmpty) {
      aviso(context, 'Primero registrá un cliente.');
      return;
    }
    if (await _formularioKey(context, widget.api, clientes)) setState(() => _version++);
  }

  Future<void> _nuevoWebhook(List<dynamic> clientes) async {
    if (clientes.isEmpty) {
      aviso(context, 'Primero registrá un cliente.');
      return;
    }
    if (await _formularioWebhook(context, widget.api, clientes)) setState(() => _version++);
  }

  Future<void> _revocar(String id) async {
    if (!await confirmarTorre(context, 'Revocar clave', 'Las integraciones que la usan dejan de responder.')) return;
    try {
      await widget.api.fn('revocarApiKey', <String, dynamic>{'id': id});
      if (!mounted) return;
      aviso(context, 'Clave revocada.');
      setState(() => _version++);
    } catch (e) {
      if (mounted) aviso(context, '$e');
    }
  }

  Future<void> _eliminarWebhook(String id) async {
    if (!await confirmarTorre(context, 'Eliminar webhook', 'Se borra el webhook y su historial de entregas.')) return;
    try {
      await widget.api.fn('eliminarWebhook', <String, dynamic>{'id': id});
      if (!mounted) return;
      aviso(context, 'Webhook eliminado.');
      setState(() => _version++);
    } catch (e) {
      if (mounted) aviso(context, '$e');
    }
  }

  void _abrirLog(dynamic webhook) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => _LogWebhook(api: widget.api, webhookId: texto(webhook['id']), url: texto(webhook['url'])),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Claves de acceso para integraciones externas y notificaciones de eventos.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('API Keys')),
            ButtonSegment(value: 1, label: Text('Webhooks')),
          ],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
        const SizedBox(height: 14),
        if (_tab == 0)
          VistaDatos<_ConClientes>(
            key: ValueKey('keys-$_version'),
            cargar: _cargarKeys,
            builder: (context, d) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _encabezado('${d.filas.length} claves registradas', 'Nueva clave', () => _nuevaKey(d.clientes)),
                if (d.filas.isEmpty) Text('No hay API keys registradas.', style: TextStyle(color: c.muted, fontSize: 13)) else _listaKeys(d.filas),
              ],
            ),
          )
        else
          VistaDatos<_ConClientes>(
            key: ValueKey('webhooks-$_version'),
            cargar: _cargarWebhooks,
            builder: (context, d) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _encabezado('${d.filas.length} webhooks registrados', 'Registrar webhook', () => _nuevoWebhook(d.clientes)),
                if (d.filas.isEmpty) Text('No hay webhooks registrados.', style: TextStyle(color: c.muted, fontSize: 13)) else _listaWebhooks(d.filas),
              ],
            ),
          ),
      ],
    );
  }

  Widget _encabezado(String conteo, String accion, Future<void> Function() onAccion) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(child: Text(conteo, style: TextStyle(fontSize: 13, color: c.muted))),
          SizedBox(width: 200, child: BotonPrimario(accion, onAccion)),
        ],
      ),
    );
  }

  Widget _listaKeys(List<dynamic> keys) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final k in keys)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Opacity(
              opacity: k['activo'] == true ? 1 : .55,
              child: Tarjeta(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(texto(k['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                              Text(texto(k['clientNombre']), style: TextStyle(color: c.muted, fontSize: 12)),
                            ],
                          ),
                        ),
                        ChipEstado(k['activo'] == true ? 'Activa' : 'Revocada', activo: k['activo'] == true),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(child: Text(texto(k['keyPrefix']), style: const TextStyle(fontFamily: 'monospace', fontSize: 12))),
                        Text('${texto(k['rateLimitRpm'])} RPM', style: TextStyle(color: c.muted, fontSize: 12)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        for (final s in _lista(k['scopes'])) ChipEstado(texto(s)),
                        Text(
                          k['ultimoUso'] == null ? 'Nunca usada' : 'Último uso ${fmtFecha(k['ultimoUso'])}',
                          style: TextStyle(color: c.muted, fontSize: 12),
                        ),
                        if (k['activo'] == true)
                          TextButton(onPressed: () => _revocar(texto(k['id'])), child: Text('Revocar', style: TextStyle(color: c.terra))),
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

  Widget _listaWebhooks(List<dynamic> hooks) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final w in hooks)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Opacity(
              opacity: w['activo'] == true ? 1 : .55,
              child: Tarjeta(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            texto(w['url']),
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                          ),
                        ),
                        ChipEstado(w['activo'] == true ? 'Activo' : 'Inactivo', activo: w['activo'] == true),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(texto(w['clientNombre']), style: TextStyle(color: c.muted, fontSize: 12)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [for (final e in _lista(w['eventos'])) ChipEstado(texto(e), activo: false)],
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(onPressed: () => _abrirLog(w), child: const Text('Ver log')),
                        TextButton(
                          onPressed: () => _eliminarWebhook(texto(w['id'])),
                          child: Text('Eliminar', style: TextStyle(color: c.terra)),
                        ),
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
}

class _LogWebhook extends StatefulWidget {
  const _LogWebhook({required this.api, required this.webhookId, required this.url});
  final TorreApi api;
  final String webhookId;
  final String url;

  @override
  State<_LogWebhook> createState() => _LogWebhookState();
}

class _LogWebhookState extends State<_LogWebhook> {
  Future<List<dynamic>> _cargar() =>
      widget.api.fnLista('listarWebhookLog', <String, dynamic>{'webhookId': widget.webhookId, 'limite': 50});

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Entregas'),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(widget.url.isEmpty ? widget.webhookId : widget.url, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                  const SizedBox(height: 12),
                  VistaDatos<List<dynamic>>(
                    cargar: _cargar,
                    builder: (context, filas) {
                      if (filas.isEmpty) return Text('Sin entregas registradas.', style: TextStyle(color: c.muted, fontSize: 13));
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (final r in filas)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Tarjeta(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(child: Text(texto(r['evento']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                                        ChipEstado(r['exito'] == true ? 'OK' : 'Falló', activo: r['exito'] == true),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    LineaDato('Fecha', _fechaHora(r['createdAt'])),
                                    LineaDato('Status', texto(r['statusCode'])),
                                    LineaDato('Respuesta', r['respuestaMs'] == null ? '—' : '${texto(r['respuestaMs'])} ms'),
                                    if (texto(r['error']).isNotEmpty) LineaDato('Error', texto(r['error'])),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Future<bool> _formularioKey(BuildContext context, TorreApi api, List<dynamic> clientes) async {
  final selector = _Selector(clientes);
  final nombre = TextEditingController();
  final rpm = TextEditingController(text: '60');
  final vencimiento = _Vencimiento();
  final seleccion = <String>['read'];
  Map<String, dynamic>? creada;
  final guardado = await mostrarFormulario(
    context,
    titulo: 'Nueva API Key',
    campos: [
      Campo(controller: nombre, label: 'Nombre', ayuda: 'Ej: Integración Shopify'),
      selector.field(label: 'Cliente'),
      _ChipsSelector(label: 'Scopes', opciones: _scopes, seleccionados: seleccion),
      Campo(controller: rpm, label: 'Rate limit (RPM)', teclado: TextInputType.number),
      vencimiento.field(),
    ],
    guardar: () async {
      creada = await api.fnMapa('crearApiKey', <String, dynamic>{
        'clientId': selector.valor,
        'nombre': nombre.text,
        'scopes': seleccion,
        'rateLimitRpm': int.tryParse(rpm.text.trim()) ?? 60,
        'expiresAt': vencimiento.valor,
      });
    },
  );
  if (!guardado || !context.mounted) return false;
  final clave = creada;
  if (clave == null) return true;
  await _mostrarClaveCreada(context, texto(clave['keyPlano']), texto(clave['keyPrefix']));
  return true;
}

Future<bool> _formularioWebhook(BuildContext context, TorreApi api, List<dynamic> clientes) async {
  final selector = _Selector(clientes);
  final url = TextEditingController();
  final seleccion = <String>[];
  return mostrarFormulario(
    context,
    titulo: 'Registrar webhook',
    campos: [
      selector.field(label: 'Cliente'),
      Campo(controller: url, label: 'URL', teclado: TextInputType.url, ayuda: 'https://ejemplo.com/webhook'),
      _ChipsSelector(label: 'Eventos', opciones: _eventos, seleccionados: seleccion),
    ],
    guardar: () => api.fn('crearWebhook', <String, dynamic>{'clientId': selector.valor, 'url': url.text, 'eventos': seleccion}),
  );
}

Future<void> _mostrarClaveCreada(BuildContext context, String plana, String prefijo) async {
  final c = torreColorsOf(context);
  await showDialog<void>(
    context: context,
    builder: (dialogo) => AlertDialog(
      title: const Text('API Key generada'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Es la única vez que se muestra la clave completa. Copiala y guardala en un lugar seguro.',
            style: TextStyle(color: c.terra, fontSize: 13),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(border: Border.all(color: c.line), borderRadius: BorderRadius.circular(8)),
            child: SelectableText(plana.isEmpty ? '—' : plana, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          ),
          const SizedBox(height: 8),
          Text('Prefijo: ${prefijo.isEmpty ? '—' : prefijo}', style: TextStyle(color: c.muted, fontSize: 12)),
        ],
      ),
      actions: [
        TextButton(
          onPressed: plana.isEmpty
              ? null
              : () async {
                    await Clipboard.setData(ClipboardData(text: plana));
                    if (dialogo.mounted) aviso(dialogo, 'Clave copiada.');
                  },
          child: const Text('Copiar'),
        ),
        TextButton(onPressed: () => Navigator.pop(dialogo), child: const Text('Cerrar')),
      ],
    ),
  );
}

class _Opcion {
  const _Opcion(this.id, this.label);
  final String id;
  final String label;
}

/// Si dos clientes comparten nombre se agrega el id: la etiqueta es lo único
/// que devuelve el desplegable y no puede mapear al cliente equivocado.
List<_Opcion> _opcionesDe(List<dynamic> filas) {
  String etiqueta(dynamic f) {
    final negocio = texto(f['businessName']);
    final nombre = texto(f['name']);
    return negocio.isEmpty ? nombre : '$nombre ($negocio)';
  }

  final vistas = <String>{};
  final repetidas = <String>{};
  for (final f in filas) {
    final e = etiqueta(f);
    if (!vistas.add(e)) repetidas.add(e);
  }
  final out = <_Opcion>[];
  for (final f in filas) {
    final e = etiqueta(f);
    final id = texto(f['id']);
    out.add(_Opcion(id, repetidas.contains(e) ? '$e · ${_idCorto(id)}' : e));
  }
  return out;
}

String _idCorto(dynamic v) {
  final s = texto(v);
  return s.length > 8 ? s.substring(0, 8) : s;
}

class _Selector {
  _Selector(List<dynamic> filas) : opciones = _opcionesDe(filas) {
    valor = opciones.isEmpty ? '' : opciones.first.id;
  }

  final List<_Opcion> opciones;
  String valor = '';

  Widget field({required String label}) => Desplegable(
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

class _ChipsSelector extends StatefulWidget {
  const _ChipsSelector({required this.label, required this.opciones, required this.seleccionados});
  final String label;
  final List<String> opciones;
  final List<String> seleccionados;

  @override
  State<_ChipsSelector> createState() => _ChipsSelectorState();
}

class _ChipsSelectorState extends State<_ChipsSelector> {
  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label, style: TextStyle(color: c.muted, fontSize: 13)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            for (final o in widget.opciones)
              FilterChip(
                label: Text(o),
                selected: widget.seleccionados.contains(o),
                onSelected: (ok) => setState(() {
                  if (ok) {
                    widget.seleccionados.add(o);
                  } else {
                    widget.seleccionados.remove(o);
                  }
                }),
              ),
          ],
        ),
      ],
    );
  }
}

class _Vencimiento {
  String? valor;

  Widget field() => _CampoVencimiento(holder: this);
}

class _CampoVencimiento extends StatefulWidget {
  const _CampoVencimiento({required this.holder});
  final _Vencimiento holder;

  @override
  State<_CampoVencimiento> createState() => _CampoVencimientoState();
}

class _CampoVencimientoState extends State<_CampoVencimiento> {
  late final TextEditingController _controlador = TextEditingController(text: widget.holder.valor ?? '');

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _elegir() async {
    final hoy = DateTime.now();
    final inicial = DateTime.tryParse(_controlador.text) ?? hoy.add(const Duration(days: 90));
    final elegida = await showDatePicker(
      context: context,
      initialDate: inicial.isBefore(hoy) ? hoy : inicial,
      firstDate: hoy,
      lastDate: hoy.copyWith(year: hoy.year + 10),
    );
    if (elegida == null) return;
    final textoFecha = elegida.toIso8601String().substring(0, 10);
    setState(() => _controlador.text = textoFecha);
    widget.holder.valor = textoFecha;
  }

  void _limpiar() {
    setState(() => _controlador.text = '');
    widget.holder.valor = null;
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controlador,
      readOnly: true,
      onTap: _elegir,
      decoration: InputDecoration(
        labelText: 'Vence (opcional)',
        helperText: _controlador.text.isEmpty ? 'Sin vencimiento' : null,
        suffixIcon: IconButton(
          icon: Icon(_controlador.text.isEmpty ? Icons.calendar_today_outlined : Icons.clear, size: 20),
          onPressed: _controlador.text.isEmpty ? _elegir : _limpiar,
        ),
      ),
    );
  }
}
