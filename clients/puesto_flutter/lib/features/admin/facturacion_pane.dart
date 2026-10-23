import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/facturacion.dart';
import '../../services/facturacion_service.dart';

class FacturacionPane extends ConsumerWidget {
  const FacturacionPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final panel = ref.watch(facturacionPanelProvider);
    return panel.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(error is ApiException
                ? error.message
                : 'No se pudo cargar facturación.'),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: () => ref.invalidate(facturacionPanelProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
      data: (data) => _FacturacionBody(data: data),
    );
  }
}

class _FacturacionBody extends ConsumerStatefulWidget {
  const _FacturacionBody({required this.data});

  final FacturacionPanel data;

  @override
  ConsumerState<_FacturacionBody> createState() => _FacturacionBodyState();
}

class _FacturacionBodyState extends ConsumerState<_FacturacionBody> {
  bool _configAbierta = false;
  bool _guardando = false;
  bool _probando = false;
  String? _errorGuardar;
  String? _resultadoProbar;
  String? _emitiendo;

  // Filtros del listado
  String _filtroCliente = '';
  String _filtroTipo = '';
  String _filtroFechaDesde = '';
  String _filtroFechaHasta = '';

  late TextEditingController _cuit;
  late TextEditingController _razon;
  late TextEditingController _domicilio;
  late TextEditingController _iibb;
  late TextEditingController _pv;
  late TextEditingController _inicio;
  String _condicion = 'ri';
  double _alicuota = 21;
  String _ambiente = 'homo';
  String? _certPem;
  String? _keyPem;

  @override
  void initState() {
    super.initState();
    _initCampos(widget.data.config);
  }

  void _initCampos(AfipConfig c) {
    _cuit = TextEditingController(text: c.cuit);
    _razon = TextEditingController(text: c.razonSocial);
    _domicilio = TextEditingController(text: c.domicilio);
    _iibb = TextEditingController(text: c.iibb);
    _pv = TextEditingController(text: c.puntoVenta > 0 ? '${c.puntoVenta}' : '');
    _inicio = TextEditingController(text: c.inicioActividades);
    _condicion = c.condicion.isNotEmpty ? c.condicion : 'ri';
    _alicuota = c.alicuota > 0 ? c.alicuota : 21;
    _ambiente = c.ambiente.isNotEmpty ? c.ambiente : 'homo';
    _certPem = null;
    _keyPem = null;
  }

  @override
  void dispose() {
    _cuit.dispose();
    _razon.dispose();
    _domicilio.dispose();
    _iibb.dispose();
    _pv.dispose();
    _inicio.dispose();
    super.dispose();
  }

  Future<void> _cargarArchivo(String tipo) async {
    const tipos = XTypeGroup(
      label: 'Archivos PEM',
      extensions: ['pem', 'crt', 'cer', 'key', 'txt'],
    );
    final archivo = await openFile(acceptedTypeGroups: [tipos]);
    if (archivo == null) return;
    final bytes = await archivo.readAsBytes();
    String contenido;
    try {
      contenido = utf8.decode(bytes);
    } catch (_) {
      contenido = base64Encode(bytes);
    }
    setState(() {
      if (tipo == 'cert') {
        _certPem = contenido;
      } else {
        _keyPem = contenido;
      }
    });
  }

  Future<void> _guardar() async {
    setState(() {
      _guardando = true;
      _errorGuardar = null;
    });
    try {
      await ref.read(facturacionServiceProvider).guardarConfig(
            cuit: _cuit.text.trim(),
            razonSocial: _razon.text.trim(),
            domicilio: _domicilio.text.trim(),
            condicion: _condicion,
            puntoVenta: int.tryParse(_pv.text.trim()) ?? 0,
            inicioActividades: _inicio.text.trim(),
            iibb: _iibb.text.trim(),
            alicuota: _alicuota,
            ambiente: _ambiente,
            certPem: _certPem,
            keyPem: _keyPem,
          );
      ref.invalidate(facturacionPanelProvider);
      if (mounted) {
        setState(() {
          _configAbierta = false;
          _certPem = null;
          _keyPem = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _errorGuardar = e.message);
    } catch (_) {
      if (mounted) setState(() => _errorGuardar = 'Error al guardar.');
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _probar() async {
    setState(() {
      _probando = true;
      _resultadoProbar = null;
    });
    try {
      final r = await ref.read(facturacionServiceProvider).probarConexion();
      if (mounted) {
        setState(() => _resultadoProbar = r.login
            ? 'Conexión exitosa (app: ${r.app}, auth: ${r.auth})'
            : 'Conexión fallida');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _resultadoProbar = e.message);
    } catch (_) {
      if (mounted) setState(() => _resultadoProbar = 'Error de red.');
    } finally {
      if (mounted) setState(() => _probando = false);
    }
  }

  Future<void> _toggleHabilitada(bool habilitada) async {
    try {
      await ref.read(facturacionServiceProvider).setHabilitada(habilitada);
      ref.invalidate(facturacionPanelProvider);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _emitir(String cobroId) async {
    setState(() => _emitiendo = cobroId);
    try {
      final factura =
          await ref.read(facturacionServiceProvider).emitirFactura(cobroId);
      ref.invalidate(facturacionPanelProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content:
                Text('${factura.nombre} ${factura.numeroFiscal} emitida')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _emitiendo = null);
    }
  }

  Future<void> _emitirNC(String facturaId) async {
    final motivoController = TextEditingController();
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nota de crédito'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Se emitirá una nota de crédito por el total de la factura original.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: motivoController,
                decoration: const InputDecoration(
                  labelText: 'Motivo (opcional)',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                maxLines: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Emitir NC'),
          ),
        ],
      ),
    );
    motivoController.dispose();
    if (confirmar != true) return;
    try {
      final nc = await ref.read(facturacionServiceProvider).emitirNotaCredito(
            facturaId,
            motivo: motivoController.text.trim().isNotEmpty
                ? motivoController.text.trim()
                : null,
          );
      ref.invalidate(facturacionPanelProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('${nc.nombre} ${nc.numeroFiscal} emitida')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  List<Factura> get _facturasFiltradas {
    var lista = widget.data.emitidas;
    if (_filtroCliente.isNotEmpty) {
      final filtro = _filtroCliente.toLowerCase();
      lista = lista
          .where((f) =>
              (f.receptorNombre ?? '').toLowerCase().contains(filtro))
          .toList();
    }
    if (_filtroTipo.isNotEmpty) {
      lista = lista
          .where((f) => f.tipoLabel.toLowerCase().contains(_filtroTipo.toLowerCase()))
          .toList();
    }
    if (_filtroFechaDesde.isNotEmpty) {
      lista = lista.where((f) => f.fecha.compareTo(_filtroFechaDesde) >= 0).toList();
    }
    if (_filtroFechaHasta.isNotEmpty) {
      lista = lista.where((f) => f.fecha.compareTo(_filtroFechaHasta) <= 0).toList();
    }
    return lista;
  }

  @override
  Widget build(BuildContext context) {
    final config = widget.data.config;
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _encabezado(config, theme),
        const SizedBox(height: 16),
        if (_configAbierta) ...[
          _formularioConfig(theme),
          const SizedBox(height: 16),
        ],
        if (config.habilitada) ...[
          if (widget.data.pendientes.isNotEmpty) ...[
            _seccionPendientes(theme),
            const SizedBox(height: 16),
          ],
          _seccionEmitidas(theme),
        ] else
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    config.lista
                        ? 'ARCA está inhabilitada. Habilitala para emitir comprobantes.'
                        : 'Completá la configuración fiscal para habilitar ARCA.',
                    style: theme.textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  if (!config.lista) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Requiere plan Premium para habilitar facturación electrónica.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.error,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _encabezado(AfipConfig config, ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('ARCA', style: theme.textTheme.titleMedium),
                const SizedBox(width: 12),
                Chip(
                  label: Text(config.habilitada ? 'Habilitada' : 'Inhabilitada'),
                  backgroundColor: config.habilitada
                      ? Colors.green.withValues(alpha: 0.15)
                      : theme.colorScheme.surfaceContainerHighest,
                  labelStyle: TextStyle(
                    fontSize: 12,
                    color: config.habilitada ? Colors.green : null,
                  ),
                  side: BorderSide.none,
                  padding: EdgeInsets.zero,
                  visualDensity: VisualDensity.compact,
                ),
                const Spacer(),
                TextButton.icon(
                  icon: Icon(
                      _configAbierta ? Icons.expand_less : Icons.expand_more),
                  label: Text(_configAbierta ? 'Cerrar' : 'Configuración'),
                  onPressed: () =>
                      setState(() => _configAbierta = !_configAbierta),
                ),
              ],
            ),
            if (config.cuit.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '${config.razonSocial} · CUIT ${config.cuit} · '
                '${config.condicionLabel} · PV ${config.puntoVenta} · '
                '${config.ambienteLabel}',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _formularioConfig(ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Configuración fiscal', style: theme.textTheme.titleSmall),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _cuit,
                    decoration: const InputDecoration(
                      labelText: 'CUIT',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _razon,
                    decoration: const InputDecoration(
                      labelText: 'Razón social',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _domicilio,
              decoration: const InputDecoration(
                labelText: 'Domicilio fiscal',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _iibb,
                    decoration: const InputDecoration(
                      labelText: 'Ingresos brutos',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _condicion,
                    decoration: const InputDecoration(
                      labelText: 'Condición IVA',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(value: 'ri', child: Text('Resp. inscripto')),
                      DropdownMenuItem(value: 'monotributo', child: Text('Monotributo')),
                      DropdownMenuItem(value: 'exento', child: Text('Exento')),
                    ],
                    onChanged: (v) => setState(() => _condicion = v ?? 'ri'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _pv,
                    decoration: const InputDecoration(
                      labelText: 'Punto de venta',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _inicio,
                    decoration: const InputDecoration(
                      labelText: 'Inicio actividades',
                      border: OutlineInputBorder(),
                      isDense: true,
                      hintText: 'YYYY-MM-DD',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<double>(
                    initialValue: _alicuota,
                    decoration: const InputDecoration(
                      labelText: 'Alícuota IVA',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(value: 21.0, child: Text('21%')),
                      DropdownMenuItem(value: 10.5, child: Text('10.5%')),
                      DropdownMenuItem(value: 0.0, child: Text('0% (exento)')),
                    ],
                    onChanged: (v) => setState(() => _alicuota = v ?? 21),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _ambiente,
                    decoration: const InputDecoration(
                      labelText: 'Ambiente',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(value: 'homo', child: Text('Homologación')),
                      DropdownMenuItem(value: 'prod', child: Text('Producción')),
                    ],
                    onChanged: (v) => setState(() => _ambiente = v ?? 'homo'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            widget.data.config.certCargado
                                ? Icons.check_circle
                                : Icons.cancel_outlined,
                            size: 16,
                            color: widget.data.config.certCargado
                                ? Colors.green
                                : Colors.red,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _certPem != null
                                ? 'Certificado nuevo cargado'
                                : (widget.data.config.certCargado
                                    ? 'Certificado cargado'
                                    : 'Sin certificado'),
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      OutlinedButton.icon(
                        onPressed: () => _cargarArchivo('cert'),
                        icon: const Icon(Icons.upload_file, size: 16),
                        label: Text(_certPem != null ? 'Cambiar certificado' : 'Cargar certificado'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          textStyle: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            widget.data.config.keyCargada
                                ? Icons.check_circle
                                : Icons.cancel_outlined,
                            size: 16,
                            color: widget.data.config.keyCargada
                                ? Colors.green
                                : Colors.red,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _keyPem != null
                                ? 'Clave nueva cargada'
                                : (widget.data.config.keyCargada
                                    ? 'Clave cargada'
                                    : 'Sin clave'),
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      OutlinedButton.icon(
                        onPressed: () => _cargarArchivo('key'),
                        icon: const Icon(Icons.upload_file, size: 16),
                        label: Text(_keyPem != null ? 'Cambiar clave' : 'Cargar clave privada'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          textStyle: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (_errorGuardar != null) ...[
              const SizedBox(height: 8),
              Text(_errorGuardar!,
                  style: TextStyle(color: theme.colorScheme.error)),
            ],
            if (_resultadoProbar != null) ...[
              const SizedBox(height: 8),
              Text(_resultadoProbar!, style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                FilledButton(
                  onPressed: _guardando ? null : _guardar,
                  child: _guardando
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Guardar'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _probando ? null : _probar,
                  child: _probando
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Probar conexión'),
                ),
                const Spacer(),
                if (widget.data.config.lista)
                  widget.data.config.habilitada
                      ? OutlinedButton(
                          onPressed: () => _toggleHabilitada(false),
                          child: const Text('Inhabilitar'),
                        )
                      : FilledButton.tonal(
                          onPressed: () => _toggleHabilitada(true),
                          child: const Text('Habilitar'),
                        ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _seccionPendientes(ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Sin facturar (${widget.data.pendientes.length})',
                style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            for (final p in widget.data.pendientes)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor: p.error != null
                      ? theme.colorScheme.errorContainer
                      : theme.colorScheme.primaryContainer,
                  child: Text(
                    p.numero?.toString() ?? '·',
                    style: TextStyle(
                      fontSize: 11,
                      color: p.error != null
                          ? theme.colorScheme.onErrorContainer
                          : theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                title: Text(p.cliente),
                subtitle: Text.rich(TextSpan(children: [
                  TextSpan(text: '${moneda(p.monto)} · ${_horaCorta(p.createdAt)}'),
                  if (p.error != null)
                    TextSpan(
                      text: ' · ${p.error}',
                      style: TextStyle(color: theme.colorScheme.error),
                    ),
                ])),
                trailing: FilledButton.tonal(
                  onPressed: _emitiendo == p.id ? null : () => _emitir(p.id),
                  child: _emitiendo == p.id
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Emitir'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _seccionEmitidas(ThemeData theme) {
    final filtradas = _facturasFiltradas;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text('Comprobantes emitidos (${widget.data.emitidas.length})',
                    style: theme.textTheme.titleSmall),
                const Spacer(),
                if (widget.data.emitidas.length > 5)
                  TextButton.icon(
                    onPressed: () => _mostrarFiltros(theme),
                    icon: const Icon(Icons.filter_list, size: 16),
                    label: const Text('Filtros'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (_hayFiltrosActivos) ...[
              _chipsFiltros(theme),
              const SizedBox(height: 8),
            ],
            if (filtradas.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  _hayFiltrosActivos
                      ? 'No hay comprobantes que coincidan con los filtros.'
                      : 'Sin comprobantes emitidos.',
                  textAlign: TextAlign.center,
                ),
              )
            else
              for (final f in filtradas)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  onTap: () => _mostrarDetalle(f.id),
                  leading: Icon(
                    f.esNotaCredito ? Icons.undo : Icons.description_outlined,
                    color: f.esNotaCredito ? Colors.orange : Colors.green,
                    size: 20,
                  ),
                  title: Text('${f.tipoLabel} ${f.numeroFiscal}'),
                  subtitle: Text(
                    '${f.receptorNombre ?? 'Consumidor Final'} · ${moneda(f.total)} · ${f.fecha}'
                    '${f.ambiente == 'homo' ? ' · HOMO' : ''}',
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!f.esNotaCredito)
                        TextButton(
                          onPressed: () => _emitirNC(f.id),
                          child: const Text('NC'),
                        ),
                      const Icon(Icons.chevron_right, size: 16),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }

  bool get _hayFiltrosActivos =>
      _filtroCliente.isNotEmpty ||
      _filtroTipo.isNotEmpty ||
      _filtroFechaDesde.isNotEmpty ||
      _filtroFechaHasta.isNotEmpty;

  void _mostrarFiltros(ThemeData theme) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filtrar comprobantes', style: theme.textTheme.titleSmall),
            const SizedBox(height: 12),
            TextField(
              decoration: const InputDecoration(
                labelText: 'Cliente',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _filtroCliente = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _filtroTipo.isNotEmpty ? _filtroTipo : null,
              decoration: const InputDecoration(
                labelText: 'Tipo de comprobante',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: const [
                DropdownMenuItem(value: '', child: Text('Todos')),
                DropdownMenuItem(value: 'Factura A', child: Text('Factura A')),
                DropdownMenuItem(value: 'Factura B', child: Text('Factura B')),
                DropdownMenuItem(value: 'Factura C', child: Text('Factura C')),
                DropdownMenuItem(value: 'Nota de crédito', child: Text('Notas de crédito')),
              ],
              onChanged: (v) => setState(() => _filtroTipo = v ?? ''),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Desde (YYYY-MM-DD)',
                      border: OutlineInputBorder(),
                      isDense: true,
                      hintText: '2026-01-01',
                    ),
                    onChanged: (v) => setState(() => _filtroFechaDesde = v),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Hasta (YYYY-MM-DD)',
                      border: OutlineInputBorder(),
                      isDense: true,
                      hintText: '2026-12-31',
                    ),
                    onChanged: (v) => setState(() => _filtroFechaHasta = v),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                FilledButton.tonal(
                  onPressed: () {
                    setState(() {
                      _filtroCliente = '';
                      _filtroTipo = '';
                      _filtroFechaDesde = '';
                      _filtroFechaHasta = '';
                    });
                    Navigator.pop(ctx);
                  },
                  child: const Text('Limpiar'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Aplicar'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chipsFiltros(ThemeData theme) {
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        if (_filtroCliente.isNotEmpty)
          Chip(
            label: Text('Cliente: $_filtroCliente'),
            onDeleted: () => setState(() => _filtroCliente = ''),
            deleteIcon: const Icon(Icons.close, size: 14),
          ),
        if (_filtroTipo.isNotEmpty)
          Chip(
            label: Text('Tipo: $_filtroTipo'),
            onDeleted: () => setState(() => _filtroTipo = ''),
            deleteIcon: const Icon(Icons.close, size: 14),
          ),
        if (_filtroFechaDesde.isNotEmpty)
          Chip(
            label: Text('Desde: $_filtroFechaDesde'),
            onDeleted: () => setState(() => _filtroFechaDesde = ''),
            deleteIcon: const Icon(Icons.close, size: 14),
          ),
        if (_filtroFechaHasta.isNotEmpty)
          Chip(
            label: Text('Hasta: $_filtroFechaHasta'),
            onDeleted: () => setState(() => _filtroFechaHasta = ''),
            deleteIcon: const Icon(Icons.close, size: 14),
          ),
      ],
    );
  }

  Future<void> _mostrarDetalle(String facturaId) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => _FacturaDetalleDialog(facturaId: facturaId),
    );
  }

  static String _horaCorta(String createdAt) {
    final partes = createdAt.split(' ');
    if (partes.length < 2) return createdAt;
    final hora = partes[1];
    return hora.length >= 5 ? hora.substring(0, 5) : hora;
  }
}

class _FacturaDetalleDialog extends ConsumerWidget {
  const _FacturaDetalleDialog({required this.facturaId});

  final String facturaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final factura = ref.watch(facturaProvider(facturaId));
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        child: factura.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(error is ApiException
                    ? error.message
                    : 'No se pudo cargar la factura.'),
                const SizedBox(height: 16),
                FilledButton.tonal(
                  onPressed: () => ref.invalidate(facturaProvider(facturaId)),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          ),
          data: (f) => _FacturaContenido(factura: f),
        ),
      ),
    );
  }
}

class _FacturaContenido extends StatelessWidget {
  const _FacturaContenido({required this.factura});

  final Factura factura;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(20),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Encabezado tipo factura
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(factura.tipoLabel,
                          style: theme.textTheme.titleMedium),
                      Text('N° ${factura.numeroFiscal}',
                          style: theme.textTheme.headlineSmall
                              ?.copyWith(fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (factura.ambiente == 'homo')
                      Chip(
                        label: const Text('HOMO'),
                        backgroundColor: Colors.orange.withValues(alpha: 0.15),
                        side: BorderSide.none,
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.compact,
                        labelStyle: const TextStyle(fontSize: 11, color: Colors.orange),
                      ),
                    Text('Fecha: ${factura.fecha}',
                        style: theme.textTheme.bodySmall),
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const Divider(height: 24),
            // Emisor
            if (factura.emisorRazon != null) ...[
              Text('Emisor', style: theme.textTheme.labelMedium),
              const SizedBox(height: 4),
              Text(factura.emisorRazon!,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600)),
              if (factura.emisorCuit != null)
                Text('CUIT ${factura.emisorCuit}',
                    style: theme.textTheme.bodySmall),
              if (factura.emisorCondicion != null)
                Text(_condicionLabel(factura.emisorCondicion!),
                    style: theme.textTheme.bodySmall),
              if (factura.emisorDomicilio != null)
                Text(factura.emisorDomicilio!,
                    style: theme.textTheme.bodySmall),
              if (factura.emisorIibb != null && factura.emisorIibb!.isNotEmpty)
                Text('IIBB: ${factura.emisorIibb}',
                    style: theme.textTheme.bodySmall),
              if (factura.emisorInicio != null && factura.emisorInicio!.isNotEmpty)
                Text('Inicio actividades: ${factura.emisorInicio}',
                    style: theme.textTheme.bodySmall),
              const SizedBox(height: 12),
            ],
            // Receptor
            Text('Receptor', style: theme.textTheme.labelMedium),
            const SizedBox(height: 4),
            Text(factura.receptorNombre ?? 'Consumidor Final',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
            if (factura.receptorCondicion != null)
              Text(_condicionLabel(factura.receptorCondicion!),
                  style: theme.textTheme.bodySmall),
            const Divider(height: 24),
            // Tabla de ítems
            if (factura.lineas.isNotEmpty) ...[
              Container(
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: theme.dividerColor),
                  ),
                ),
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    const SizedBox(width: 60),
                    Expanded(
                      flex: 3,
                      child: Text('Detalle',
                          style: theme.textTheme.labelSmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    Expanded(
                      child: Text('Cantidad',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.labelSmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    Expanded(
                      child: Text('Neto',
                          textAlign: TextAlign.right,
                          style: theme.textTheme.labelSmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    Expanded(
                      child: Text('IVA',
                          textAlign: TextAlign.right,
                          style: theme.textTheme.labelSmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    Expanded(
                      child: Text('Total',
                          textAlign: TextAlign.right,
                          style: theme.textTheme.labelSmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
              for (final linea in factura.lineas)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      const SizedBox(width: 60),
                      Expanded(
                        flex: 3,
                        child: Text(linea.nombre,
                            style: theme.textTheme.bodySmall),
                      ),
                      Expanded(
                        child: Text('${cantidadNum(linea.cantidad)} ${linea.unidad}',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodySmall),
                      ),
                      Expanded(
                        child: Text(moneda(linea.neto),
                            textAlign: TextAlign.right,
                            style: theme.textTheme.bodySmall),
                      ),
                      Expanded(
                        child: Text(moneda(linea.iva),
                            textAlign: TextAlign.right,
                            style: theme.textTheme.bodySmall),
                      ),
                      Expanded(
                        child: Text(moneda(linea.total),
                            textAlign: TextAlign.right,
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                ),
              const Divider(height: 16),
            ],
            // Totales
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (factura.alicuota > 0) ...[
                      Text('Neto gravado: ${moneda(factura.neto)}',
                          style: theme.textTheme.bodySmall),
                      Text(
                          'IVA ${factura.alicuota}%: ${moneda(factura.iva)}',
                          style: theme.textTheme.bodySmall),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      'Total: ${moneda(factura.total)}',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ],
            ),
            const Divider(height: 24),
            // CAE y estado
            if (factura.cae != null) ...[
              Row(
                children: [
                  Icon(Icons.verified, size: 16, color: Colors.green),
                  const SizedBox(width: 4),
                  Text('CAE: ${factura.cae}',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(fontWeight: FontWeight.w500)),
                ],
              ),
              if (factura.caeVto != null)
                Text('Vencimiento CAE: ${_formatearFechaCae(factura.caeVto!)}',
                    style: theme.textTheme.bodySmall),
              const SizedBox(height: 8),
            ],
            if (factura.estado == 'error' && factura.error != null)
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Row(
                  children: [
                    Icon(Icons.error_outline,
                        size: 16, color: theme.colorScheme.onErrorContainer),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('Error: ${factura.error}',
                          style: TextStyle(
                              color: theme.colorScheme.onErrorContainer)),
                    ),
                  ],
                ),
              ),
            // QR
            if (factura.qr != null) ...[
              const SizedBox(height: 16),
              Center(
                child: SizedBox(
                  width: 150,
                  height: 150,
                  child: _buildQr(factura.qr!),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cerrar'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _condicionLabel(String condicion) => switch (condicion) {
        'ri' => 'IVA Responsable Inscripto',
        'monotributo' => 'Responsable Monotribo',
        'exento' => 'IVA Sujeto Exento',
        'consumidor_final' => 'Consumidor Final',
        _ => condicion,
      };

  String _formatearFechaCae(String caeVto) {
    // Formato: YYYYMMDD → DD/MM/YYYY
    if (caeVto.length == 8) {
      return '${caeVto.substring(6, 8)}/${caeVto.substring(4, 6)}/${caeVto.substring(0, 4)}';
    }
    return caeVto;
  }

  Widget _buildQr(String qrData) {
    if (qrData.startsWith('data:image')) {
      final base64Part = qrData.split(',').last;
      try {
        return Image.memory(base64Decode(base64Part), fit: BoxFit.contain);
      } catch (_) {
        return const Icon(Icons.qr_code, size: 80);
      }
    }
    return const Icon(Icons.qr_code, size: 80);
  }
}
