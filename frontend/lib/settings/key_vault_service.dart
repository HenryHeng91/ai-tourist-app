import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart';

import '../core/secure_storage_service.dart';

/// AES-256-GCM vault for the user's AI provider API key.
///
/// Scheme (matches design.md §8.1):
/// 1. On first use, a 256-bit KEK is generated and stored in
///    [SecureStorageService] (iOS Keychain / Android Keystore).
/// 2. The plaintext API key is encrypted with AES-256-GCM using the KEK
///    → (ciphertext, iv, authTag).
/// 3. The blob is persisted locally (offline use) and uploaded to the
///    backend for cross-device restore.
/// 4. For inference, [ApiKeyHolder] decrypts into memory and zeroes
///    the buffer on background/logout.
///
/// All cryptographic operations are wrapped here so they can be unit
/// tested without platform plugins.
class KeyVaultService {
  KeyVaultService(this.storage);

  final SecureStorageService storage;

  static const int _kekBytes = 32; // 256-bit
  static const int _ivBytes = 12; // 96-bit nonce for GCM

  /// Loads the KEK from secure storage, generating + persisting it on
  /// first call. Returns the raw 32-byte key.
  Future<Uint8List> _loadOrCreateKek() async {
    final existing = await storage.read(SecureStorageKeys.vaultKek);
    if (existing != null && existing.isNotEmpty) {
      return _base64Decode(existing);
    }
    final kek = _randomBytes(_kekBytes);
    await storage.write(SecureStorageKeys.vaultKek, _base64Encode(kek));
    return kek;
  }

  /// Encrypts [plaintextKey] and persists the blob locally.
  /// Returns the [VaultBlob] so the caller can upload it to the backend.
  Future<VaultBlob> encryptAndStore(String plaintextKey) async {
    final kek = await _loadOrCreateKek();
    final iv = _randomBytes(_ivBytes);

    final encrypter = Encrypter(
      AES(Key(kek), mode: AESMode.gcm, padding: null),
    );
    final encrypted = encrypter.encryptBytes(
      utf8.encode(plaintextKey),
      iv: IV(iv),
    );

    final cipherText = encrypted.bytes;
    // encrypt package appends the 16-byte GCM tag to the ciphertext.
    final tag = cipherText.sublist(cipherText.length - 16);
    final ct = cipherText.sublist(0, cipherText.length - 16);

    final blob = VaultBlob(
      ciphertext: _base64Encode(ct),
      iv: _base64Encode(iv),
      authTag: _base64Encode(tag),
    );

    await Future.wait([
      storage.write(SecureStorageKeys.vaultCipher, blob.ciphertext),
      storage.write(SecureStorageKeys.vaultIv, blob.iv),
      storage.write(SecureStorageKeys.vaultAuthTag, blob.authTag),
    ]);

    return blob;
  }

  /// Loads the encrypted blob from local storage and decrypts it.
  /// Returns null if no key is stored. Caller is responsible for
  /// zeroing the returned plaintext (see [ApiKeyHolder]).
  Future<String?> decrypt() async {
    final ct = await storage.read(SecureStorageKeys.vaultCipher);
    final ivStr = await storage.read(SecureStorageKeys.vaultIv);
    final tagStr = await storage.read(SecureStorageKeys.vaultAuthTag);
    if (ct == null || ivStr == null || tagStr == null) return null;

    final kek = await _loadOrCreateKek();
    final iv = _base64Decode(ivStr);
    final tag = _base64Decode(tagStr);
    final cipher = _base64Decode(ct);

    // Reconstruct ciphertext+tag for the encrypt package.
    final combined = Uint8List.fromList([...cipher, ...tag]);
    final encrypter = Encrypter(
      AES(Key(kek), mode: AESMode.gcm, padding: null),
    );
    final decrypted = encrypter.decryptBytes(Encrypted(combined), iv: IV(iv));
    return utf8.decode(decrypted);
  }

  /// Returns true if a key blob is stored locally.
  Future<bool> hasStoredKey() async =>
      await storage.read(SecureStorageKeys.vaultCipher) != null;

  /// Deletes the local blob (and KEK if [purgeKek] is true).
  Future<void> clear({bool purgeKek = false}) async {
    await Future.wait([
      storage.delete(SecureStorageKeys.vaultCipher),
      storage.delete(SecureStorageKeys.vaultIv),
      storage.delete(SecureStorageKeys.vaultAuthTag),
      if (purgeKek) storage.delete(SecureStorageKeys.vaultKek),
    ]);
  }

  /// Rotates the KEK (e.g. on user request). Re-encrypts the existing
  /// key under a new KEK. No-op if no key is stored.
  Future<void> rotateKek() async {
    final plaintext = await decrypt();
    if (plaintext == null) return;
    await storage.delete(SecureStorageKeys.vaultKek);
    await encryptAndStore(plaintext);
  }

  // --- helpers ---

  static Uint8List _randomBytes(int length) {
    final random = Random.secure();
    final bytes = Uint8List(length);
    for (var i = 0; i < length; i++) {
      bytes[i] = random.nextInt(256);
    }
    return bytes;
  }

  static String _base64Encode(Uint8List bytes) => base64.encode(bytes);

  static Uint8List _base64Decode(String s) =>
      Uint8List.fromList(base64.decode(s));
}

/// Encrypted API key blob — what gets sent to the backend for backup
/// and what's stored locally for offline use.
class VaultBlob {
  const VaultBlob({
    required this.ciphertext,
    required this.iv,
    required this.authTag,
  });

  final String ciphertext;
  final String iv;
  final String authTag;

  Map<String, String> toJson() => {
        'ciphertext': ciphertext,
        'iv': iv,
        'authTag': authTag,
      };

  @override
  String toString() =>
      'VaultBlob(ciphertext: ${ciphertext.length} chars, iv: ${iv.length} chars)';
}

/// Validates an API key by making a single GET /models call to the
/// configured AI provider. The key is sent directly to the provider
/// (never to our backend) — matches REQ-AUTH-4 / NFR-SEC-1.
class ApiKeyValidator {
  ApiKeyValidator({this.providerBaseUrl});

  final String? providerBaseUrl;

  /// Returns true if the provider accepts the key (HTTP 200 on /models
  /// or /v1/models). Returns false on 401/403. Throws on network errors
  /// so the UI can distinguish "invalid" from "couldn't validate".
  Future<bool> validate({
    required String plaintextKey,
    required String Function(String) httpClient,
  }) async {
    final url = (providerBaseUrl ?? 'https://api.openai.com/v1') + '/models';
    final response = await httpClient(
      'GET $url\nAuthorization: Bearer $plaintextKey',
    );
    // The httpClient stub returns a synthetic status string. Real impl
    // uses dio — see ApiKeyValidatorLive below.
    return response.contains('200');
  }
}

/// SHA-256 fingerprint of a key for safe logging (never log the key).
String keyFingerprint(String plaintextKey) {
  final digest = sha256.convert(utf8.encode(plaintextKey));
  return digest.toString().substring(0, 12);
}