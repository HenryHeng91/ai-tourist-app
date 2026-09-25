import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/auth/auth_models.dart';
import 'package:ai_tourist_app/auth/auth_providers.dart';
import 'package:ai_tourist_app/auth/auth_service.dart';
import 'package:ai_tourist_app/core/secure_storage_service.dart';

/// Fakes + helpers shared by widget tests. Keeps the test files small
/// and ensures we never hit a real backend or platform storage.
class _FakeSecureStorage implements SecureStorageService {
  final Map<String, String> _store = {};

  @override
  Future<String?> read(String key) async => _store[key];

  @override
  Future<void> write(String key, String value) async {
    _store[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _store.remove(key);
  }

  @override
  Future<void> deleteAll() async {
    _store.clear();
  }

  @override
  Future<bool> containsKey(String key) async => _store.containsKey(key);
}

class MockAuthService extends Mock implements AuthService {}

/// Builds a [ProviderContainer] with a fake secure storage and a mocked
/// [AuthService]. The mock's `login`/`signup` methods must be stubbed
/// by the caller.
ProviderContainer makeContainer({
  required MockAuthService auth,
  List<Override>? extra,
}) {
  final storage = _FakeSecureStorage();
  return ProviderContainer(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      authServiceProvider.overrideWithValue(auth),
      ...?extra,
    ],
  );
}

/// A canned successful session for stubbing.
AuthSession fakeSession() => const AuthSession(
      userId: 'u-1',
      email: 'test@example.com',
      accessToken: 'access-jwt',
      refreshToken: 'refresh-jwt',
      displayName: 'Test',
    );

/// Pumps [widget] inside a MaterialApp with [container] unscoped.
Future<void> pumpApp(
  WidgetTester tester,
  Widget widget, {
  required ProviderContainer container,
}) async {
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(home: widget),
    ),
  );
}