import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/auth/auth_models.dart';
import 'package:ai_tourist_app/auth/auth_providers.dart';
import 'package:ai_tourist_app/auth/auth_service.dart';
import 'package:ai_tourist_app/core/app_theme.dart';
import 'package:ai_tourist_app/widgets/app_logo.dart';

import 'helpers/test_overrides.dart';

void main() {
  group('AppTheme', () {
    testWidgets('light theme renders without error', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(body: Center(child: Text('hi'))),
        ),
      );
      expect(find.text('hi'), findsOneWidget);
    });

    testWidgets('dark theme renders without error', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark(),
          home: const Scaffold(body: Center(child: Text('hi'))),
        ),
      );
      expect(find.text('hi'), findsOneWidget);
    });

    test('light and dark are distinct', () {
      final light = AppTheme.light();
      final dark = AppTheme.dark();
      expect(light.scaffoldBackgroundColor, isNot(dark.scaffoldBackgroundColor));
    });
  });

  group('AppLogo', () {
    testWidgets('renders an explore icon', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: AppLogo(size: 64))),
      );
      expect(find.byIcon(Icons.explore_outlined), findsOneWidget);
    });

    testWidgets('respects size parameter', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: AppLogo(size: 100))),
      );
      final container = tester.widget<Container>(find.byType(Container));
      expect(container.width, 100);
      expect(container.height, 100);
    });
  });

  group('AuthState', () {
    test('default is unknown + not loading', () {
      const state = AuthState();
      expect(state.status, AuthStatus.unknown);
      expect(state.isLoading, isFalse);
      expect(state.session, isNull);
      expect(state.error, isNull);
    });

    test('copyWith merges fields', () {
      const state = AuthState();
      final updated = state.copyWith(isLoading: true, error: 'oops');
      expect(updated.isLoading, isTrue);
      expect(updated.error, 'oops');
      expect(updated.status, AuthStatus.unknown);
    });
  });

  // Re-uses the mock from test_overrides via a local definition to keep
  // this file self-contained.
  test('MockAuthService can be instantiated', () {
    final auth = MockAuthService();
    expect(auth, isNotNull);
  });
}

class MockAuthService extends Mock implements AuthService {}