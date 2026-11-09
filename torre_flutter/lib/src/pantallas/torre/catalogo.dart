import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class PantallaCatalogo extends StatefulWidget {
  const PantallaCatalogo({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaCatalogo> createState() => _PantallaCatalogoState();
}

class _PantallaCatalogoState extends State<PantallaCatalogo> {
  static const _canales = ['Todos', 'Publicados', 'No publicados'];
  static const _canalValores = ['', 'si', 'no'];

  final _controlador = TextEditingController();
  String _busqueda = '';
  String _tenant = '';
  String _canal = '';
  bool _stockBajo = false;

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<List<dynamic>> _cargarCatalogo() => widget.api.fnLista('catalogoUnificado', <String, dynamic>{
        'filtros': <String, dynamic>{
          'busqueda': _busqueda.trim(),
          'tenantId': _tenant,
          'publicadoOnline': _canal.isEmpty ? null : _canal == 'si',
          'stockBajo': _stockBajo,
        },
      });

  void _buscar() => setState(() => _busqueda = _controlador.text);

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'El catálogo completo de todos los negocios activos, en una sola lista.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _controlador,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _buscar(),
          decoration: InputDecoration(
            hintText: 'Buscar por nombre de producto',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward, size: 20), onPressed: _buscar),
          ),
        ),
        const SizedBox(height: 10),
        VistaDatos<List<dynamic>>(
          // Los selectores de negocio y canal no existen hasta tener el listado de tenants.
          key: const ValueKey('catalogo-tenants'),
          cargar: () => widget.api.fnLista('listarTenantsCatalogo'),
          builder: (context, tenants) => _filtros(tenants),
        ),
        const SizedBox(height: 14),
        VistaDatos<List<dynamic>>(
          key: ValueKey('catalogo-$_busqueda-$_tenant-$_canal-$_stockBajo'),
          cargar: _cargarCatalogo,
          builder: _tabla,
        ),
      ],
    );
  }

  Widget _filtros(List<dynamic> tenants) {
    final nombres = <String>['Todos', for (final t in tenants) texto(t['nombre'])];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Desplegable(
                label: 'Negocio',
                valor: _nombreTenant(tenants),
                opciones: nombres,
                onChanged: (v) => setState(() => _tenant = v == 'Todos' ? '' : _idTenant(tenants, v)),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Desplegable(
                label: 'Canal online',
                valor: _canales[_canalValores.indexOf(_canal)],
                opciones: _canales,
                onChanged: (v) => setState(() => _canal = _canalValores[_canales.indexOf(v)]),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: [
            FilterChip(
              label: const Text('Solo stock bajo'),
              selected: _stockBajo,
              onSelected: (v) => setState(() => _stockBajo = v),
            ),
          ],
        ),
      ],
    );
  }

  String _nombreTenant(List<dynamic> tenants) {
    if (_tenant.isEmpty) return 'Todos';
    for (final t in tenants) {
      if (texto(t['id']) == _tenant) return texto(t['nombre']);
    }
    return 'Todos';
  }

  String _idTenant(List<dynamic> tenants, String nombre) {
    for (final t in tenants) {
      if (texto(t['nombre']) == nombre) return texto(t['id']);
    }
    return '';
  }

  Widget _tabla(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) {
      return Text('No hay productos que coincidan con los filtros.', style: TextStyle(color: c.muted, fontSize: 13));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${filas.length} productos', style: TextStyle(fontSize: 12, color: c.muted)),
        const SizedBox(height: 8),
        for (final p in filas.take(300))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Producto(p),
          ),
      ],
    );
  }
}

class _Producto extends StatelessWidget {
  const _Producto(this.p);
  final dynamic p;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final bajo = p['stockBajo'] == true;
    final activo = p['activo'] == true;
    return Tarjeta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(texto(p['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(texto(p['tenantNombre']), style: TextStyle(color: c.muted, fontSize: 12)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(fmtMoneda(p['precio'], texto(p['moneda'])), style: TextStyle(color: c.ink, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(
                    '${texto(p['stock'])} ${texto(p['unidad'])}',
                    style: TextStyle(color: bajo ? c.terra : c.muted, fontSize: 12, fontWeight: bajo ? FontWeight.w600 : FontWeight.normal),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              ChipEstado(activo ? 'Activo' : 'Inactivo', activo: activo),
              if (bajo) ChipEstado('Stock bajo', activo: false),
              ChipEstado('Mostrador', activo: p['canalMostrador'] == true),
              ChipEstado('Mercado online', activo: p['canalMercado'] == true),
            ],
          ),
        ],
      ),
    );
  }
}
