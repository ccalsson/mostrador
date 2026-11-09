import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _fuentes = ['Inter', 'Poppins', 'Roboto', 'Montserrat', 'Playfair Display'];

const _templates = <(String, String, String)>[
  ('clasico', 'Clásico', 'Layout tradicional con header y sidebar'),
  ('moderno', 'Moderno', 'Full-width con cards grandes'),
  ('minimal', 'Minimal', 'Espacios limpios, tipografía grande'),
  ('vibrante', 'Vibrante', 'Colores fuertes, gradientes'),
];

const _defectos = {
  'colorPrimario': '#1a7a4c',
  'colorSecundario': '#e3c56a',
  'colorFondo': '#ffffff',
  'colorTexto': '#1a1a1a',
};

List<dynamic> _lista(dynamic v) => v is List ? v : const [];

Map<String, dynamic> _mapa(dynamic v) =>
    v is Map<String, dynamic> ? v : (v is Map ? v.map((k, val) => MapEntry(k.toString(), val)) : <String, dynamic>{});

Color? _hex(String v) {
  final m = RegExp(r'^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$').firstMatch(v.trim());
  if (m == null) return null;
  var digitos = m.group(1)!;
  if (digitos.length == 3) digitos = digitos.split('').map((d) => '$d$d').join();
  return Color(0xFF000000 | int.parse(digitos, radix: 16));
}

String _colorSalvado(String? valor, String clave) => (valor == null || valor.isEmpty) ? _defectos[clave]! : valor;

typedef _FilasWhiteLabel = ({List<dynamic> tenants, Map<String, Map<String, dynamic>> configs});

class PantallaWhiteLabel extends StatefulWidget {
  const PantallaWhiteLabel({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaWhiteLabel> createState() => _PantallaWhiteLabelState();
}

class _PantallaWhiteLabelState extends State<PantallaWhiteLabel> {
  int _version = 0;

  Future<_FilasWhiteLabel> _cargar() async {
    final resultados = await Future.wait<Object>(<Future<Object>>[
      widget.api.fnLista('listTenants'),
      widget.api.fnLista('listarWhiteLabel'),
    ]);
    final configs = <String, Map<String, dynamic>>{};
    for (final c in _lista(resultados[1])) {
      configs[texto(c['tenantId'])] = _mapa(c);
    }
    return (tenants: _lista(resultados[0]), configs: configs);
  }

  void _abrirEditor(dynamic tenant, Map<String, dynamic>? config) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => _EditorWhiteLabel(
          api: widget.api,
          tenantId: texto(tenant['id']),
          tenantNombre: texto(tenant['name']),
          clientNombre: texto(tenant['clientName']),
          config: config,
          onCambio: () {
            if (mounted) setState(() => _version++);
          },
        ),
      ),
    );
  }

  void _abrirPreview(dynamic tenant) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => _PreviewWhiteLabel(api: widget.api, tenantId: texto(tenant['id']), tenantNombre: texto(tenant['name'])),
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
          'Marca, colores y dominio propio de cada negocio publicado.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        VistaDatos<_FilasWhiteLabel>(
          key: ValueKey('white-label-$_version'),
          cargar: _cargar,
          builder: (context, d) {
            if (d.tenants.isEmpty) return Text('No hay negocios registrados.', style: TextStyle(color: c.muted, fontSize: 13));
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('${d.tenants.length} negocios · ${d.configs.length} con marca configurada', style: TextStyle(fontSize: 12, color: c.muted)),
                const SizedBox(height: 8),
                for (final t in d.tenants)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _fila(t, d.configs[texto(t['id'])]),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _fila(dynamic tenant, Map<String, dynamic>? config) {
    final c = torreColorsOf(context);
    final dominio = texto(config?['dominioPropio']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(texto(tenant['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    Text(texto(tenant['clientName']), style: TextStyle(color: c.muted, fontSize: 12)),
                  ],
                ),
              ),
              if (config == null)
                ChipEstado('Sin configurar', activo: false)
              else
                Wrap(
                  spacing: 4,
                  children: [
                    for (final clave in const ['colorPrimario', 'colorSecundario', 'colorFondo'])
                      _muestra(_colorSalvado(texto(config[clave]), clave)),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  config == null
                      ? 'Sin marca'
                      : '${texto(config['marcaNombre'])}${dominio.isEmpty ? '' : ' · $dominio'}',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: config == null ? c.muted : c.inkSoft, fontSize: 13),
                ),
              ),
              if (config != null)
                IconButton(
                  tooltip: 'Vista previa',
                  icon: Icon(Icons.visibility_outlined, size: 20, color: c.muted),
                  onPressed: () => _abrirPreview(tenant),
                ),
              TextButton(
                onPressed: () => _abrirEditor(tenant, config),
                child: Text(config == null ? 'Configurar' : 'Editar'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _muestra(String hex) => Container(
        width: 18,
        height: 18,
        decoration: BoxDecoration(
          color: _hex(hex),
          border: Border.all(color: torreColorsOf(context).line),
          borderRadius: BorderRadius.circular(4),
        ),
      );
}

class _EditorWhiteLabel extends StatefulWidget {
  const _EditorWhiteLabel({
    required this.api,
    required this.tenantId,
    required this.tenantNombre,
    required this.clientNombre,
    required this.config,
    required this.onCambio,
  });
  final TorreApi api;
  final String tenantId;
  final String tenantNombre;
  final String clientNombre;
  final Map<String, dynamic>? config;
  final VoidCallback onCambio;

  @override
  State<_EditorWhiteLabel> createState() => _EditorWhiteLabelState();
}

class _EditorWhiteLabelState extends State<_EditorWhiteLabel> {
  late final TextEditingController _marca = TextEditingController(text: widget.config == null ? widget.tenantNombre : texto(widget.config!['marcaNombre']));
  final _logo = TextEditingController();
  late final TextEditingController _primario = TextEditingController(text: _colorSalvado(texto(widget.config?['colorPrimario']), 'colorPrimario'));
  late final TextEditingController _secundario = TextEditingController(text: _colorSalvado(texto(widget.config?['colorSecundario']), 'colorSecundario'));
  late final TextEditingController _fondo = TextEditingController(text: _colorSalvado(texto(widget.config?['colorFondo']), 'colorFondo'));
  late final TextEditingController _texto = TextEditingController(text: _colorSalvado(texto(widget.config?['colorTexto']), 'colorTexto'));
  final _dominio = TextEditingController();
  late String _fuente = _fuentes.contains(texto(widget.config?['fuente'])) ? texto(widget.config!['fuente']) : _fuentes.first;
  late String _template = _templates.any((t) => t.$1 == texto(widget.config?['template'])) ? texto(widget.config!['template']) : _templates.first.$1;
  late bool _dominioActivo = widget.config?['dominioActivo'] == true;
  bool _guardando = false;
  bool _esEdicion = false;

  @override
  void initState() {
    super.initState();
    _logo.text = texto(widget.config?['logoUrl']);
    _dominio.text = texto(widget.config?['dominioPropio']);
    _esEdicion = widget.config != null;
  }

  @override
  void dispose() {
    for (final controlador in <TextEditingController>[_marca, _logo, _primario, _secundario, _fondo, _texto, _dominio]) {
      controlador.dispose();
    }
    super.dispose();
  }

  Map<String, dynamic> _cuerpo() => <String, dynamic>{
        'marcaNombre': _marca.text,
        'logoUrl': _logo.text,
        'colorPrimario': _primario.text,
        'colorSecundario': _secundario.text,
        'colorFondo': _fondo.text,
        'colorTexto': _texto.text,
        'fuente': _fuente,
        'template': _template,
        'dominioPropio': _dominio.text,
        'dominioActivo': _dominioActivo,
      };

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      await widget.api.fn('guardarWhiteLabel', <String, dynamic>{'tenantId': widget.tenantId, ..._cuerpo()});
      if (!mounted) return;
      aviso(context, 'Configuración guardada.');
      widget.onCambio();
      setState(() => _esEdicion = true);
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _eliminar() async {
    if (!await confirmarTorre(context, 'Eliminar config', '${widget.tenantNombre} vuelve a la marca por defecto.')) return;
    setState(() => _guardando = true);
    try {
      await widget.api.fn('eliminarWhiteLabel', <String, dynamic>{'tenantId': widget.tenantId});
      if (!mounted) return;
      aviso(context, 'Configuración eliminada.');
      widget.onCambio();
      Navigator.pop(context);
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  TextField _campo(TextEditingController controlador, String etiqueta, {TextInputType teclado = TextInputType.text, String? ayuda}) {
    return TextField(
      controller: controlador,
      keyboardType: teclado,
      onChanged: (_) => setState(() {}),
      decoration: InputDecoration(labelText: etiqueta, helperText: ayuda),
    );
  }

  Widget _campoColor(String etiqueta, TextEditingController controlador) {
    final c = torreColorsOf(context);
    final color = _hex(controlador.text);
    return Row(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: color ?? c.paper2,
            border: Border.all(color: color == null ? c.terra : c.line),
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _campo(
            controlador,
            etiqueta,
            ayuda: color == null ? 'Hex inválido' : null,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final formulario = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Tarjeta(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Configuración de marca', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
              const SizedBox(height: 10),
              _campo(
                _marca,
                'Nombre de marca',
                ayuda: _marca.text.length > 55 ? '${60 - _marca.text.length} caracteres restantes' : null,
              ),
              const SizedBox(height: 12),
              _campo(_logo, 'Logo URL', teclado: TextInputType.url, ayuda: 'https://ejemplo.com/logo.png'),
              const SizedBox(height: 12),
              _campoColor('Color primario', _primario),
              const SizedBox(height: 10),
              _campoColor('Color secundario', _secundario),
              const SizedBox(height: 10),
              _campoColor('Color de fondo', _fondo),
              const SizedBox(height: 10),
              _campoColor('Color de texto', _texto),
              const SizedBox(height: 12),
              Desplegable(
                label: 'Fuente',
                valor: _fuente,
                opciones: _fuentes,
                onChanged: (v) => setState(() => _fuente = v),
              ),
              const SizedBox(height: 12),
              Text('Template', style: TextStyle(color: c.muted, fontSize: 13)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [for (final (id, etiqueta, descripcion) in _templates) _tarjetaTemplate(id, etiqueta, descripcion)],
              ),
              const SizedBox(height: 12),
              _campo(_dominio, 'Dominio propio', teclado: TextInputType.url, ayuda: 'negocio.litoral.solutions'),
              const SizedBox(height: 4),
              Row(
                children: [
                  Checkbox(
                    value: _dominioActivo,
                    onChanged: (v) => setState(() => _dominioActivo = v ?? false),
                  ),
                  Text('Dominio activo', style: TextStyle(color: c.ink, fontSize: 14)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            SizedBox(width: 160, child: BotonPrimario('Guardar', _guardando ? null : _guardar, ocupado: _guardando)),
            const Spacer(),
            if (_esEdicion)
              TextButton(
                onPressed: _guardando ? null : _eliminar,
                child: Text('Eliminar config', style: TextStyle(color: c.terra)),
              ),
          ],
        ),
      ],
    );

    final preview = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Vista previa', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
        const SizedBox(height: 8),
        _Prevista(
          marca: _marca.text,
          logo: _logo.text,
          primario: _primario.text,
          secundario: _secundario.text,
          fondo: _fondo.text,
          colorTexto: _texto.text,
          fuente: _fuente,
          dominio: _dominio.text.trim(),
        ),
        const SizedBox(height: 10),
        Text('${widget.tenantNombre} · ${widget.clientNombre}', style: TextStyle(color: c.muted, fontSize: 12)),
      ],
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.tenantNombre, overflow: TextOverflow.ellipsis),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, restricciones) {
            if (restricciones.maxWidth >= 900) {
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: SingleChildScrollView(padding: const EdgeInsets.all(12), child: _limitado(formulario))),
                  Expanded(child: SingleChildScrollView(padding: const EdgeInsets.all(12), child: _limitado(preview))),
                ],
              );
            }
            return SingleChildScrollView(
              padding: const EdgeInsets.all(12),
              child: _limitado(
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [formulario, const SizedBox(height: 18), preview],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _limitado(Widget child) => Center(
        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: child),
      );

  Widget _tarjetaTemplate(String id, String etiqueta, String descripcion) {
    final c = torreColorsOf(context);
    final elegido = _template == id;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => setState(() => _template = id),
      child: Container(
        width: 190,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: elegido ? c.okBg : c.surface,
          border: Border.all(color: elegido ? c.leaf : c.line),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(etiqueta, style: TextStyle(color: c.ink, fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 2),
            Text(descripcion, style: TextStyle(color: c.muted, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}

class _PreviewWhiteLabel extends StatefulWidget {
  const _PreviewWhiteLabel({required this.api, required this.tenantId, required this.tenantNombre});
  final TorreApi api;
  final String tenantId;
  final String tenantNombre;

  @override
  State<_PreviewWhiteLabel> createState() => _PreviewWhiteLabelState();
}

class _PreviewWhiteLabelState extends State<_PreviewWhiteLabel> {
  int _version = 0;

  Future<Map<String, dynamic>> _cargar() async => _mapa(await widget.api.fn('previewWhiteLabel', <String, dynamic>{'tenantId': widget.tenantId}));

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Scaffold(
      appBar: AppBar(
        title: Text('Preview · ${widget.tenantNombre}', overflow: TextOverflow.ellipsis),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: VistaDatos<Map<String, dynamic>>(
                key: ValueKey('preview-$_version'),
                cargar: _cargar,
                builder: (context, config) {
                  if (config.isEmpty) {
                    return Text('Este negocio todavía no tiene marca configurada.', style: TextStyle(color: c.muted, fontSize: 13));
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _Prevista(
                        marca: texto(config['marcaNombre']),
                        logo: texto(config['logoUrl']),
                        primario: texto(config['colorPrimario']),
                        secundario: texto(config['colorSecundario']),
                        fondo: texto(config['colorFondo']),
                        colorTexto: texto(config['colorTexto']),
                        fuente: texto(config['fuente']),
                        dominio: texto(config['dominioPropio']),
                      ),
                      const SizedBox(height: 12),
                      Tarjeta(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            LineaDato('Negocio', texto(config['tenantNombre'])),
                            LineaDato('Cliente', texto(config['clientNombre'])),
                            LineaDato('Template', _etiquetaTemplate(texto(config['template']))),
                            LineaDato('Fuente', texto(config['fuente'])),
                            LineaDato('Dominio', texto(config['dominioPropio']).isEmpty ? '—' : texto(config['dominioPropio'])),
                            LineaDato('Actualizado', fmtFecha(config['updatedAt'])),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      Align(alignment: Alignment.centerRight, child: TextButton(onPressed: () => setState(() => _version++), child: const Text('Refrescar'))),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _etiquetaTemplate(String id) {
  for (final t in _templates) {
    if (t.$1 == id) return t.$2;
  }
  return id.isEmpty ? '—' : id;
}

/// Mockup de la tienda publicada con los colores de la marca aplicados.
class _Prevista extends StatelessWidget {
  const _Prevista({
    required this.marca,
    required this.primario,
    required this.secundario,
    required this.fondo,
    required this.colorTexto,
    this.logo = '',
    this.fuente = 'Inter',
    this.dominio = '',
  });

  final String marca;
  final String logo;
  final String primario;
  final String secundario;
  final String fondo;
  final String colorTexto;
  final String fuente;
  final String dominio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final primarioColor = _hex(primario) ?? const Color(0xFF1A7A4C);
    final secundarioColor = _hex(secundario) ?? const Color(0xFFE3C56A);
    final fondoColor = _hex(fondo) ?? Colors.white;
    final textoColor = _hex(colorTexto) ?? const Color(0xFF1A1A1A);
    final sobrePrimario = primarioColor.computeLuminance() > .5 ? textoColor : Colors.white;
    final nombre = marca.trim().isEmpty ? 'Tu marca' : marca.trim();

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: fondoColor, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: primarioColor,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                if (logo.trim().isNotEmpty) ...[
                  Image.network(
                    logo.trim(),
                    height: 26,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => const SizedBox.shrink(),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: Text(
                    nombre,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: sobrePrimario, fontFamily: fuente, fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Bienvenido a nuestra tienda. Descubre productos únicos seleccionados para vos.',
                  style: TextStyle(color: textoColor.withValues(alpha: .7), fontFamily: fuente, fontSize: 12),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    border: Border.all(color: secundarioColor.withValues(alpha: .4)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: secundarioColor.withValues(alpha: .3),
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Producto destacado', style: TextStyle(color: textoColor, fontFamily: fuente, fontSize: 13)),
                            Text('Descripción breve del producto', style: TextStyle(color: textoColor.withValues(alpha: .6), fontFamily: fuente, fontSize: 11)),
                            Text('\$ 1.500,00', style: TextStyle(color: primarioColor, fontFamily: fuente, fontSize: 13, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      decoration: BoxDecoration(color: primarioColor, borderRadius: BorderRadius.circular(8)),
                      child: Text('Comprar ahora', style: TextStyle(color: sobrePrimario, fontFamily: fuente, fontSize: 13)),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      decoration: BoxDecoration(
                        border: Border.all(color: secundarioColor),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('Ver más', style: TextStyle(color: textoColor, fontFamily: fuente, fontSize: 13)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(border: Border(top: BorderSide(color: secundarioColor.withValues(alpha: .3)))),
            child: Text(
              dominio.isEmpty ? 'tu-negocio.litoral.solutions' : dominio,
              style: TextStyle(color: textoColor.withValues(alpha: .5), fontFamily: fuente, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}
