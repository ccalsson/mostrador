import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _estados = <String, String>{
  'draft': 'Borrador',
  'pending_payment': 'Pago pendiente',
  'scheduled': 'Programado',
  'active': 'Activo',
  'expired': 'Vencido',
  'cancelled': 'Cancelado',
};

String _estadoLabel(String status) => _estados[status] ?? status;

String _estadoId(String etiqueta) {
  for (final e in _estados.entries) {
    if (e.value == etiqueta) return e.key;
  }
  return '';
}

class _PublicidadDatos {
  _PublicidadDatos(this.ads, this.packs, this.productos);
  final List<dynamic> ads;
  final List<dynamic> packs;
  final List<dynamic> productos;

  List<dynamic> get catalogo =>
      productos.where((p) => texto(p['kind']) == 'advertising' || texto(p['kind']) == 'messaging').toList();
}

class PantallaPublicidad extends StatefulWidget {
  const PantallaPublicidad({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaPublicidad> createState() => _PantallaPublicidadState();
}

class _PantallaPublicidadState extends State<PantallaPublicidad> {
  int _version = 0;

  Future<_PublicidadDatos> _cargar() async {
    final ads = await widget.api.fnLista('listAds');
    final packs = await widget.api.fnLista('listPacks');
    final productos = await widget.api.fnLista('listProducts');
    return _PublicidadDatos(ads, packs, productos);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_PublicidadDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _PublicidadVista(
        datos: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _PublicidadVista extends StatelessWidget {
  const _PublicidadVista({required this.datos, required this.api, required this.onCambio});
  final _PublicidadDatos datos;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final catalogo = datos.catalogo;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Torre habilita el add-on y el espacio. El dueño escribe el banner en Mostrador. '
          'Acá no se arma el aviso ni se manda un push.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 16),
        _Subtitulo('Catálogo publicitario'),
        if (catalogo.isEmpty)
          Text('No hay productos de publicidad ni de envío en el catálogo.', style: TextStyle(color: c.muted))
        else
          for (final p in catalogo) Padding(padding: const EdgeInsets.only(bottom: 8), child: _catalogoItem(context, p)),
        const SizedBox(height: 8),
        if (datos.ads.isEmpty)
          Text('Sin avisos cargados.', style: TextStyle(color: c.muted))
        else
          for (final ad in datos.ads) Padding(padding: const EdgeInsets.only(bottom: 8), child: _itemAviso(context, ad)),
        const SizedBox(height: 16),
        _Subtitulo('Packs de envío'),
        if (datos.packs.isEmpty)
          Text('Sin packs.', style: TextStyle(color: c.muted))
        else
          for (final pack in datos.packs) Padding(padding: const EdgeInsets.only(bottom: 8), child: _pack(context, pack)),
      ],
    );
  }

  Widget _catalogoItem(BuildContext context, dynamic p) {
    final c = torreColorsOf(context);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${texto(p['name'])} · ${texto(p['kind'])} · ${texto(p['status'])} · ${texto(p['billing'])} · ${texto(p['frequency'])}',
            style: TextStyle(color: c.ink, fontWeight: FontWeight.w600),
          ),
          if (texto(p['description']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(texto(p['description']), style: TextStyle(color: c.muted, fontSize: 12)),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(texto(p['configJson']), style: TextStyle(color: c.muted, fontSize: 12)),
          ),
        ],
      ),
    );
  }

  Widget _itemAviso(BuildContext context, dynamic ad) {
    final c = torreColorsOf(context);
    final status = texto(ad['status']);
    final visible = status == 'active' || status == 'scheduled';
    final etiqueta = _estadoLabel(status);
    final opciones = [for (final e in _estados.entries) e.value, if (!_estados.containsValue(etiqueta)) etiqueta];
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${texto(ad['productName'])} · ${texto(ad['tenantName'])}', style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${texto(ad['placement'])} · ${texto(ad['startsOn'])} → ${texto(ad['endsOn'])} · '
              '${texto(ad['currency'])} ${texto(ad['price'])}',
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          if (texto(ad['contentRef']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(texto(ad['contentRef']), style: TextStyle(color: c.muted, fontSize: 12)),
            ),
          if (texto(ad['notes']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(texto(ad['notes']), style: TextStyle(color: c.muted, fontSize: 12)),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              ChipEstado(etiqueta, activo: visible),
              const Spacer(),
              SizedBox(
                width: 170,
                child: Desplegable(
                  label: 'Estado',
                  valor: etiqueta,
                  opciones: opciones,
                  onChanged: (v) => _cambiarEstado(context, ad, _estadoId(v)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pack(BuildContext context, dynamic pack) {
    final c = torreColorsOf(context);
    final comprado = [
      'comprado ${texto(pack['purchasedOn'])}',
      if (texto(pack['expiresOn']).isNotEmpty) 'vence ${texto(pack['expiresOn'])}',
    ].join(' · ');
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${texto(pack['productName'])} · ${texto(pack['tenantName'])}', style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${texto(pack['consumed'])} usados · ${texto(pack['remaining'])} restantes de ${texto(pack['quantity'])} · ${texto(pack['status'])}',
              style: TextStyle(color: c.muted, fontSize: 12),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(comprado, style: TextStyle(color: c.muted, fontSize: 12)),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(onPressed: () => _consumo(context, pack), child: const Text('Anotar consumo')),
          ),
        ],
      ),
    );
  }

  Future<void> _cambiarEstado(BuildContext context, dynamic ad, String status) async {
    if (status.isEmpty || status == texto(ad['status'])) return;
    try {
      await api.fn('setAdStatus', <String, dynamic>{'id': texto(ad['id']), 'status': status});
      if (!context.mounted) return;
      aviso(context, 'Estado actualizado.');
      onCambio();
    } catch (e) {
      if (context.mounted) aviso(context, '$e');
    }
  }

  Future<void> _consumo(BuildContext context, dynamic pack) async {
    final monto = TextEditingController(text: '1');
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Anotar consumo',
      campos: [
        Campo(controller: monto, label: 'Consumo administrativo a descontar', teclado: const TextInputType.numberWithOptions(decimal: true)),
      ],
      guardar: () => api.fn('registrarConsumo', <String, dynamic>{
        'id': texto(pack['id']),
        'amount': numero(monto.text),
      }),
    );
    if (!guardado || !context.mounted) return;
    aviso(context, 'Consumo anotado.');
    onCambio();
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
