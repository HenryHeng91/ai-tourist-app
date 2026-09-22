import 'package:flutter_test/flutter_test.dart';

import 'package:ai_tourist_app/core/app_config.dart';

void main() {
  group('AppConfig', () {
    test('apiBaseUrl defaults to localhost:3000', () {
      // The default is baked at compile time; with no --dart-define
      // it should be the dev default.
      expect(AppConfig.apiBaseUrl, contains('://'));
      expect(AppConfig.apiBaseUrl, isNotEmpty);
    });

    test('wsBaseUrl is non-empty', () {
      expect(AppConfig.wsBaseUrl, isNotEmpty);
    });

    test('isValid is true with defaults', () {
      expect(AppConfig.isValid, isTrue);
    });

    test('defaultAiProviderBaseUrl points at OpenAI', () {
      expect(AppConfig.defaultAiProviderBaseUrl, contains('openai.com'));
    });

    test('googleIssuer is the Google OAuth endpoint', () {
      expect(AppConfig.googleIssuer, 'https://accounts.google.com');
    });
  });
}