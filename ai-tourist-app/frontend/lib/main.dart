import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/auth_providers.dart';
import 'core/app_router.dart';
import 'core/app_theme.dart';
import 'settings/settings_providers.dart';

/// Root widget — sets up theme + router + bootstraps auth & vault.
class AiTravelGuideApp extends ConsumerStatefulWidget {
  const AiTravelGuideApp({super.key});

  @override
  ConsumerState<AiTravelGuideApp> createState() => _AiTravelGuideAppState();
}

class _AiTravelGuideAppState extends ConsumerState<AiTravelGuideApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Bootstrap auth state (restores session from secure storage if present).
    Future.microtask(() {
      ref.read(authNotifierProvider.notifier).bootstrap();
      ref.read(apiKeyVaultNotifierProvider.notifier).bootstrap();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Clear the in-memory API key when the app goes to background
    // (task 2.2.3). The encrypted blob stays in storage.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      ref.read(apiKeyVaultNotifierProvider.notifier).clearFromMemory();
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = buildAppRouter(ref);
    return MaterialApp.router(
      title: 'AI Travel Guide',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      routerConfig: router,
    );
  }
}

void main() {
  runApp(const ProviderScope(child: AiTravelGuideApp()));
}