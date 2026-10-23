import 'package:flutter/material.dart';

import '../../models/staff_session.dart';
import '../shell/legal_gate.dart';

class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context) => const LegalGate(rol: Rol.admin);
}
