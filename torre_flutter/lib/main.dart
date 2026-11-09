import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/sesion.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final sesion = SesionTorre();
  await sesion.iniciar();
  runApp(TorreApp(sesion: sesion));
}
