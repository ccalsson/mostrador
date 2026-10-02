import 'package:flutter/material.dart';

/// Pantalla puente mientras se restaura la sesión guardada.
class SessionScreen extends StatelessWidget {
  const SessionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Verificando sesión…'),
          ],
        ),
      ),
    );
  }
}
