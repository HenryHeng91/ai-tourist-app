import 'package:dio/dio.dart';

import '../core/app_config.dart';
import 'key_vault_service.dart';

/// Live [ApiKeyValidator] that calls the AI provider's /models endpoint
/// with the user's key. The key goes ONLY to the user's chosen provider,
/// never to our backend (REQ-AUTH-4 / NFR-SEC-1).
class ApiKeyValidatorLive {
  ApiKeyValidatorLive({Dio? dio, String? providerBaseUrl})
      : _dio = dio ?? Dio(),
        _providerBaseUrl =
            providerBaseUrl ?? AppConfig.defaultAiProviderBaseUrl;

  final Dio _dio;
  final String _providerBaseUrl;

  /// Returns true if the provider accepts the key.
  Future<bool> validate(String plaintextKey) async {
    try {
      final response = await _dio.get(
        '$_providerBaseUrl/models',
        options: Options(
          headers: {'Authorization': 'Bearer $plaintextKey'},
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      return response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) return false;
      rethrow;
    }
  }
}