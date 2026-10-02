import 'package:flutter/material.dart';

import '../../models/staff_session.dart';
import '../shell/adaptive_shell.dart';

class CajaScreen extends StatelessWidget {
  const CajaScreen({super.key});

  @override
  Widget build(BuildContext context) => const AdaptiveShell(rol: Rol.cajero);
}
