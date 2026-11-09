import 'package:flutter/material.dart';

import 'api.dart';
import 'destinos.dart';
import 'login.dart';
import 'sesion.dart';
import 'tema.dart';
import 'widgets.dart';

class DestinoTorre {
  const DestinoTorre({required this.id, required this.titulo, required this.grupo, required this.builder});
  final String id;
  final String titulo;
  final String grupo;
  final Widget Function(TorreApi api) builder;
}

class TorreApp extends StatefulWidget {
  const TorreApp({super.key, required this.sesion});
  final SesionTorre sesion;

  @override
  State<TorreApp> createState() => _TorreAppState();
}

class _TorreAppState extends State<TorreApp> {
  ThemeMode _modo = ThemeMode.light;

  @override
  Widget build(BuildContext context) {
    return SesionScope(
      sesion: widget.sesion,
      child: MaterialApp(
        title: 'Torre de Control',
        debugShowCheckedModeBanner: false,
        theme: torreTema(Brightness.light),
        darkTheme: torreTema(Brightness.dark),
        themeMode: _modo,
        home: AnimatedBuilder(
          animation: widget.sesion,
          builder: (context, _) {
            if (!widget.sesion.listo) {
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            }
            if (!widget.sesion.conectado) return const LoginTorre();
            return ConsolaTorre(
              oscuro: _modo == ThemeMode.dark,
              onTema: () => setState(() => _modo = _modo == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark),
            );
          },
        ),
      ),
    );
  }
}

class ConsolaTorre extends StatefulWidget {
  const ConsolaTorre({super.key, required this.oscuro, required this.onTema});
  final bool oscuro;
  final VoidCallback onTema;

  @override
  State<ConsolaTorre> createState() => _ConsolaTorreState();
}

class _ConsolaTorreState extends State<ConsolaTorre> {
  String _actual = 'tablero';

  @override
  Widget build(BuildContext context) {
    final sesion = SesionScope.of(context);
    final destinos = todosLosDestinos();
    final activo = destinos.firstWhere((d) => d.id == _actual, orElse: () => destinos.first);
    final ancho = MediaQuery.of(context).size.width >= 900;
    final contenido = SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(ancho ? 20 : 12),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1200),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: TituloPagina(activo.titulo)),
                    IconButton(
                      tooltip: 'Cambiar tema',
                      onPressed: widget.onTema,
                      icon: Icon(widget.oscuro ? Icons.light_mode_outlined : Icons.dark_mode_outlined, size: 20),
                    ),
                    IconButton(
                      tooltip: 'Salir',
                      onPressed: () async {
                        if (await confirmarTorre(context, 'Salir de la Torre', 'Se cierra la sesión en este dispositivo.')) {
                          await sesion.salir();
                        }
                      },
                      icon: const Icon(Icons.logout, size: 20),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                KeyedSubtree(key: ValueKey(activo.id), child: activo.builder(sesion.api)),
              ],
            ),
          ),
        ),
      ),
    );
    return Scaffold(
      body: ancho
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _PanelTorre(destinos: destinos, actual: activo.id, email: sesion.api.email, role: sesion.api.role, ancho: true, onElegir: _elegir),
                Expanded(child: contenido),
              ],
            )
          : Column(
              children: [
                _PanelTorre(destinos: destinos, actual: activo.id, email: sesion.api.email, role: sesion.api.role, ancho: false, onElegir: _elegir),
                Container(height: 1, color: const Color(0xFFD6CCBB)),
                Expanded(child: contenido),
              ],
            ),
    );
  }

  void _elegir(String id) => setState(() => _actual = id);
}

class _PanelTorre extends StatelessWidget {
  const _PanelTorre({required this.destinos, required this.actual, required this.email, required this.role, required this.ancho, required this.onElegir});
  final List<DestinoTorre> destinos;
  final String actual;
  final String email;
  final String role;
  final bool ancho;
  final ValueChanged<String> onElegir;

  @override
  Widget build(BuildContext context) {
    const fondo = TorreColors.panel;
    const texto = TorreColors.panelTexto;
    final encabezado = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('I N T E R N A', style: TextStyle(color: Color(0xFFC9A227), fontSize: 11, letterSpacing: 2)),
        const SizedBox(height: 4),
        const Text('Torre de Control', style: TextStyle(fontFamily: 'serif', fontSize: 20, color: texto)),
        if (email.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              role.isEmpty ? email : '$email · $role',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: texto.withValues(alpha: 0.6), fontSize: 11),
            ),
          ),
      ],
    );
    if (ancho) {
      final grupos = <String>[];
      for (final d in destinos) {
        if (!grupos.contains(d.grupo)) grupos.add(d.grupo);
      }
      return Container(
        width: 224,
        color: fondo,
        padding: const EdgeInsets.all(14),
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              encabezado,
              const SizedBox(height: 18),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final grupo in grupos) ...[
                        if (grupo.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 14, bottom: 6),
                            child: Text(grupo.toUpperCase(), style: TextStyle(color: texto.withValues(alpha: 0.45), fontSize: 10, letterSpacing: 1.4)),
                          ),
                        for (final d in destinos.where((d) => d.grupo == grupo)) _item(d, texto),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }
    final grupos = <String>[];
    for (final d in destinos) {
      if (!grupos.contains(d.grupo)) grupos.add(d.grupo);
    }
    final grupoActual = destinos.firstWhere((d) => d.id == actual, orElse: () => destinos.first).grupo;
    final itemsDelGrupo = destinos.where((d) => d.grupo == grupoActual).toList();
    return Container(
      color: fondo,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('Torre', style: TextStyle(fontFamily: 'serif', fontSize: 16, color: texto)),
                const Spacer(),
                if (email.isNotEmpty)
                  Flexible(
                    child: Text(
                      role.isEmpty ? email : '$email · $role',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: texto.withValues(alpha: 0.5), fontSize: 10),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [for (final g in grupos) _chipGrupo(g, g == grupoActual, texto)]),
            ),
            if (itemsDelGrupo.length > 1) ...[
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [for (final d in itemsDelGrupo) _item(d, texto, horizontal: true)]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _chipGrupo(String grupo, bool seleccionado, Color texto) {
    final items = destinos.where((d) => d.grupo == grupo).toList();
    final etiqueta = grupo.isEmpty ? (items.isNotEmpty ? items.first.titulo : 'Inicio') : grupo;
    const oro = Color(0xFFC9A227);
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: items.isEmpty ? null : () => onElegir(items.first.id),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: seleccionado ? oro : Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            etiqueta.toUpperCase(),
            style: TextStyle(
              color: seleccionado ? const Color(0xFF1A1612) : texto.withValues(alpha: 0.8),
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
        ),
      ),
    );
  }

  Widget _item(DestinoTorre d, Color texto, {bool horizontal = false}) {
    final seleccionado = d.id == actual;
    return Padding(
      padding: EdgeInsets.only(right: horizontal ? 4 : 0, bottom: horizontal ? 0 : 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => onElegir(d.id),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 10, vertical: horizontal ? 6 : 9),
          decoration: BoxDecoration(
            color: seleccionado ? Colors.white.withValues(alpha: 0.15) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(d.titulo, style: TextStyle(color: seleccionado ? texto : texto.withValues(alpha: 0.75), fontSize: horizontal ? 12 : 13)),
        ),
      ),
    );
  }
}

