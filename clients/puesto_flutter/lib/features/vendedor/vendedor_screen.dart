import 'package:flutter/material.dart';

import '../../models/staff_session.dart';
import '../shell/legal_gate.dart';

class VendedorScreen extends StatelessWidget {
  const VendedorScreen({super.key});

  @override
  Widget build(BuildContext context) => const LegalGate(rol: Rol.vendedor);
}
