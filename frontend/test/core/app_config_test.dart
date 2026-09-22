import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ai_tourist_app/core/app_config.dart';

void main() {
  group('AppConfig', () {
    test('apiBaseUrl defaults to localhost:4000 (dev backend port)', () {
      // The default is baked at compile time; with no --dart-define
      // it should be the dev default.
      expect(AppConfig.apiBaseUrl, 'http://localhost:4000');
    });

    test('wsBaseUrl defaults to ws://localhost:4000', () {
      expect(AppConfig.wsBaseUrl, 'ws://localhost:4000');
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

  group('NFR-SEC-2 transport security', () {
    test('dev default is http:// (allowed in non-release)', () {
      // The baked dev default is intentionally plain http — this test
      // documents that and guards against accidentally shipping https
      // as the dev default (which would break local dev).
      expect(AppConfig.apiBaseUrl, startsWith('http://'));
      expect(AppConfig.assertProductionHttps(), isFalse);
    });

    test('assertProductionHttps does not throw in debug mode', () {
      // In debug/test mode the dev http:// URL must not throw — only
      // release builds enforce TLS (see AppConfig.isRelease).
      expect(kReleaseMode, isFalse);
      AppConfig.assertProductionHttps(); // should not throw
    });
  });
}