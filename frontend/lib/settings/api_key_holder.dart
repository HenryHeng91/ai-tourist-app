import 'key_vault_service.dart';

/// In-memory holder for the decrypted API key. The key is decrypted
/// on app unlock (or when the user enters it) and cleared on
/// background/logout/lock — matches design.md §8.1 step 4 and
/// task 2.2.3.
///
/// This class is intentionally not a singleton — it's owned by a
/// Riverpod provider so its lifecycle is tied to the app scope.
class ApiKeyHolder {
  String? _plaintext;
  String? _fingerprint;

  /// True if a decrypted key is currently in memory.
  bool get hasKey => _plaintext != null && _plaintext!.isNotEmpty;

  /// The decrypted key, or null. Callers MUST NOT retain this reference
  /// beyond the immediate call site.
  String? get key => _plaintext;

  /// Short SHA-256 fingerprint, safe to display/log for debugging.
  String? get fingerprint => _fingerprint;

  /// Loads the decrypted key from the vault into memory.
  /// No-op if already loaded. Returns true if a key is now held.
  Future<bool> loadFromVault(KeyVaultService vault) async {
    if (hasKey) return true;
    final plaintext = await vault.decrypt();
    if (plaintext == null || plaintext.isEmpty) return false;
    _plaintext = plaintext;
    _fingerprint = keyFingerprint(plaintext);
    return true;
  }

  /// Stores a freshly-entered key (already encrypted by the caller).
  void setKey(String plaintext) {
    _plaintext = plaintext;
    _fingerprint = keyFingerprint(plaintext);
  }

  /// Clears the in-memory key. The encrypted blob remains in storage.
  void clear() {
    _plaintext = null;
    _fingerprint = null;
  }

  /// Returns the fingerprint for display, or null if no key is held.
  @override
  String toString() =>
      hasKey ? 'ApiKeyHolder(loaded, fp=$_fingerprint)' : 'ApiKeyHolder(empty)';
}