import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/auth/auth_models.dart';
import 'package:ai_tourist_app/auth/auth_service.dart';

void main() {
  group('AuthSession', () {
    test('round-trips through fromJson/toJson', () {
      const session = AuthSession(
        userId: 'u-1',
        email: 'a@b.com',
        accessToken: 'tok',
        refreshToken: 'ref',
        displayName: 'A',
      );
      final json = session.toJson();
      final restored = AuthSession.fromJson(json);

      expect(restored.userId, 'u-1');
      expect(restored.email, 'a@b.com');
      expect(restored.accessToken, 'tok');
      expect(restored.refreshToken, 'ref');
      expect(restored.displayName, 'A');
    });

    test('supports null displayName', () {
      const session = AuthSession(
        userId: 'u-1',
        email: 'a@b.com',
        accessToken: 'tok',
        refreshToken: 'ref',
      );
      expect(session.displayName, isNull);
      expect(AuthSession.fromJson(session.toJson()).displayName, isNull);
    });
  });

  group('LoginRequest / SignupRequest', () {
    test('LoginRequest serializes', () {
      const req = LoginRequest(email: 'a@b.com', password: 'pw');
      expect(req.toJson(), {'email': 'a@b.com', 'password': 'pw'});
    });

    test('SignupRequest serializes', () {
      const req = SignupRequest(
        email: 'a@b.com',
        password: 'pw',
        displayName: 'A',
      );
      expect(req.toJson(), {
        'email': 'a@b.com',
        'password': 'pw',
        'displayName': 'A',
      });
    });
  });

  group('ApiKeyVaultState', () {
    test('default is empty + unknown', () {
      const state = ApiKeyVaultState();
      expect(state.hasKey, isFalse);
      expect(state.validationStatus, ApiKeyValidationStatus.unknown);
      expect(state.errorMessage, isNull);
    });

    test('validation status enum has all 4 values', () {
      expect(ApiKeyValidationStatus.values.length, 4);
    });
  });

  // Sanity-check mocktail wiring (used by widget tests).
  test('mocktail can stub AuthService', () {
    final auth = MockAuthService();
    when(() => auth.refresh()).thenAnswer((_) async => 'new-token');
    expect(auth.refresh(), completion('new-token'));
  });
}

class MockAuthService extends Mock implements AuthService {}