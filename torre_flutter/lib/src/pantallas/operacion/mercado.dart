import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _estadoPedido = <String, String>{
  'borrador': 'Borrador',
  'enviado': 'En caja',
  'en_preparacion': 'Preparando',
  'listo': 'Listo',
  'cobrado': 'Cobrado',
  'anulado': 'Anulado',
  'entregado': 'Entregado',
};

const _formaPago = <String, String>{
  'efectivo': 'Efectivo',
  'transferencia': 'Transferencia',
  'tarjeta': 'Tarjeta',
  'cuenta_corriente': 'Cuenta corriente',
};

const _rolStaff = <String, String>{'admin': 'Dueño', 'cajero': 'Cajero', 'vendedor': 'Vendedor'};

const _recorrido = <String, String>{
  'asignado': 'Asignado',
  'aceptado': 'Aceptado',
  'retirado': 'Retirado',
  'entregado': 'Entregado',
  'cancelado': 'Cancelado',
};

const _tipoCuenta = <String, String>{'cargo': 'Cargos', 'pago': 'Pagos'};

const _tipoStock = <String, String>{
  'entrada_remito': 'Entrada por remito',
  'venta': 'Venta',
  'anulacion_venta': 'Anulación',
  'ajuste': 'Ajuste',
  'merma': 'Merma',
  'reserva': 'Reserva',
  'liberacion': 'Liberación',
};

const _cerrados = <String>{'cobrado', 'entregado'};
const _enCurso = <String>{'enviado', 'en_preparacion', 'listo'};

const _meses = <String>[
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

String _et(Map<String, String> mapa, String clave) => mapa[clave] ?? clave;

String _pesos(dynamic valor) => fmtMoneda(numero(valor), r'$');

double _mayor(double a, double b) => a > b ? a : b;

String _diaCorto(dynamic iso) {
  final partes = texto(iso).split('-');
  return partes.length == 3 ? '${partes[2]}/${partes[1]}' : texto(iso);
}

String _soloFecha(dynamic iso) {
  final valor = texto(iso);
  return valor.length >= 10 ? fmtFecha(valor) : valor;
}

class _Resumen {
  const _Resumen({
    required this.cobrado,
    required this.tickets,
    required this.anulados,
    required this.cerrados,
    required this.curso,
    required this.cancelados,
  });
  final double cobrado;
  final int tickets;
  final int anulados;
  final int cerrados;
  final int curso;
  final int cancelados;
}

_Resumen _resumen(List<dynamic> pedidos, List<dynamic> cobros) {
  int contadas(Set<String> estados) {
    var n = 0;
    for (final p in pedidos) {
      if (estados.contains(texto(p['estado']))) n += numero(p['n']).round();
    }
    return n;
  }

  var cobrado = 0.0;
  var tickets = 0;
  var anulados = 0;
  for (final c in cobros) {
    cobrado += numero(c['monto']);
    tickets += numero(c['n']).round();
    anulados += numero(c['anulados']).round();
  }
  return _Resumen(
    cobrado: cobrado,
    tickets: tickets,
    anulados: anulados,
    cerrados: contadas(_cerrados),
    curso: contadas(_enCurso),
    cancelados: contadas(const {'anulado'}),
  );
}

class PantallaMercado extends StatefulWidget {
  const PantallaMercado({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaMercado> createState() => _PantallaMercadoState();
}

class _PantallaMercadoState extends State<PantallaMercado> {
  static const _rangos = [(1, 'Hoy'), (7, '7 días'), (30, '30 días')];
  int _dias = 7;

  Future<Map<String, dynamic>> _cargar() => widget.api.fnMapa('analiticaOperacion', <String, dynamic>{'dias': _dias});

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Una línea. Las dos apps. Todo lo que ya quedó registrado.',
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
          key: ValueKey('operacion-$_dias'),
          cargar: _cargar,
          builder: (context, datos) => _AnaliticaVista(datos: datos),
        ),
        const SizedBox(height: 18),
        _ComprasPendientes(api: widget.api),
        const SizedBox(height: 18),
        _NumerosNegocios(api: widget.api),
      ],
    );
  }
}

class _AnaliticaVista extends StatelessWidget {
  const _AnaliticaVista({required this.datos});
  final Map<String, dynamic> datos;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final gente = datos['gente'] as Map? ?? const {};
    final mostradorMapa = (datos['mostrador'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final mercadoMapa = (datos['mercado'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final catalogo = datos['catalogo'] as Map? ?? const {};
    final cierres = datos['cierres'] as Map? ?? const {};
    final mostrador = _resumen(mostradorMapa['pedidos'] as List? ?? const [], mostradorMapa['cobros'] as List? ?? const []);
    final mercado = _resumen(mercadoMapa['pedidos'] as List? ?? const [], mercadoMapa['cobros'] as List? ?? const []);
    final personalLinea = (numero(gente['duenosLinea']) + numero(gente['cajerosLinea']) + numero(gente['vendedoresLinea'])).round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Subtitulo('En línea ahora'),
        KpiGrilla([
          ('Puestos en línea · ${texto(gente['puestos'])} registrados', texto(gente['puestosLinea'])),
          (
            'Personal · ${texto(gente['duenosLinea'])} dueños · ${texto(gente['cajerosLinea'])} cajeros · ${texto(gente['vendedoresLinea'])} vendedores',
            '$personalLinea'
          ),
          ('Compradores · ${texto(gente['compradores'])} registrados', texto(gente['compradoresLinea'])),
          (
            'Cargadores · ${texto(gente['cargadoresDisponibles'])} disponibles · ${texto(gente['cargadores'])} activos',
            texto(gente['cargadoresLinea'])
          ),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Registrados'),
        KpiGrilla([
          ('Dueños', texto(gente['duenos'])),
          ('Cajeros', texto(gente['cajeros'])),
          ('Vendedores', texto(gente['vendedores'])),
          ('Clientes · ${texto(gente['clientesCuenta'])} con cuenta', texto(gente['clientes'])),
          ('Proveedores', texto(gente['proveedores'])),
          ('Compradores', texto(gente['compradores'])),
          ('Cargadores', texto(gente['cargadores'])),
          ('Productos · ${texto(catalogo['publicados'])} en Mercado', texto(catalogo['productos'])),
        ]),
        const SizedBox(height: 16),
        const _Subtitulo('Las dos apps, mismo período'),
        Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: _resumenApp(context, 'Mostrador', mostrador, c.leaf)),
            const SizedBox(width: 10),
            Expanded(child: _resumenApp(context, 'Mercado al Toque', mercado, c.ambar)),
          ],
        ),
        const SizedBox(height: 16),
        const _Subtitulo('Cobros por día'),
        Tarjeta(child: _serie(context)),
        const SizedBox(height: 16),
        _bloqueApp(context, 'Mostrador', mostradorMapa),
        const SizedBox(height: 16),
        _filaListas(context, [
          _Lista(
            titulo: 'Remitos',
            vacio: 'Sin remitos en este período.',
            filas: [for (final r in datos['remitos'] as List? ?? const []) (texto(r['estado']), texto(r['n']))],
          ),
          _Lista(
            titulo: 'Cuenta corriente',
            vacio: 'Sin movimientos de cuenta.',
            filas: [
              for (final r in datos['cuenta'] as List? ?? const []) (_et(_tipoCuenta, texto(r['tipo'])), '${texto(r['n'])} · ${_pesos(r['monto'])}'),
            ],
          ),
          _Lista(
            titulo: 'Stock',
            vacio: 'Sin movimientos de stock.',
            filas: [
              for (final r in datos['stock'] as List? ?? const []) (_et(_tipoStock, texto(r['tipo'])), '${texto(r['n'])} · ${texto(r['cantidad'])}'),
            ],
          ),
          _Lista(
            titulo: 'Facturas',
            vacio: 'Sin comprobantes en este período.',
            filas: [for (final r in datos['facturas'] as List? ?? const []) (texto(r['estado']), '${texto(r['n'])} · ${_pesos(r['total'])}')],
          ),
        ]),
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Text(
            'Cierres de caja: ${texto(cierres['n'])}. Diferencia acumulada ${_pesos(cierres['diferencia'])}.',
            style: TextStyle(fontSize: 13, color: c.muted),
          ),
        ),
        const SizedBox(height: 16),
        _bloqueApp(context, 'Mercado al Toque', mercadoMapa),
        const SizedBox(height: 16),
        _Lista(
          titulo: 'Recorridos de cargadores',
          vacio: 'Sin recorridos en este período.',
          filas: [for (final r in datos['recorridos'] as List? ?? const []) (_et(_recorrido, texto(r['estado'])), texto(r['n']))],
        ),
        const SizedBox(height: 16),
        const _Subtitulo('Puestos por facturación'),
        _puestosFacturacion(context),
        const SizedBox(height: 16),
        _Lista(
          titulo: 'Puestos con alguien adentro',
          vacio: 'Nadie con sesión abierta.',
          filas: [for (final r in datos['enLinea'] as List? ?? const []) (texto(r['nombre']), _et(_rolStaff, texto(r['rol'])))],
        ),
      ],
    );
  }

  Widget _resumenApp(BuildContext context, String titulo, _Resumen datos, Color acento) {
    final c = torreColorsOf(context);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 10, height: 10, decoration: BoxDecoration(color: acento, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(titulo, style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 6),
          Text(_pesos(datos.cobrado), style: TextStyle(fontFamily: 'serif', fontSize: 22, fontWeight: FontWeight.w600, color: c.ink)),
          Text('${datos.tickets} cobros vigentes · ${datos.anulados} anulados', style: TextStyle(color: c.muted, fontSize: 12)),
          const SizedBox(height: 6),
          Text(
            '${datos.cerrados} cerradas · ${datos.curso} en curso · ${datos.cancelados} canceladas',
            style: TextStyle(color: c.muted, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _serie(BuildContext context) {
    final c = torreColorsOf(context);
    final serie = datos['serie'] as List? ?? const [];
    if (serie.isEmpty) return Text('Sin cobros en este período.', style: TextStyle(color: c.muted, fontSize: 13));
    var max = 1.0;
    for (final s in serie) {
      max = _mayor(max, numero(s['mostrador']));
      max = _mayor(max, numero(s['mercado']));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            _leyenda(context, c.leaf, 'Mostrador'),
            const SizedBox(width: 14),
            _leyenda(context, c.ambar, 'Mercado'),
          ],
        ),
        const SizedBox(height: 8),
        for (final s in serie)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                SizedBox(width: 46, child: Text(_diaCorto(s['dia']), style: TextStyle(color: c.muted, fontSize: 12))),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _barra(numero(s['mostrador']) / max, c.leaf),
                      const SizedBox(height: 2),
                      _barra(numero(s['mercado']) / max, c.ambar),
                    ],
                  ),
                ),
                SizedBox(
                  width: 96,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(_pesos(s['mostrador']), style: TextStyle(color: c.inkSoft, fontSize: 11)),
                      Text(_pesos(s['mercado']), style: TextStyle(color: c.muted, fontSize: 11)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _leyenda(BuildContext context, Color color, String etiqueta) => Row(
        children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 5),
          Text(etiqueta, style: TextStyle(fontSize: 12, color: torreColorsOf(context).muted)),
        ],
      );

  Widget _barra(double fraccion, Color color) {
    return LayoutBuilder(
      builder: (context, constraints) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          width: constraints.maxWidth * fraccion.clamp(0.0, 1.0),
          height: 6,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
        ),
      ),
    );
  }

  Widget _bloqueApp(BuildContext context, String titulo, Map<String, dynamic> app) {
    final cobros = app['cobros'] as List? ?? const [];
    final pedidos = (app['pedidos'] as List? ?? const []).toList()..sort((a, b) => numero(b['monto']).compareTo(numero(a['monto'])));
    final productos = app['productos'] as List? ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Subtitulo(titulo),
        _filaListas(context, [
          _Lista(
            titulo: 'Medios de pago',
            vacio: 'Sin cobros.',
            filas: [
              for (final f in cobros)
                (
                  _et(_formaPago, texto(f['forma'])),
                  '${texto(f['n'])} · ${_pesos(f['monto'])}${numero(f['anulados']) > 0 ? ' · ${texto(f['anulados'])} anulados' : ''}',
                ),
            ],
          ),
          _Lista(
            titulo: 'Pedidos',
            vacio: 'Sin pedidos.',
            filas: [for (final p in pedidos) (_et(_estadoPedido, texto(p['estado'])), '${texto(p['n'])} · ${_pesos(p['monto'])}')],
          ),
          _productos(context, productos),
        ]),
      ],
    );
  }

  Widget _productos(BuildContext context, List<dynamic> productos) {
    final c = torreColorsOf(context);
    var max = 1.0;
    for (final p in productos) {
      max = _mayor(max, numero(p['total']));
    }
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Productos', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
          const SizedBox(height: 8),
          if (productos.isEmpty)
            Text('Sin ventas cerradas.', style: TextStyle(color: c.muted, fontSize: 13))
          else
            for (final p in productos)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(texto(p['nombre']), overflow: TextOverflow.ellipsis, style: TextStyle(color: c.ink, fontSize: 13))),
                        Text('${_pesos(p['total'])} · ${texto(p['cantidad'])} u', style: TextStyle(color: c.muted, fontSize: 12)),
                      ],
                    ),
                    const SizedBox(height: 3),
                    _barra(numero(p['total']) / max, c.leaf),
                  ],
                ),
              ),
        ],
      ),
    );
  }

  Widget _puestosFacturacion(BuildContext context) {
    final c = torreColorsOf(context);
    final puestos = datos['puestos'] as List? ?? const [];
    if (puestos.isEmpty) {
      return Text('Ningún puesto cobró en este período.', style: TextStyle(color: c.muted, fontSize: 13));
    }
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final p in puestos)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(texto(p['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600, fontSize: 14))),
                      Text('${texto(p['tickets'])} tickets', style: TextStyle(color: c.muted, fontSize: 12)),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text('Mostrador ${_pesos(p['mostrador'])} · Mercado ${_pesos(p['mercado'])}', style: TextStyle(color: c.muted, fontSize: 12)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _filaListas(BuildContext context, List<Widget> listas) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columnas = constraints.maxWidth > 900 ? 3 : (constraints.maxWidth > 620 ? 2 : 1);
        final ancho = (constraints.maxWidth - (columnas - 1) * 10) / columnas;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [for (final l in listas) SizedBox(width: ancho, child: l)],
        );
      },
    );
  }
}

class _ComprasPendientes extends StatefulWidget {
  const _ComprasPendientes({required this.api});
  final TorreApi api;

  @override
  State<_ComprasPendientes> createState() => _ComprasPendientesState();
}

class _ComprasPendientesState extends State<_ComprasPendientes> {
  int _version = 0;
  String? _ocupada;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('listarComprasPendientes');

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Subtitulo('Compras pendientes'),
        VistaDatos<List<dynamic>>(
          key: ValueKey(_version),
          cargar: _cargar,
          builder: (context, compras) {
            if (compras.isEmpty) return Text('No hay compras pendientes de habilitación.', style: TextStyle(color: c.muted, fontSize: 13));
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final k in compras) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(context, k)),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _tarjeta(BuildContext context, dynamic k) {
    final c = torreColorsOf(context);
    final id = texto(k['id']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(texto(k['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
              ChipEstado('Pendiente', activo: false),
            ],
          ),
          LineaDato('Compra inteligente', _pesos(k['precioArs'])),
          LineaDato('Comprobante', _soloFecha(k['creado'])),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: BotonPrimario('Habilitar', _ocupada == null ? () => _habilitar(id) : null, ocupado: _ocupada == id),
          ),
        ],
      ),
    );
  }

  Future<void> _habilitar(String id) async {
    if (!await confirmarTorre(context, 'Habilitar compra', '¿Habilitar esta compra? Estará activa por 30 días.')) return;
    setState(() => _ocupada = id);
    try {
      await widget.api.fn('habilitarCompra', id);
      if (!mounted) return;
      aviso(context, 'Compra habilitada.');
      setState(() => _version++);
    } catch (e) {
      if (mounted) aviso(context, '$e');
    } finally {
      if (mounted) setState(() => _ocupada = null);
    }
  }
}

class _NumerosNegocios extends StatefulWidget {
  const _NumerosNegocios({required this.api});
  final TorreApi api;

  @override
  State<_NumerosNegocios> createState() => _NumerosNegociosState();
}

class _NumerosNegociosState extends State<_NumerosNegocios> {
  final _hoy = DateTime.now();
  late int _mes = _hoy.month;
  late int _anio = _hoy.year;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('numerosDeNegocios', <String, dynamic>{'mes': _mes, 'anio': _anio});

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final anios = [for (var a = _hoy.year - 4; a <= _hoy.year + 1; a++) '$a'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Subtitulo('Números por negocio'),
        Text(
          'Ventas y egresos de la matriz y de cada sucursal. No incluye stock.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Desplegable(
                label: 'Mes',
                valor: _meses[_mes - 1],
                opciones: _meses,
                onChanged: (v) => setState(() => _mes = _meses.indexOf(v) + 1),
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 130,
              child: Desplegable(
                label: 'Año',
                valor: '$_anio',
                opciones: anios,
                onChanged: (v) => setState(() => _anio = int.tryParse(v) ?? _anio),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        VistaDatos<List<dynamic>>(
          key: ValueKey('numeros-$_mes-$_anio'),
          cargar: _cargar,
          builder: (context, filas) {
            if (filas.isEmpty) {
              return Text('Todavia no hay un puesto vinculado.', style: TextStyle(color: c.muted, fontSize: 13));
            }
            var ventas = 0.0;
            var tickets = 0.0;
            var egresos = 0.0;
            var mercaderia = 0.0;
            var resultado = 0.0;
            for (final f in filas) {
              ventas += numero(f['ventas']);
              tickets += numero(f['tickets']);
              egresos += numero(f['egresos']);
              mercaderia += numero(f['mercaderia']);
              resultado += numero(f['resultado']);
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final f in filas) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(context, f)),
                const SizedBox(height: 4),
                Tarjeta(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      LineaDato('Total ventas', _pesos(ventas)),
                      LineaDato('Total tickets', '${tickets.round()}'),
                      LineaDato('Total egresos', '- ${_pesos(egresos)}'),
                      LineaDato('Total mercadería', _pesos(mercaderia)),
                      LineaDato('Total resultado', _pesos(resultado)),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _tarjeta(BuildContext context, dynamic f) {
    final c = torreColorsOf(context);
    final esMatriz = f['esMatriz'] == true;
    final resultado = numero(f['resultado']);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(texto(f['negocio']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
              ChipEstado(esMatriz ? 'Matriz' : 'Sucursal', activo: esMatriz),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(texto(f['sucursal']), style: TextStyle(color: c.muted, fontSize: 12)),
          ),
          LineaDato('Ventas', _pesos(f['ventas'])),
          LineaDato('Tickets', texto(f['tickets'])),
          LineaDato('Egresos', '- ${_pesos(f['egresos'])}'),
          LineaDato('Mercadería', _pesos(f['mercaderia'])),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Resultado ${_pesos(resultado)}',
              style: TextStyle(color: resultado >= 0 ? c.ok : c.terra, fontWeight: FontWeight.w600, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}

class _Lista extends StatelessWidget {
  const _Lista({required this.titulo, required this.vacio, required this.filas});
  final String titulo;
  final String vacio;
  final List<(String, String)> filas;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(titulo, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
          const SizedBox(height: 8),
          if (filas.isEmpty)
            Text(vacio, style: TextStyle(color: c.muted, fontSize: 13))
          else
            for (final (nombre, detalle) in filas)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(nombre, style: TextStyle(color: c.ink, fontSize: 13))),
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text(detalle, textAlign: TextAlign.end, style: TextStyle(color: c.muted, fontSize: 12)),
                    ),
                  ],
                ),
              ),
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
