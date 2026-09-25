import 'package:flutter_test/flutter_test.dart';

import 'package:ai_tourist_app/settings/api_key_holder.dart';

void main() {
  group('ApiKeyHolder', () {
    test('starts empty', () {
      final holder = ApiKeyHolder();
      expect(holder.hasKey, isFalse);
      expect(holder.key, isNull);
      expect(holder.fingerprint, isNull);
      expect(holder.toString(), 'ApiKeyHolder(empty)');
    });

    test('setKey stores plaintext + fingerprint', () {
      final holder = ApiKeyHolder();
      holder.setKey('sk-test-1234567890');
      expect(holder.hasKey, isTrue);
      expect(holder.key, 'sk-test-1234567890');
      expect(holder.fingerprint, isNotNull);
      expect(holder.fingerprint!.length, 12);
    });

    test('clear zeroes the key', () {
      final holder = ApiKeyHolder();
      holder.setKey('sk-test');
      holder.clear();
      expect(holder.hasKey, isFalse);
      expect(holder.key, isNull);
      expect(holder.fingerprint, isNull);
    });

    test('fingerprint is deterministic for the same key', () {
      final a = ApiKeyHolder()..setKey('sk-abc');
      final b = ApiKeyHolder()..setKey('sk-abc');
      expect(a.fingerprint, b.fingerprint);
    });

    test('fingerprint differs for different keys', () {
      final a = ApiKeyHolder()..setKey('sk-abc');
      final b = ApiKeyHolder()..setKey('sk-xyz');
      expect(a.fingerprint, isNot(b.fingerprint));
    });

    test('toString reflects loaded state without leaking the key', () {
      final holder = ApiKeyHolder()..setKey('sk-secret-do-not-leak');
      final str = holder.toString();
      expect(str, contains('loaded'));
      expect(str, contains('fp='));
      // The plaintext must NEVER appear in the string representation.
      expect(str, isNot(contains('sk-secret-do-not-leak')));
    });
  });
}