import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/auth/auth_models.dart';
import 'package:ai_tourist_app/auth/auth_providers.dart';
import 'package:ai_tourist_app/auth/auth_screens.dart';
import 'package:ai_tourist_app/auth/auth_service.dart';

import 'helpers/test_overrides.dart';

void main() {
  setUpAll(() {
    registerFallbackValue(
      const LoginRequest(email: '', password: ''),
    );
    registerFallbackValue(
      const SignupRequest(email: '', password: '', displayName: ''),
    );
  });

  group('LoginScreen', () {
    testWidgets('renders email + password fields and sign-in button',
        (tester) async {
      final auth = MockAuthService();
      await pumpApp(
        tester,
        const LoginScreen(),
        container: makeContainer(auth: auth),
      );

      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Sign up'), findsOneWidget);
    });

    testWidgets('shows validation error on empty submit', (tester) async {
      final auth = MockAuthService();
      await pumpApp(
        tester,
        const LoginScreen(),
        container: makeContainer(auth: auth),
      );

      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();

      expect(find.text('Email is required'), findsOneWidget);
      expect(find.text('Password is required'), findsOneWidget);
      // login() must not have been called.
      verifyNever(() => auth.login(any()));
    });

    testWidgets('rejects malformed email', (tester) async {
      final auth = MockAuthService();
      await pumpApp(
        tester,
        const LoginScreen(),
        container: makeContainer(auth: auth),
      );

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'not-an-email',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'password123',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();

      expect(find.text('Enter a valid email'), findsOneWidget);
      verifyNever(() => auth.login(any()));
    });

    testWidgets('calls login on valid input and shows spinner',
        (tester) async {
      final auth = MockAuthService();
      // Hang the login future so we can observe the loading state.
      when(() => auth.login(any())).thenAnswer(
        (_) => Future.delayed(const Duration(seconds: 1), fakeSession),
      );

      await pumpApp(
        tester,
        const LoginScreen(),
        container: makeContainer(auth: auth),
      );

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'test@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'password123',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();

      // Button should now show a spinner, not the label.
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsNothing);

      verify(() => auth.login(any())).called(1);
    });

    testWidgets('toggles password visibility', (tester) async {
      final auth = MockAuthService();
      await pumpApp(
        tester,
        const LoginScreen(),
        container: makeContainer(auth: auth),
      );

      final passwordField = find.widgetWithText(TextFormField, 'Password');
      final initialObscure = (tester.widget(passwordField) as TextFormField)
          .obscureText;
      expect(initialObscure, isTrue);

      await tester.tap(find.byIcon(Icons.visibility_outlined));
      await tester.pump();

      final afterObscure = (tester.widget(passwordField) as TextFormField)
          .obscureText;
      expect(afterObscure, isFalse);
    });
  });

  group('SignupScreen', () {
    testWidgets('renders name + email + password fields', (tester) async {
      final auth = MockAuthService();
      await pumpApp(
        tester,
        const SignupScreen(),
        container: makeContainer(auth: auth),
      );

      expect(find.text('Create your account'), findsOneWidget);
      expect(
        find.widgetWithText(TextFormField, 'Display name'),
        findsOneWidget,
      );
      expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
      expect(
        find.widgetWithText(FilledButton, 'Create account'),
        findsOneWidget,
      );
    });

    testWidgets('validates all fields on empty submit', (tester) async {
      final auth = MockAuthService();
      await pumpApp(
        tester,
        const SignupScreen(),
        container: makeContainer(auth: auth),
      );

      await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
      await tester.pump();

      expect(find.text('Name is required'), findsOneWidget);
      expect(find.text('Email is required'), findsOneWidget);
      expect(find.text('Password is required'), findsOneWidget);
      verifyNever(() => auth.signup(any()));
    });

    testWidgets('calls signup on valid input', (tester) async {
      final auth = MockAuthService();
      when(() => auth.signup(any())).thenAnswer(
        (_) => Future.delayed(const Duration(seconds: 1), fakeSession),
      );

      await pumpApp(
        tester,
        const SignupScreen(),
        container: makeContainer(auth: auth),
      );

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Display name'),
        'Alex Traveler',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'alex@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'password123',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      verify(() => auth.signup(any())).called(1);
    });
  });

  group('Login ↔ Signup navigation', () {
    testWidgets('login screen has a link to signup', (tester) async {
      final auth = MockAuthService();
      final container = makeContainer(auth: auth);
      final router = GoRouter(
        initialLocation: '/login',
        routes: [
          GoRoute(
            path: '/login',
            builder: (_, __) => const LoginScreen(),
          ),
          GoRoute(
            path: '/signup',
            builder: (_, __) => const SignupScreen(),
          ),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(routerConfig: router),
        ),
      );

      // Tap "Sign up" link → router navigates to /signup.
      await tester.tap(find.text('Sign up'));
      await tester.pumpAndSettle();

      expect(find.text('Create your account'), findsOneWidget);
    });
  });
}