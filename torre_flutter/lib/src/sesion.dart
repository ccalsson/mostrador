import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

class SesionTorre extends ChangeNotifier {
  SesionTorre();

  TorreApi api = TorreApi(servidor: 'https://mostrador-ar.vercel.app');
  bool listo = false;
  bool entrando = false;
  String? error;

  bool get conectado => api.token.isNotEmpty;

  Future<void> iniciar() async {
    final prefs = await SharedPreferences.getInstance();
    api = TorreApi(
      servidor: prefs.getString('torre.servidor') ?? 'https://mostrador-ar.vercel.app',
      token: prefs.getString('torre.token') ?? '',
      email: prefs.getString('torre.email') ?? '',
    );
    api.onNoAutorizado = salir;
    listo = true;
    notifyListeners();
    if (conectado) {
      try {
        await api.cargarYo();
      } catch (_) {
        // Sin red o sesión vencida: la primera pantalla muestra el error y permite reintentar.
      }
      notifyListeners();
    }
  }

  Future<void> entrar(String servidor, String email, String password) async {
    entrando = true;
    error = null;
    notifyListeners();
    try {
      final nueva = TorreApi(servidor: servidor);
      nueva.onNoAutorizado = salir;
      await nueva.entrar(email, password);
      api = nueva;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('torre.servidor', api.servidor);
      await prefs.setString('torre.token', api.token);
      await prefs.setString('torre.email', api.email);
    } catch (e) {
      error = '$e';
      rethrow;
    } finally {
      entrando = false;
      notifyListeners();
    }
  }

  Future<void> salir() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('torre.token');
    api = TorreApi(servidor: api.servidor, email: api.email)..onNoAutorizado = salir;
    notifyListeners();
  }
}

class SesionScope extends InheritedNotifier<SesionTorre> {
  const SesionScope({super.key, required SesionTorre sesion, required super.child}) : super(notifier: sesion);

  static SesionTorre of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<SesionScope>();
    assert(scope != null, 'Falta SesionScope');
    return scope!.notifier!;
  }
}
