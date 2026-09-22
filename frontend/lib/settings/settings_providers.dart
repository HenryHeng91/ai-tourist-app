import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_models.dart';
import '../auth/auth_providers.dart';
import '../core/secure_storage_service.dart';
import 'api_key_holder.dart';
import 'api_key_validator_live.dart';
import 'key_vault_service.dart';

final keyVaultServiceProvider = Provider<KeyVaultService>(
  (ref) => KeyVaultService(ref.watch(secureStorageProvider)),
  name: 'keyVaultServiceProvider',
);

final apiKeyValidatorProvider = Provider<ApiKeyValidatorLive>(
  (ref) => ApiKeyValidatorLive(),
  name: 'apiKeyValidatorProvider',
);

final apiKeyHolderProvider = Provider<ApiKeyHolder>(
  (ref) => ApiKeyHolder(),
  name: 'apiKeyHolderProvider',
);

/// Dio instance that talks to the user's AI provider directly (NOT our
/// backend). Used by the voiceover module for inference. The bearer
/// token is injected per-request from [ApiKeyHolder] — never baked in.
final aiProviderDioProvider = Provider<Dio>(
  (ref) => Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 60),
    ),
  ),
  name: 'aiProviderDioProvider',
);

/// Notifier for the settings/API-key UI.
class ApiKeyVaultNotifier extends StateNotifier<ApiKeyVaultState> {
  ApiKeyVaultNotifier(this._vault, this._validator, this._holder)
      : super(const ApiKeyVaultState());

  final KeyVaultService _vault;
  final ApiKeyValidatorLive _validator;
  final ApiKeyHolder _holder;

  /// On init, check if a key is stored and load it into memory.
  Future<void> bootstrap() async {
    final hasKey = await _vault.hasStoredKey();
    if (!hasKey) {
      state = const ApiKeyVaultState();
      return;
    }
    final loaded = await _holder.loadFromVault(_vault);
    state = ApiKeyVaultState(
      hasKey: true,
      validationStatus: loaded
          ? ApiKeyValidationStatus.valid
          : ApiKeyValidationStatus.unknown,
      provider: 'openai',
    );
  }

  /// Validates, encrypts, and stores the user-supplied key.
  Future<void> saveKey(String plaintextKey) async {
    state = state.copyWith(
      validationStatus: ApiKeyValidationStatus.validating,
      errorMessage: null,
    );

    try {
      final isValid = await _validator.validate(plaintextKey);
      if (!isValid) {
        state = state.copyWith(
          validationStatus: ApiKeyValidationStatus.invalid,
          errorMessage: 'The API key was rejected by the provider.',
        );
        return;
      }

      await _vault.encryptAndStore(plaintextKey);
      _holder.setKey(plaintextKey);
      state = ApiKeyVaultState(
        hasKey: true,
        validationStatus: ApiKeyValidationStatus.valid,
        provider: 'openai',
        lastValidatedAt: DateTime.now().toIso8601String(),
      );
    } catch (e) {
      state = state.copyWith(
        validationStatus: ApiKeyValidationStatus.unknown,
        errorMessage: 'Could not validate the key: $e',
      );
    }
  }

  /// Re-validates the currently-stored key (without re-entering it).
  Future<void> revalidate() async {
    if (!_holder.hasKey) {
      await _holder.loadFromVault(_vault);
    }
    final key = _holder.key;
    if (key == null) {
      state = state.copyWith(
        validationStatus: ApiKeyValidationStatus.unknown,
        errorMessage: 'No key stored.',
      );
      return;
    }

    state = state.copyWith(
      validationStatus: ApiKeyValidationStatus.validating,
      errorMessage: null,
    );
    try {
      final isValid = await _validator.validate(key);
      state = state.copyWith(
        validationStatus: isValid
            ? ApiKeyValidationStatus.valid
            : ApiKeyValidationStatus.invalid,
        lastValidatedAt: DateTime.now().toIso8601String(),
        errorMessage: isValid ? null : 'The stored key is no longer valid.',
      );
    } catch (e) {
      state = state.copyWith(
        validationStatus: ApiKeyValidationStatus.unknown,
        errorMessage: 'Could not validate: $e',
      );
    }
  }

  /// Deletes the stored key and clears memory.
  Future<void> deleteKey() async {
    await _vault.clear();
    _holder.clear();
    state = const ApiKeyVaultState();
  }

  /// Clears the in-memory key (e.g. on app background). The encrypted
  /// blob stays in storage for next unlock.
  void clearFromMemory() {
    _holder.clear();
  }
}

final apiKeyVaultNotifierProvider =
    StateNotifierProvider<ApiKeyVaultNotifier, ApiKeyVaultState>(
  (ref) => ApiKeyVaultNotifier(
    ref.watch(keyVaultServiceProvider),
    ref.watch(apiKeyValidatorProvider),
    ref.watch(apiKeyHolderProvider),
  ),
  name: 'apiKeyVaultNotifierProvider',
);