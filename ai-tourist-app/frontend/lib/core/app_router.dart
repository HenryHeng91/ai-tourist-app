import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_providers.dart';
import '../auth/auth_screens.dart';
import '../core/home_shell.dart';
import '../map/map_screen.dart';
import '../settings/settings_screen.dart';
import '../voiceover/voiceover_screen.dart';

/// Builds the app's [GoRouter] with auth redirect logic.
///
/// Routes:
///   /login, /signup — public
///   /                — home shell (map tab)
///   /map             — full-screen map (Sprint 2)
///   /voiceover/:spotId — voiceover flow for a spot (Sprint 2)
///   /group           — home shell (group tab)
///   /settings        — home shell (settings tab)
GoRouter buildAppRouter(Ref ref) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authNotifierProvider);
      final isAuthRoute = state.matchedLocation == LoginScreen.route ||
          state.matchedLocation == SignupScreen.route;

      switch (auth.status) {
        case AuthStatus.unknown:
          // While bootstrapping, send to login (it'll redirect once
          // bootstrap resolves).
          return isAuthRoute ? null : LoginScreen.route;
        case AuthStatus.unauthenticated:
          return isAuthRoute ? null : LoginScreen.route;
        case AuthStatus.authenticated:
          return isAuthRoute ? '/' : null;
      }
    },
    routes: [
      GoRoute(
        path: LoginScreen.route,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: SignupScreen.route,
        builder: (context, state) => const SignupScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => HomeShell(child: child),
        routes: [
          GoRoute(
            path: HomeShell.route,
            builder: (context, state) => const MapTab(),
          ),
          GoRoute(
            path: '/group',
            builder: (context, state) => const GroupTab(),
          ),
          GoRoute(
            path: SettingsScreen.route,
            builder: (context, state) => const SettingsScreen(),
          ),
        ],
      ),
      // Full-screen map (outside the shell — no bottom nav).
      GoRoute(
        path: MapScreen.route,
        builder: (context, state) => const MapScreen(),
      ),
      // Voiceover flow for a specific spot.
      GoRoute(
        path: '${VoiceoverScreen.route}/:spotId',
        builder: (context, state) => VoiceoverScreen(
          spotId: state.pathParameters['spotId']!,
        ),
      ),
    ],
  );
}

/// Bridges [AuthNotifier] state changes to [ChangeNotifier] for
/// [GoRouter.refreshListenable].
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this.ref) {
    _sub = ref.listen(authNotifierProvider, (_, __) => notifyListeners());
  }

  final Ref ref;
  late final ProviderSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}