import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_providers.dart';
import '../map/map_screen.dart';
import '../settings/settings_screen.dart';

/// Home shell — bottom nav with Map / Group / Settings tabs.
/// The Map and Group tabs are placeholders for Sprint 2/3.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key, required this.child});

  final Widget child;

  static const String route = '/';

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _indexFromLocation(String location) {
    if (location.startsWith('/group')) return 1;
    if (location.startsWith('/settings')) return 2;
    return 0;
  }

  void _onTap(int index) {
    final routes = ['/', '/group', SettingsScreen.route];
    context.go(routes[index]);
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final index = _indexFromLocation(location);

    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: _onTap,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map),
            label: 'Map',
          ),
          NavigationDestination(
            icon: Icon(Icons.group_outlined),
            selectedIcon: Icon(Icons.group),
            label: 'Group',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

/// Map tab — wraps the real [MapScreen] (Sprint 2). Kept as a thin
/// wrapper so the bottom-nav shell can embed it without an AppBar
/// duplication (MapScreen brings its own AppBar).
class MapTab extends StatelessWidget {
  const MapTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const MapScreen();
  }
}

/// Placeholder group tab — real group UI lands in Sprint 3 (task 5.3.1).
class GroupTab extends StatelessWidget {
  const GroupTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.group_outlined, size: 64),
            SizedBox(height: 16),
            Text('Group', style: TextStyle(fontSize: 20)),
            SizedBox(height: 8),
            Text(
              'Create or join a travel group in Sprint 3.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}