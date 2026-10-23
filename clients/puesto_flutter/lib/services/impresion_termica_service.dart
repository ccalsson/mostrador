import 'dart:typed_data';

import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/ticket.dart';

/// Resultado de escanear impresoras Bluetooth.
class ImpresoraBluetooth {
  const ImpresoraBluetooth({
    required this.macAddress,
    required this.nombre,
  });

  final String macAddress;
  final String nombre;

  @override
  String toString() => 'ImpresoraBluetooth($nombre, $macAddress)';
}

/// Contrato de impresión térmica Bluetooth/USB directa.
///
/// Permite buscar impresoras, conectar a una específica, imprimir tickets
/// con comandos ESC/POS y desconectar. Guarda la impresora preferida en
/// SharedPreferences para reconexión automática.
abstract class ImpresionTermicaService {
  /// Escanea impresoras Bluetooth disponibles (timeout por defecto 4s).
  Future<List<ImpresoraBluetooth>> buscarImpresoras({
    int timeoutSeconds = 4,
  });

  /// Conecta a una impresora específica por MAC address.
  Future<void> conectar(String macAddress);

  /// Imprime un ticket directamente en la térmica conectada (ESC/POS).
  Future<void> imprimirTicket(Ticket ticket);

  /// Desconecta la impresora actual.
  Future<void> desconectar();

  /// Devuelve la MAC de la impresora preferida guardada, o null.
  Future<String?> obtenerImpresoraPreferida();

  /// Guarda la MAC de la impresora preferida.
  Future<void> guardarImpresoraPreferida(String macAddress);

  /// Si hay una impresora conectada, devuelve su nombre; si no, null.
  String? nombreImpresoraConectada();

  /// Si está conectada a una térmica.
  bool get estaConectada;
}

/// Implementación real que usa flutter_blue_plus para BLE.
class ImpresionTermicaServiceImpl implements ImpresionTermicaService {
  ImpresionTermicaServiceImpl();

  static const _prefKey = 'impresora_termica_mac';

  BluetoothDevice? _dispositivo;
  BluetoothCharacteristic? _caracteristica;

  @override
  bool get estaConectada =>
      _dispositivo != null &&
      _dispositivo!.isConnected &&
      _caracteristica != null;

  @override
  String? nombreImpresoraConectada() => _dispositivo?.platformName;

  @override
  Future<List<ImpresoraBluetooth>> buscarImpresoras({
    int timeoutSeconds = 4,
  }) async {
    final resultados = <ImpresoraBluetooth>[];

    // Escanear dispositivos BLE cercanos
    await FlutterBluePlus.startScan(
      timeout: Duration(seconds: timeoutSeconds),
    );

    // Escuchar resultados del escaneo
    await for (final scanResults in FlutterBluePlus.scanResults) {
      for (final result in scanResults) {
        final mac = result.device.remoteId.str;
        final nombre = result.device.platformName.isNotEmpty
            ? result.device.platformName
            : 'Impresora $mac';
        // Filtrar solo dispositivos que parecen impresoras (por nombre o servicios)
        if (_pareceImpresora(nombre, result.device)) {
          resultados.add(ImpresoraBluetooth(macAddress: mac, nombre: nombre));
        }
      }
    }

    await FlutterBluePlus.stopScan();
    return resultados;
  }

  bool _pareceImpresora(String nombre, BluetoothDevice device) {
    final nombreLower = nombre.toLowerCase();
    // Nombres comunes de impresoras térmicas
    if (nombreLower.contains('printer') ||
        nombreLower.contains('impresora') ||
        nombreLower.contains('thermal') ||
        nombreLower.contains('pos') ||
        nombreLower.contains('receipt') ||
        nombreLower.contains('esc')) {
      return true;
    }
    return false;
  }

  @override
  Future<void> conectar(String macAddress) async {
    final device = BluetoothDevice.fromId(macAddress);

    // Conectar al dispositivo
    await device.connect(timeout: const Duration(seconds: 10));

    // Descubrir servicios
    final services = await device.discoverServices();

    // Buscar característica de escritura (para enviar datos ESC/POS)
    BluetoothCharacteristic? writeChar;
    for (final service in services) {
      for (final char in service.characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          writeChar = char;
          break;
        }
      }
      if (writeChar != null) break;
    }

    if (writeChar == null) {
      await device.disconnect();
      throw Exception('No se encontró característica de escritura en la impresora.');
    }

    _dispositivo = device;
    _caracteristica = writeChar;

    // Guardar como preferida
    await guardarImpresoraPreferida(macAddress);
  }

  @override
  Future<void> imprimirTicket(Ticket ticket) async {
    if (!estaConectada) {
      throw Exception('No hay impresora conectada.');
    }

    // Generar comandos ESC/POS
    final bytes = _generarBytesEscPos(ticket);

    // Enviar en chunks (las impresoras térmicas tienen buffer limitado)
    const chunkSize = 512;
    for (var i = 0; i < bytes.length; i += chunkSize) {
      final end = (i + chunkSize < bytes.length) ? i + chunkSize : bytes.length;
      final chunk = bytes.sublist(i, end);

      if (_caracteristica!.properties.writeWithoutResponse) {
        await _caracteristica!.write(chunk.toList(), withoutResponse: true);
      } else {
        await _caracteristica!.write(chunk.toList());
      }

      // Pequeña pausa para no saturar el buffer
      await Future.delayed(const Duration(milliseconds: 50));
    }
  }

  Uint8List _generarBytesEscPos(Ticket ticket) {
    final bytes = <int>[];
    final c = ticket.contenido;

    // Inicialización
    bytes.addAll([0x1B, 0x40]); // Reset
    bytes.addAll([0x1B, 0x74, 0x02]); // Code table CP437

    // Encabezado centrado y en negrita
    bytes.addAll([0x1B, 0x61, 0x01]); // Centrar
    bytes.addAll([0x1B, 0x45, 0x01]); // Negrita ON
    bytes.addAll([0x1D, 0x21, 0x11]); // Doble ancho y alto
    bytes.addAll(_textoABytes(c.puesto));
    bytes.add(0x0A); // Nueva línea
    bytes.addAll([0x1D, 0x21, 0x00]); // Tamaño normal
    bytes.addAll([0x1B, 0x45, 0x00]); // Negrita OFF

    // Número de comprobante
    bytes.addAll(_textoABytes('Comprobante Nº ${c.numero}'));
    bytes.add(0x0A);

    // Fecha
    bytes.addAll(_textoABytes(c.fecha));
    bytes.add(0x0A);

    // Cliente
    if (c.cliente.isNotEmpty) {
      bytes.addAll(_textoABytes('Cliente: ${c.cliente}'));
      bytes.add(0x0A);
    }

    // Alinear a la izquierda
    bytes.addAll([0x1B, 0x61, 0x00]);

    // Línea separadora
    bytes.addAll(_textoABytes('-' * 48));
    bytes.add(0x0A);

    // Items
    for (final item in c.items) {
      final cantidad = item.cantidad == item.cantidad.roundToDouble()
          ? item.cantidad.toStringAsFixed(0)
          : item.cantidad.toStringAsFixed(2);
      final texto = '$cantidad ${item.unidad} ${item.nombre}';
      final precio = _formatearMoneda(item.subtotal);

      // Calcular espaciado
      final espacio = 48 - texto.length - precio.length;
      final linea = texto + ' ' * (espacio > 0 ? espacio : 1) + precio;
      bytes.addAll(_textoABytes(linea));
      bytes.add(0x0A);
    }

    // Línea separadora
    bytes.addAll(_textoABytes('-' * 48));
    bytes.add(0x0A);

    // Total en negrita
    bytes.addAll([0x1B, 0x45, 0x01]); // Negrita ON
    final totalTexto = 'TOTAL';
    final totalPrecio = _formatearMoneda(c.total);
    final espacioTotal = 48 - totalTexto.length - totalPrecio.length;
    bytes.addAll(_textoABytes(totalTexto + ' ' * (espacioTotal > 0 ? espacioTotal : 1) + totalPrecio));
    bytes.add(0x0A);
    bytes.addAll([0x1B, 0x45, 0x00]); // Negrita OFF

    // Forma de pago
    bytes.addAll(_textoABytes('Pago: ${_formaPagoLabel(c.formaPago)}'));
    bytes.add(0x0A);
    bytes.addAll(_textoABytes('Recibido: ${_formatearMoneda(c.recibido)}'));
    bytes.add(0x0A);
    if (c.vuelto > 0) {
      bytes.addAll(_textoABytes('Vuelto: ${_formatearMoneda(c.vuelto)}'));
      bytes.add(0x0A);
    }

    // Pie de página centrado
    if (c.pie.isNotEmpty) {
      bytes.addAll([0x1B, 0x61, 0x01]); // Centrar
      bytes.addAll(_textoABytes('-' * 48));
      bytes.add(0x0A);
      bytes.addAll(_textoABytes(c.pie));
      bytes.add(0x0A);
    }

    // Alimentar y cortar papel
    bytes.addAll([0x0A, 0x0A, 0x0A]); // 3 líneas en blanco
    bytes.addAll([0x1D, 0x56, 0x00]); // Corte completo

    return Uint8List.fromList(bytes);
  }

  List<int> _textoABytes(String texto) {
    // Codificación básica ASCII/CP437 para caracteres especiales
    final bytes = <int>[];
    for (var i = 0; i < texto.length; i++) {
      final char = texto[i];
      final code = char.codeUnitAt(0);

      // Caracteres ASCII básicos
      if (code < 128) {
        bytes.add(code);
      } else {
        // Mapeo de caracteres especiales españoles a CP437
        switch (char) {
          case 'á':
            bytes.add(0xA0);
            break;
          case 'é':
            bytes.add(0x82);
            break;
          case 'í':
            bytes.add(0xA1);
            break;
          case 'ó':
            bytes.add(0xA2);
            break;
          case 'ú':
            bytes.add(0xA3);
            break;
          case 'ñ':
            bytes.add(0xA4);
            break;
          case 'Ñ':
            bytes.add(0xA5);
            break;
          case 'ü':
            bytes.add(0x81);
            break;
          case 'Á':
            bytes.add(0xB5);
            break;
          case 'É':
            bytes.add(0x90);
            break;
          case 'Ó':
            bytes.add(0xE0);
            break;
          case 'Ú':
            bytes.add(0xE9);
            break;
          default:
            bytes.add(0x3F); // '?' para caracteres no mapeados
        }
      }
    }
    return bytes;
  }

  String _formatearMoneda(double valor) =>
      '\$${valor.toStringAsFixed(2).replaceAll('.', ',')}';

  String _formaPagoLabel(String apiValue) {
    const labels = {
      'efectivo': 'Efectivo',
      'transferencia': 'Transferencia',
      'tarjeta': 'Tarjeta',
      'cuenta_corriente': 'Cuenta corriente',
    };
    return labels[apiValue] ?? apiValue;
  }

  @override
  Future<void> desconectar() async {
    if (_dispositivo != null) {
      await _dispositivo!.disconnect();
      _dispositivo = null;
      _caracteristica = null;
    }
  }

  @override
  Future<String?> obtenerImpresoraPreferida() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefKey);
  }

  @override
  Future<void> guardarImpresoraPreferida(String macAddress) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, macAddress);
  }
}

/// Implementación fake para tests (no usa Bluetooth real).
class ImpresionTermicaFake implements ImpresionTermicaService {
  ImpresionTermicaFake({
    this.errorConectar,
    this.errorImprimir,
    List<ImpresoraBluetooth>? impresoras,
  }) : impresorasDisponibles = impresoras ?? [];

  final Object? errorConectar;
  final Object? errorImprimir;
  final List<ImpresoraBluetooth> impresorasDisponibles;

  String? _macConectada;
  String? _nombreConectado;
  final List<Ticket> ticketsImpresos = [];
  String? impresoraPreferidaGuardada;

  @override
  bool get estaConectada => _macConectada != null;

  @override
  String? nombreImpresoraConectada() => _nombreConectado;

  @override
  Future<List<ImpresoraBluetooth>> buscarImpresoras({
    int timeoutSeconds = 4,
  }) async {
    return impresorasDisponibles;
  }

  @override
  Future<void> conectar(String macAddress) async {
    if (errorConectar != null) throw errorConectar!;
    _macConectada = macAddress;
    final impresora = impresorasDisponibles.firstWhere(
      (i) => i.macAddress == macAddress,
      orElse: () => ImpresoraBluetooth(macAddress: macAddress, nombre: 'Impresora $macAddress'),
    );
    _nombreConectado = impresora.nombre;
  }

  @override
  Future<void> imprimirTicket(Ticket ticket) async {
    if (!estaConectada) throw Exception('No hay impresora conectada.');
    if (errorImprimir != null) throw errorImprimir!;
    ticketsImpresos.add(ticket);
  }

  @override
  Future<void> desconectar() async {
    _macConectada = null;
    _nombreConectado = null;
  }

  @override
  Future<String?> obtenerImpresoraPreferida() async {
    return impresoraPreferidaGuardada;
  }

  @override
  Future<void> guardarImpresoraPreferida(String macAddress) async {
    impresoraPreferidaGuardada = macAddress;
  }
}

/// Provider de Riverpod para el servicio de impresión térmica.
final impresionTermicaServiceProvider = Provider<ImpresionTermicaService>(
  (ref) => ImpresionTermicaServiceImpl(),
);
