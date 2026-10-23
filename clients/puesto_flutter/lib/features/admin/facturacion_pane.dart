import 'dart:convert';

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

  late TextEditingController _cuit;
  late TextEditingController _razon;
  late TextEditingController _domicilio;
  late TextEditingController _iibb;
  late TextEditingController _pv;
  late TextEditingController _inicio;
  String _condicion = 'ri';
  double _alicuota = 21;
  String _ambiente = 'homo';

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
          );
      ref.invalidate(facturacionPanelProvider);
      if (mounted) {
        setState(() => _configAbierta = false);
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
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nota de crédito'),
        content: const Text('Se emitirá una nota de crédito para esta factura.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Emitir NC')),
        ],
      ),
    );
    if (confirmar != true) return;
    try {
      final nc =
          await ref.read(facturacionServiceProvider).emitirNotaCredito(facturaId);
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
              child: Text(
                config.lista
                    ? 'ARCA está inhabilitada. Habilitala para emitir comprobantes.'
                    : 'Completá la configuración fiscal para habilitar ARCA.',
                style: theme.textTheme.bodyMedium,
                textAlign: TextAlign.center,
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
                const Text('Certificado'),
                const SizedBox(width: 16),
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
                const Text('Clave privada'),
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
    final emitidas = widget.data.emitidas;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Comprobantes emitidos (${emitidas.length})',
                style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            if (emitidas.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text('Sin comprobantes emitidos.',
                    textAlign: TextAlign.center),
              )
            else
              for (final f in emitidas)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  onTap: () => _mostrarDetalle(f.id),
                  leading: Icon(
                    f.esNotaCredito ? Icons.undo : Icons.description_outlined,
                    color: f.esNotaCredito ? Colors.orange : Colors.green,
                    size: 20,
                  ),
                  title: Text('${f.nombre} ${f.numeroFiscal}'),
                  subtitle: Text(
                    '${f.receptorNombre ?? 'Consumidor Final'} · ${moneda(f.total)}'
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
        constraints: const BoxConstraints(maxWidth: 520, maxHeight: 640),
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
            Row(
              children: [
                Expanded(
                  child: Text(factura.nombre,
                      style: theme.textTheme.titleMedium),
                ),
                if (factura.ambiente == 'homo')
                  Chip(
                    label: const Text('HOMO'),
                    backgroundColor: Colors.orange.withValues(alpha: 0.15),
                    side: BorderSide.none,
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact,
                    labelStyle: const TextStyle(fontSize: 11, color: Colors.orange),
                  ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('N° ${factura.numeroFiscal}',
                style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('Fecha: ${factura.fecha}',
                style: theme.textTheme.bodySmall),
            const Divider(height: 24),
            if (factura.emisorRazon != null) ...[
              Text('Emisor', style: theme.textTheme.labelMedium),
              Text('${factura.emisorRazon} · CUIT ${factura.emisorCuit}'),
              if (factura.emisorDomicilio != null)
                Text(factura.emisorDomicilio!,
                    style: theme.textTheme.bodySmall),
              const SizedBox(height: 8),
            ],
            Text('Receptor', style: theme.textTheme.labelMedium),
            Text(factura.receptorNombre ?? 'Consumidor Final'),
            const Divider(height: 24),
            if (factura.lineas.isNotEmpty) ...[
              for (final linea in factura.lineas)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${linea.cantidad} ${linea.unidad} ${linea.nombre}',
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                      Text(moneda(linea.total),
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              const Divider(height: 16),
            ],
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (factura.alicuota > 0) ...[
                      Text('Neto: ${moneda(factura.neto)}',
                          style: theme.textTheme.bodySmall),
                      Text(
                          'IVA ${factura.alicuota}%: ${moneda(factura.iva)}',
                          style: theme.textTheme.bodySmall),
                    ],
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
            if (factura.cae != null)
              Text('CAE: ${factura.cae} · Vto: ${factura.caeVto}',
                  style: theme.textTheme.bodySmall),
            if (factura.estado == 'error' && factura.error != null)
              Text('Error: ${factura.error}',
                  style: TextStyle(color: theme.colorScheme.error)),
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
