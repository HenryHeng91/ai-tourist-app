import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/auth/auth_providers.dart';
import 'package:ai_tourist_app/auth/auth_service.dart';
import 'package:ai_tourist_app/settings/api_key_holder.dart';
import 'package:ai_tourist_app/settings/api_key_validator_live.dart';
import 'package:ai_tourist_app/settings/key_vault_service.dart';
import 'package:ai_tourist_app/settings/settings_providers.dart';
import 'package:ai_tourist_app/settings/settings_screen.dart';

import 'helpers/test_overrides.dart';

class _MockVault extends Mock implements KeyVaultService {}
class _MockValidator extends Mock implements ApiKeyValidatorLive {}

void main() {
  setUpAll(() {
    registerFallbackValue('');
  });

  group('SettingsScreen', () {
    testWidgets('renders vault card with API key section', (tester) async {
      final auth = MockAuthService();
      final vault = _MockVault();
      final validator = _MockValidator();
      final holder = ApiKeyHolder();

      when(() => vault.hasStoredKey()).thenAnswer((_) async => false);

      final container = makeContainer(
        auth: auth,
        extra: [
          keyVaultServiceProvider.overrideWithValue(vault),
          apiKeyValidatorProvider.overrideWithValue(validator),
          apiKeyHolderProvider.overrideWithValue(holder),
        ],
      );

      await pumpApp(
        tester,
        const SettingsScreen(),
        container: container,
      );
      await tester.pump();

      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('AI Provider API Key'), findsOneWidget);
      expect(find.text('Validate & save'), findsOneWidget);
      expect(find.text('Account'), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);
    });

    testWidgets('shows "Valid" chip when key is stored', (tester) async {
      final auth = MockAuthService();
      final vault = _MockVault();
      final validator = _MockValidator();
      final holder = ApiKeyHolder();

      when(() => vault.hasStoredKey()).thenAnswer((_) async => true);
      when(() => vault.decrypt()).thenAnswer((_) async => 'sk-stored');

      final container = makeContainer(
        auth: auth,
        extra: [
          keyVaultServiceProvider.overrideWithValue(vault),
          apiKeyValidatorProvider.overrideWithValue(validator),
          apiKeyHolderProvider.overrideWithValue(holder),
        ],
      );

      await pumpApp(
        tester,
        const SettingsScreen(),
        container: container,
      );
      await tester.pumpAndSettle();

      expect(find.text('Valid'), findsOneWidget);
      expect(find.text('Re-validate'), findsOneWidget);
      expect(find.text('Remove'), findsOneWidget);
    });

    testWidgets('shows encryption explanation copy', (tester) async {
      final auth = MockAuthService();
      final vault = _MockVault();
      final validator = _MockValidator();
      final holder = ApiKeyHolder();

      when(() => vault.hasStoredKey()).thenAnswer((_) async => false);

      final container = makeContainer(
        auth: auth,
        extra: [
          keyVaultServiceProvider.overrideWithValue(vault),
          apiKeyValidatorProvider.overrideWithValue(validator),
          apiKeyHolderProvider.overrideWithValue(holder),
        ],
      );

      await pumpApp(
        tester,
        const SettingsScreen(),
        container: container,
      );
      await tester.pump();

      expect(find.textContaining('AES-256-GCM'), findsOneWidget);
      expect(find.textContaining('never sent to our servers'), findsOneWidget);
    });
  });
}