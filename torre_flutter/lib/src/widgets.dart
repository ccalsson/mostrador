import 'dart:async';

import 'package:flutter/material.dart';

import 'tema.dart';

String texto(dynamic v) => v == null ? '' : v.toString();

double numero(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse(texto(v).replaceAll(',', '.')) ?? 0;
}

String fmtMoneda(dynamic v, [String currency = '']) {
  final n = numero(v);
  final partes = n.toStringAsFixed(2).split('.');
  final entero = partes[0];
  final buffer = StringBuffer();
  for (var i = 0; i < entero.length; i++) {
    if (i > 0 && (entero.length - i) % 3 == 0) buffer.write('.');
    buffer.write(entero[i]);
  }
  final monto = '${buffer.toString()},${partes[1]}';
  return currency.isEmpty ? monto : '$currency $monto';
}

String fmtFecha(dynamic v) {
  final iso = texto(v);
  if (iso.length < 10) return iso;
  final d = iso.substring(0, 10).split('-');
  if (d.length != 3) return iso;
  return '${d[2]}/${d[1]}/${d[0]}';
}

void aviso(BuildContext context, String mensaje) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(mensaje)));
}

class TituloPagina extends StatelessWidget {
  const TituloPagina(this.titulo, {super.key, this.bajada});
  final String titulo;
  final String? bajada;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(titulo, style: TextStyle(fontFamily: 'serif', fontSize: 24, fontWeight: FontWeight.w600, color: c.ink)),
        if (bajada != null) ...[
          const SizedBox(height: 4),
          Text(bajada!, style: TextStyle(fontSize: 13, color: c.muted)),
        ],
      ],
    );
  }
}

class Tarjeta extends StatelessWidget {
  const Tarjeta({super.key, required this.child, this.padding = const EdgeInsets.all(14)});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border.all(color: c.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: child,
    );
  }
}

class LineaDato extends StatelessWidget {
  const LineaDato(this.etiqueta, this.valor, {super.key});
  final String etiqueta;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(etiqueta, style: TextStyle(color: c.muted, fontSize: 13))),
          Expanded(child: Text(valor.isEmpty ? '—' : valor, style: TextStyle(color: c.ink, fontSize: 14))),
        ],
      ),
    );
  }
}

class ChipEstado extends StatelessWidget {
  const ChipEstado(this.etiqueta, {super.key, this.activo = true});
  final String etiqueta;
  final bool activo;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: activo ? c.okBg : c.warnBg,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Text(etiqueta, style: TextStyle(fontSize: 12, color: activo ? c.ok : c.terra)),
    );
  }
}

class Campo extends StatelessWidget {
  const Campo({
    super.key,
    required this.controller,
    required this.label,
    this.teclado = TextInputType.text,
    this.clave = false,
    this.lineas = 1,
    this.ayuda,
  });

  final TextEditingController controller;
  final String label;
  final TextInputType teclado;
  final bool clave;
  final int lineas;
  final String? ayuda;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: teclado,
      obscureText: clave,
      maxLines: lineas,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(labelText: label, helperText: ayuda),
    );
  }
}

class Desplegable extends StatelessWidget {
  const Desplegable({super.key, required this.label, required this.valor, required this.opciones, required this.onChanged});
  final String label;
  final String valor;
  final List<String> opciones;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final actual = opciones.contains(valor) ? valor : (opciones.isEmpty ? null : opciones.first);
    return DropdownButtonFormField<String>(
      key: ValueKey('$label-$actual'),
      initialValue: actual,
      decoration: InputDecoration(labelText: label),
      items: [for (final o in opciones) DropdownMenuItem(value: o, child: Text(o))],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}

class BotonPrimario extends StatelessWidget {
  const BotonPrimario(this.etiqueta, this.onPressed, {super.key, this.ocupado = false, this.peligro = false});
  final String etiqueta;
  final VoidCallback? onPressed;
  final bool ocupado;
  final bool peligro;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return SizedBox(
      height: 44,
      child: FilledButton(
        onPressed: ocupado ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: peligro ? c.terra : c.leaf,
          foregroundColor: c.leafFg,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: ocupado
            ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: c.leafFg))
            : Text(etiqueta),
      ),
    );
  }
}

class KpiGrilla extends StatelessWidget {
  const KpiGrilla(this.datos, {super.key});
  final List<(String, String)> datos;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final columnas = constraints.maxWidth > 700 ? 4 : 2;
        final ancho = (constraints.maxWidth - (columnas - 1) * 10) / columnas;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final (etiqueta, valor) in datos)
              SizedBox(
                width: ancho,
                child: Tarjeta(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(etiqueta, style: TextStyle(fontSize: 12, color: c.muted)),
                      const SizedBox(height: 6),
                      Text(valor, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: c.ink)),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Carga asíncrona de una pantalla: spinner, error con reintento y contenido.
/// Refresca solo cada [intervalo], al recuperar la ventana y al tirar abajo.
/// [autoRefrescar] en falso deja la pantalla sólo con el refresco manual.
class VistaDatos<T> extends StatefulWidget {
  const VistaDatos({
    super.key,
    required this.cargar,
    required this.builder,
    this.autoRefrescar = true,
    this.intervalo = const Duration(seconds: 25),
  });

  final Future<T> Function() cargar;
  final Widget Function(BuildContext context, T datos) builder;
  final bool autoRefrescar;
  final Duration? intervalo;

  @override
  State<VistaDatos<T>> createState() => _VistaDatosState<T>();
}

class _VistaDatosState<T> extends State<VistaDatos<T>> {
  static const double _jaladoMinimo = 64;

  final GlobalKey<RefreshIndicatorState> _refresco = GlobalKey<RefreshIndicatorState>();
  late final AppLifecycleListener _ciclo;
  late Future<T> _futuro;
  Timer? _temporizador;
  T? _ultimo;
  DateTime? _actualizado;
  Object? _fallo;
  bool _enVuelo = false;
  bool _esFondo = false;
  bool _lejos = false;
  double _jalado = 0;
  bool _jalaHecho = false;

  @override
  void initState() {
    super.initState();
    _ciclo = AppLifecycleListener(onResume: _alVolver, onShow: _alVolver, onHide: _alAlejarse, onInactive: _alAlejarse);
    _futuro = _lanzar();
    _armar();
  }

  @override
  void didUpdateWidget(VistaDatos<T> anterior) {
    super.didUpdateWidget(anterior);
    if (anterior.autoRefrescar != widget.autoRefrescar || anterior.intervalo != widget.intervalo) _armar();
  }

  @override
  void dispose() {
    _temporizador?.cancel();
    _ciclo.dispose();
    super.dispose();
  }

  bool get _refrescoAutomatico => widget.autoRefrescar && widget.intervalo != null;

  void _armar() {
    _temporizador?.cancel();
    final intervalo = widget.intervalo;
    if (!widget.autoRefrescar || intervalo == null) return;
    _temporizador = Timer.periodic(intervalo, (_) {
      if (!mounted || _lejos || _enVuelo) return;
      refrescarEnFondo();
    });
  }

  void _alAlejarse() => _lejos = true;

  void _alVolver() {
    if (!mounted) return;
    _lejos = false;
    if (!_refrescoAutomatico) return;
    refrescarEnFondo();
  }

  Future<T> _lanzar({bool fondo = false}) {
    _esFondo = fondo;
    _enVuelo = true;
    final futuro = widget.cargar();
    futuro.then<void>((T datos) {
      if (!mounted) return;
      setState(() {
        _ultimo = datos;
        _fallo = null;
        _actualizado = DateTime.now();
        _enVuelo = false;
      });
    }, onError: (Object error) {
      if (!mounted) return;
      setState(() {
        _fallo = error;
        _enVuelo = false;
      });
    });
    return futuro;
  }

  void recargar() {
    setState(() {
      _futuro = _lanzar();
    });
  }

  void refrescarEnFondo() {
    if (_enVuelo) return;
    setState(() {
      _futuro = _lanzar(fondo: true);
    });
  }

  Future<void> _alTirarAbajo() {
    refrescarEnFondo();
    return _futuro.then<void>((_) {}, onError: (Object _) {});
  }

  void _reiniciarJalado() {
    _jalado = 0;
    _jalaHecho = false;
  }

  void _alArrastrar(double delta) {
    if (delta <= 0) {
      _jalado = 0;
      return;
    }
    final posicion = Scrollable.maybeOf(context)?.position;
    if (posicion != null && posicion.axis == Axis.vertical && posicion.pixels > posicion.minScrollExtent) {
      _jalado = 0;
      return;
    }
    _jalado += delta;
    if (_jalaHecho || _jalado < _jaladoMinimo) return;
    _jalaHecho = true;
    _refresco.currentState?.show();
  }

  Widget _conAntiguedad(BuildContext context, Widget contenido) {
    return LayoutBuilder(
      builder: (context, constro) {
        final flexible = constro.hasBoundedHeight;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: flexible ? MainAxisSize.max : MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _Antiguedad(_actualizado, automatico: _refrescoAutomatico, fallando: _fallo != null),
              ),
            ),
            if (flexible) Expanded(child: contenido) else contenido,
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return RefreshIndicator(
      key: _refresco,
      onRefresh: _alTirarAbajo,
      child: Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: (_) => _reiniciarJalado(),
        onPointerMove: (e) => _alArrastrar(e.delta.dy),
        onPointerUp: (_) => _reiniciarJalado(),
        onPointerCancel: (_) => _reiniciarJalado(),
        child: FutureBuilder<T>(
          future: _futuro,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              if (_esFondo && _ultimo != null) return _conAntiguedad(context, widget.builder(context, _ultimo as T));
              return const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()));
            }
            if (snap.hasError) {
              if (_esFondo && _ultimo != null) return _conAntiguedad(context, widget.builder(context, _ultimo as T));
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${snap.error}', textAlign: TextAlign.center, style: TextStyle(color: c.terra)),
                      const SizedBox(height: 12),
                      TextButton(onPressed: recargar, child: const Text('Reintentar')),
                    ],
                  ),
                ),
              );
            }
            final datos = snap.data;
            if (datos == null) return const SizedBox.shrink();
            return _conAntiguedad(context, widget.builder(context, datos));
          },
        ),
      ),
    );
  }
}

/// Antigüedad de los datos cargados, pensada para que el operador sepa qué tan
/// frescos están los números.
class _Antiguedad extends StatefulWidget {
  const _Antiguedad(this.desde, {required this.automatico, this.fallando = false});

  final DateTime? desde;
  final bool automatico;
  final bool fallando;

  @override
  State<_Antiguedad> createState() => _AntiguedadState();
}

class _AntiguedadState extends State<_Antiguedad> {
  Timer? _tic;

  @override
  void initState() {
    super.initState();
    _tic = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tic?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final color = widget.fallando ? c.terra : c.muted;
    final estilo = TextStyle(fontSize: 11, color: color);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.schedule, size: 12, color: color),
        const SizedBox(width: 4),
        Text(_haceText(widget.desde), style: estilo),
        if (widget.fallando) Text(' · error al refrescar', style: estilo),
        if (!widget.automatico) Text(' · sin refresco automático', style: estilo),
      ],
    );
  }
}

String _haceText(DateTime? desde) {
  if (desde == null) return 'sin datos';
  final segundos = DateTime.now().difference(desde).inSeconds;
  if (segundos < 60) return 'hace ${segundos}s';
  final minutos = segundos ~/ 60;
  if (minutos < 60) return 'hace ${minutos}min';
  return 'hace ${minutos ~/ 60}h';
}

Future<bool> confirmarTorre(BuildContext context, String titulo, String mensaje) async {
  final c = torreColorsOf(context);
  final res = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(titulo),
      content: Text(mensaje),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: Text('Confirmar', style: TextStyle(color: c.terra))),
      ],
    ),
  );
  return res ?? false;
}

/// Diálogo de alta/edición con estado de guardado y error en línea.
/// Devuelve true si se guardó. [guardar] debe llamar a la API y lanzar TorreError si falla.
Future<bool> mostrarFormulario(
  BuildContext context, {
  required String titulo,
  required List<Widget> campos,
  required Future<void> Function() guardar,
}) async {
  final res = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => _FormularioDialogo(titulo: titulo, campos: campos, guardar: guardar),
  );
  return res ?? false;
}

class _FormularioDialogo extends StatefulWidget {
  const _FormularioDialogo({required this.titulo, required this.campos, required this.guardar});
  final String titulo;
  final List<Widget> campos;
  final Future<void> Function() guardar;

  @override
  State<_FormularioDialogo> createState() => _FormularioDialogoState();
}

class _FormularioDialogoState extends State<_FormularioDialogo> {
  bool _ocupado = false;
  String? _error;

  Future<void> _guardar() async {
    setState(() {
      _ocupado = true;
      _error = null;
    });
    try {
      await widget.guardar();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return AlertDialog(
      backgroundColor: c.surface,
      title: Text(widget.titulo),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final campo in widget.campos) Padding(padding: const EdgeInsets.only(bottom: 12), child: campo),
              if (_error != null) Text(_error!, style: TextStyle(color: c.terra, fontSize: 14)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: _ocupado ? null : () => Navigator.pop(context, false), child: const Text('Cancelar')),
        SizedBox(width: 120, child: BotonPrimario('Guardar', _guardar, ocupado: _ocupado)),
      ],
    );
  }
}
