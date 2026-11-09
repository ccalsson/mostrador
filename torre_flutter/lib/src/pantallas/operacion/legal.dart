import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

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

const _audiencias = [
  _Opcion('saas_b2b', 'Puesto (SaaS)'),
  _Opcion('mercado_comprador', 'Comprador'),
  _Opcion('mercado_cargador', 'Cargador'),
  _Opcion('privacy', 'Privacidad'),
  _Opcion('other', 'Otro'),
];

const _estadosDocumento = [
  _Opcion('draft', 'Borrador'),
  _Opcion('published', 'Publicado'),
  _Opcion('archived', 'Archivado'),
];

const _estadosEtiqueta = {'draft': 'Borrador', 'published': 'Publicado', 'archived': 'Archivado', 'pending': 'Pendiente', 'accepted': 'Aceptado', 'superseded': 'Reemplazado'};

class _LegalDatos {
  _LegalDatos(this.legal, this.tenants);
  final Map<String, dynamic> legal;
  final List<dynamic> tenants;
}

class PantallaLegal extends StatefulWidget {
  const PantallaLegal({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaLegal> createState() => _PantallaLegalState();
}

class _PantallaLegalState extends State<PantallaLegal> {
  int _version = 0;

  Future<_LegalDatos> _cargar() async {
    final legal = await widget.api.fnMapa('listLegal');
    final tenants = await widget.api.fnLista('listTenants');
    return _LegalDatos(legal, tenants);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_LegalDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _LegalVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _LegalVista extends StatefulWidget {
  const _LegalVista({required this.datos, required this.api, required this.onCambio});
  final _LegalDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_LegalVista> createState() => _LegalVistaState();
}

class _LegalVistaState extends State<_LegalVista> {
  List<dynamic> get _documentos => widget.datos.legal['documents'] as List? ?? const [];
  List<dynamic> get _versiones => widget.datos.legal['versions'] as List? ?? const [];
  List<dynamic> get _contratos => widget.datos.legal['contracts'] as List? ?? const [];
  List<dynamic> get _aceptaciones => widget.datos.legal['acceptances'] as List? ?? const [];
  List<dynamic> get _publicadas => _versiones.where((v) => texto(v['status']) == 'published').toList();

  String _titulo(String id) {
    for (final d in _documentos) {
      if (texto(d['id']) == id) return texto(d['title']);
    }
    return id;
  }

  String _audiencia(String valor) {
    for (final a in _audiencias) {
      if (a.id == valor) return a.label;
    }
    return valor;
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Un borrador no se ofrece y no aparece para aceptar. Publicar calcula el hash en el servidor. '
          'Una versión publicada no se reescribe. La aceptación es electrónica, no una firma certificada, y Torre no genera PDF.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 16),
        _Encabezado(
          titulo: 'Documentos (${_documentos.length})',
          accion: BotonPrimario('Nuevo', _formularioDocumento),
        ),
        if (_documentos.isEmpty) _Vacio('Todavía no hay documentos legales.') else ...[
          for (final d in _documentos) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjetaDocumento(d)),
        ],
        const SizedBox(height: 16),
        _Encabezado(
          titulo: 'Versiones (${_versiones.length})',
          accion: BotonPrimario('Publicar versión', _formularioVersion),
        ),
        if (_versiones.isEmpty)
          _Vacio('Todavía no hay versiones. Un documento en borrador no se puede aceptar.')
        else
          for (final v in _versiones) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjetaVersion(v)),
        const SizedBox(height: 16),
        _Encabezado(
          titulo: 'Contratos del puesto (${_contratos.length})',
          accion: BotonPrimario(
            'Ofrecer al puesto',
            _publicadas.isEmpty || widget.datos.tenants.isEmpty ? null : _formularioOfrecer,
          ),
        ),
        Text(
          'Solo versiones publicadas de la relación con el puesto o de privacidad. El comprador y el cargador aceptan en Mercado al Toque, no acá.',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
        const SizedBox(height: 8),
        if (_contratos.isEmpty) _Vacio('Nadie tiene un contrato ofrecido.') else ...[
          for (final ct in _contratos) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjetaContrato(ct)),
        ],
        const SizedBox(height: 16),
        _Subtitulo('Aceptaciones (${_aceptaciones.length})'),
        if (_aceptaciones.isEmpty) _Vacio('Todavía no hay aceptaciones.') else ...[
          for (final a in _aceptaciones) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjetaAceptacion(a)),
        ],
      ],
    );
  }

  Widget _tarjetaDocumento(dynamic d) {
    final c = torreColorsOf(context);
    final publicado = texto(d['status']) == 'published';
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(texto(d['title']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
              ChipEstado(_estadosEtiqueta[texto(d['status'])] ?? texto(d['status']), activo: publicado),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${texto(d['code'])} · ${_audiencia(texto(d['audience']))} · reaceptar: ${d['reacceptOnChange'] == true ? 'sí' : 'no'}',
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: () => _formularioDocumento(d), child: const Text('Editar')),
          ),
        ],
      ),
    );
  }

  Widget _tarjetaVersion(dynamic v) {
    final c = torreColorsOf(context);
    final publicada = texto(v['status']) == 'published';
    final cuerpo = texto(v['body']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${_titulo(texto(v['documentId']))} · ${texto(v['label'])}',
                  style: TextStyle(color: c.ink, fontWeight: FontWeight.w600),
                ),
              ),
              ChipEstado(_estadosEtiqueta[texto(v['status'])] ?? texto(v['status']), activo: publicada),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              publicada && texto(v['publishedAt']).isNotEmpty ? 'Publicada ${texto(v['publishedAt'])}' : 'Sin fecha de publicación',
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: SelectableText(texto(v['hash']), style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
          ),
          if (cuerpo.isNotEmpty)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: const EdgeInsets.only(bottom: 6),
                collapsedIconColor: c.muted,
                title: Text('Texto publicado', style: TextStyle(fontSize: 12, color: c.leaf)),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: SelectableText(cuerpo, style: TextStyle(fontSize: 12, color: c.muted)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _tarjetaContrato(dynamic ct) {
    final c = torreColorsOf(context);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(texto(ct['tenantName']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${_titulo(texto(ct['documentId']))} · ${_estadosEtiqueta[texto(ct['status'])] ?? texto(ct['status'])}',
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: SelectableText(texto(ct['hash']), style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
          ),
        ],
      ),
    );
  }

  Widget _tarjetaAceptacion(dynamic a) {
    final c = torreColorsOf(context);
    final quien = texto(a['email']).isNotEmpty ? texto(a['email']) : (texto(a['tenantId']).isNotEmpty ? texto(a['tenantId']) : 'sin correo');
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(quien, style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text('${texto(a['action'])} · ${texto(a['at'])}', style: TextStyle(color: c.muted, fontSize: 12)),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: SelectableText(texto(a['hash']), style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
          ),
        ],
      ),
    );
  }

  Future<void> _formularioDocumento([dynamic doc]) async {
    final esEdicion = doc != null;
    final code = TextEditingController(text: esEdicion ? texto(doc['code']) : '');
    final title = TextEditingController(text: esEdicion ? texto(doc['title']) : '');
    final audiencia = _Selector('Audiencia', _audiencias, esEdicion ? texto(doc['audience']) : 'saas_b2b');
    final estado = _Selector('Estado', _estadosDocumento, esEdicion ? texto(doc['status']) : 'draft');
    var reaceptar = esEdicion ? doc['reacceptOnChange'] == true : true;
    final guardado = await mostrarFormulario(
      context,
      titulo: esEdicion ? 'Guardar cambios' : 'Guardar documento',
      campos: [
        Campo(controller: code, label: 'Código'),
        Campo(controller: title, label: 'Título'),
        audiencia.field(),
        estado.field(),
        _Casilla(label: 'Exigir nueva aceptación si cambia', inicial: reaceptar, onCambio: (v) => reaceptar = v),
      ],
      guardar: () => widget.api.fn('saveDocument', <String, dynamic>{
        if (esEdicion) 'id': texto(doc['id']),
        'code': code.text.trim(),
        'title': title.text.trim(),
        'audience': audiencia.valor,
        'reacceptOnChange': reaceptar,
        'status': estado.valor,
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Documento guardado.');
    widget.onCambio();
  }

  Future<void> _formularioVersion() async {
    final disponibles = _documentos.where((d) => texto(d['status']) != 'archived').toList();
    if (disponibles.isEmpty) {
      aviso(context, 'No hay documentos sin archivar para publicar.');
      return;
    }
    final documento = _Selector('Documento', [for (final d in disponibles) _Opcion(texto(d['id']), texto(d['title']))], '');
    final label = TextEditingController(text: '1.0');
    final body = TextEditingController();
    var hash = '';
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Publicar versión',
      campos: [
        documento.field(),
        Campo(controller: label, label: 'Etiqueta'),
        Campo(controller: body, label: 'Texto', lineas: 6),
      ],
      guardar: () async {
        final res = await widget.api.fnMapa('publishVersion', <String, dynamic>{
          'documentId': documento.valor,
          'label': label.text.trim(),
          'body': body.text,
        });
        hash = texto(res['hash']);
      },
    );
    if (!guardado || !mounted) return;
    aviso(context, hash.isEmpty ? 'Publicada.' : 'Publicada. Hash $hash');
    widget.onCambio();
  }

  Future<void> _formularioOfrecer() async {
    final publicados = _publicadas;
    final tenant = _Selector(
      'Tenant',
      [for (final t in widget.datos.tenants) _Opcion(texto(t['id']), texto(t['name']))],
      '',
    );
    final version = _Selector(
      'Versión publicada',
      [for (final v in publicados) _Opcion(texto(v['id']), '${_titulo(texto(v['documentId']))} ${texto(v['label'])}')],
      '',
    );
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Ofrecer al puesto',
      campos: [tenant.field(), version.field()],
      guardar: () => widget.api.fn('offerContract', <String, dynamic>{
        'tenantId': tenant.valor,
        'versionId': version.valor,
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Quedó pendiente para ese tenant');
    widget.onCambio();
  }
}

class _Casilla extends StatefulWidget {
  const _Casilla({required this.label, required this.inicial, required this.onCambio});
  final String label;
  final bool inicial;
  final ValueChanged<bool> onCambio;

  @override
  State<_Casilla> createState() => _CasillaState();
}

class _CasillaState extends State<_Casilla> {
  late bool _valor = widget.inicial;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () {
        setState(() => _valor = !_valor);
        widget.onCambio(_valor);
      },
      child: Row(
        children: [
          Checkbox(
            value: _valor,
            onChanged: (v) {
              setState(() => _valor = v ?? _valor);
              widget.onCambio(_valor);
            },
          ),
          Expanded(child: Text(widget.label, style: TextStyle(fontSize: 14, color: c.ink))),
        ],
      ),
    );
  }
}

class _Encabezado extends StatelessWidget {
  const _Encabezado({required this.titulo, required this.accion});
  final String titulo;
  final Widget accion;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(child: Text(titulo, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink))),
          SizedBox(width: 150, child: accion),
        ],
      ),
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

class _Vacio extends StatelessWidget {
  const _Vacio(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(texto, style: TextStyle(color: c.muted, fontSize: 13)),
    );
  }
}
