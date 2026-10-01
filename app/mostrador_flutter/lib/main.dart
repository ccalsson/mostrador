import 'package:flutter/material.dart';

void main() => runApp(const MostradorApp());

class MostradorApp extends StatelessWidget {
  const MostradorApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Mostrador',
        theme: ThemeData(colorSchemeSeed: const Color(0xff1f6039), useMaterial3: true),
        home: const Scaffold(
          body: Center(
            child: Text('Cliente Flutter inicializado. La sesión y la sincronización usarán /api/v1.'),
          ),
        ),
      );
}
