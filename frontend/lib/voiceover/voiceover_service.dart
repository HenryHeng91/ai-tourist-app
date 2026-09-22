import 'package:dio/dio.dart';

import '../core/app_config.dart';
import 'prompt_builder.dart';
import 'voiceover_models.dart';

/// Calls the user's AI provider (OpenAI-compatible) directly with the
/// in-memory decrypted key. The backend NEVER proxies this call
/// (REQ-AUTH-4 / NFR-SEC-1) — the key goes only to the user's chosen
/// provider endpoint.
///
/// The decrypted key is passed per-call (never stored on this object)
/// so a single instance can serve multiple users in tests and the key
/// is never retained beyond the request.
class VoiceoverService {
  VoiceoverService({
    Dio? dio,
    String? providerBaseUrl,
    PromptBuilder? promptBuilder,
    this.model = 'gpt-4o-mini',
  })  : _dio = dio ?? Dio(),
        _providerBaseUrl = providerBaseUrl ?? AppConfig.defaultAiProviderBaseUrl,
        _promptBuilder = promptBuilder ?? PromptBuilder();

  final Dio _dio;
  final String _providerBaseUrl;
  final PromptBuilder _promptBuilder;
  final String model;

  /// Generates a voiceover transcript for [req] by calling the
  /// provider's `POST /chat/completions` endpoint with the user's
  /// decrypted [apiKey]. Returns the transcript text.
  ///
  /// Throws [DioException] on network errors, or [StateError] if the
  /// provider response is malformed. The caller (voiceover provider)
  /// is responsible for catching and surfacing to the UI.
  Future<String> generateTranscript({
    required VoiceoverRequest req,
    required String apiKey,
  }) async {
    final messages = _promptBuilder.buildMessages(req);
    final response = await _dio.post(
      '$_providerBaseUrl/chat/completions',
      options: Options(
        headers: {
          'Authorization': 'Bearer $apiKey',
          'Content-Type': 'application/json',
        },
        receiveTimeout: const Duration(seconds: 30),
      ),
      data: {
        'model': model,
        'messages': messages,
        'temperature': 0.7,
        'max_tokens': 400,
      },
    );

    final data = response.data as Map<String, dynamic>;
    final choices = data['choices'] as List?;
    if (choices == null || choices.isEmpty) {
      throw StateError('AI provider returned no choices.');
    }
    final first = choices.first as Map<String, dynamic>;
    final message = first['message'] as Map<String, dynamic>;
    final content = message['content'] as String?;
    if (content == null || content.isEmpty) {
      throw StateError('AI provider returned an empty transcript.');
    }
    return content.trim();
  }
}