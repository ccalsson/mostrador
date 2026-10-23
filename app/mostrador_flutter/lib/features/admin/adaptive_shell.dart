import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../caja/caja_pane.dart';
import 'addons_pane.dart';
import 'escritorio_pane.dart';
import '../../providers.dart';

/// Shell de navegación adaptive para el dueño (admin).
///
/// En pantallas anchas usa NavigationRail; en angostas, NavigationBar.
/// El destino "Escritorio" solo es visible para admin (el backend valida el rol).
class AdaptiveShell extends ConsumerStatefulWidget {
  const AdaptiveShell({super.key});

  @override
  ConsumerState<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _AdaptiveShellState extends ConsumerState<AdaptiveShell> {
  int _index = 0;

  static const _destinos = <_ShellDestination>[
    _ShellDestination(
      label: 'Caja',
      icon: Icons.point_of_sale_outlined,
      selectedIcon: Icons.point_of_sale,
    ),
    _ShellDestination(
      label: 'Escritorio',
      icon: Icons.dashboard_outlined,
      selectedIcon: Icons.dashboard,
    ),
    _ShellDestination(
      label: 'Add-ons',
      icon: Icons.extension_outlined,
      selectedIcon: Icons.extension,
    ),
  ];

  Widget _buildBody(int index) {
    switch (index) {
      case 0:
        return const CajaPane();
      case 1:
        return EscritorioPane(service: ref.watch(escritorioServiceProvider));
      case 2:
        return AddonsPane(service: ref.watch(addonsServiceProvider));
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    final ancho = MediaQuery.sizeOf(context).width;
    final usarRail = ancho >= 640;

    if (usarRail) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              labelType: NavigationRailLabelType.all,
              destinations: _destinos
                  .map((d) => NavigationRailDestination(
                        icon: Icon(d.icon),
                        selectedIcon: Icon(d.selectedIcon),
                        label: Text(d.label),
                      ))
                  .toList(),
            ),
            const VerticalDivider(width: 1, thickness: 1),
            Expanded(child: _buildBody(_index)),
          ],
        ),
      );
    }

    return Scaffold(
      body: _buildBody(_index),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: _destinos
            .map((d) => NavigationDestination(
                  icon: Icon(d.icon),
                  selectedIcon: Icon(d.selectedIcon),
                  label: d.label,
                ))
            .toList(),
      ),
    );
  }
}

class _ShellDestination {
  const _ShellDestination({
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}
