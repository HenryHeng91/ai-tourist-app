import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Namespaced keys for [FlutterSecureStorage]. Centralised so nothing
/// else in the app hard-codes storage keys.
class SecureStorageKeys {
  const SecureStorageKeys._();

  static const String namespace = 'ai_tourist_app.';

  static const String accessToken = '${namespace}access_token';
  static const String refreshToken = '${namespace}refresh_token';
  static const String userId = '${namespace}user_id';
  static const String userEmail = '${namespace}user_email';
  static const String displayName = '${namespace}display_name';

  /// Local Key Encryption Key (KEK) for the API-key vault (AES-256-GCM).
  static const String vaultKek = '${namespace}vault_kek';

  /// Encrypted API key blob (base64) + iv + authTag, stored locally
  /// for offline use. The backend stores the same blob for restore.
  static const String vaultCipher = '${namespace}vault_cipher';
  static const String vaultIv = '${namespace}vault_iv';
  static const String vaultAuthTag = '${namespace}vault_auth_tag';
  static const String vaultProvider = '${namespace}vault_provider';
}

/// Thin wrapper around [FlutterSecureStorage] so the rest of the app
/// doesn't depend on the package directly and tests can swap it out.
class SecureStorageService {
  SecureStorageService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<String?> read(String key) => _storage.read(key: key);

  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  Future<void> delete(String key) => _storage.delete(key: key);

  Future<void> deleteAll() => _storage.deleteAll();

  Future<bool> containsKey(String key) => _storage.containsKey(key: key);
}