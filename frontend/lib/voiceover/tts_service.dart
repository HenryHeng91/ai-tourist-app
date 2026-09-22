import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../core/app_config.dart';
import 'voiceover_models.dart';

/// Text-to-speech with two strategies (design.md D3):
/// - **Provider TTS** (preferred): calls the user's AI provider's
///   `POST /audio/speech` endpoint with the decrypted key. High quality,
///   billed to the user's key (consistent BYOK). Returns audio bytes.
/// - **Platform-native TTS** (fallback): uses `flutter_tts` (iOS AVSpeech
///   / Android TextToSpeech). Free, offline-capable, lower quality.
///
/// The caller picks the strategy via [TtsStrategy]; the service handles
/// the rest. Audio bytes from the provider path are cached to disk by
/// [VoiceoverCache]; the native path speaks inline (no bytes).
class TtsService {
  TtsService({
    Dio? dio,
    String? providerBaseUrl,
    FlutterTts? nativeTts,
    this.providerModel = 'tts-1',
    this.providerVoice = 'alloy',
  })  : _dio = dio ?? Dio(),
        _providerBaseUrl = providerBaseUrl ?? AppConfig.defaultAiProviderBaseUrl,
        _nativeTts = nativeTts ?? FlutterTts();

  final Dio _dio;
  final String _providerBaseUrl;
  final FlutterTts _nativeTts;
  final String providerModel;
  final String providerVoice;

  /// Generates audio bytes via the provider's TTS endpoint. The bytes
  /// are MP3 (OpenAI default) — the audio controller writes them to
  /// disk for playback via `just_audio`.
  Future<List<int>> generateProviderAudio({
    required String transcript,
    required String apiKey,
    String format = 'mp3',
  }) async {
    final response = await _dio.post(
      '$_providerBaseUrl/audio/speech',
      options: Options(
        headers: {
          'Authorization': 'Bearer $apiKey',
          'Content-Type': 'application/json',
        },
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(seconds: 30),
      ),
      data: {
        'model': providerModel,
        'voice': providerVoice,
        'input': transcript,
        'response_format': format,
      },
    );
    // Dio with responseType=bytes returns List<int>.
    final data = response.data;
    if (data is List<int>) return data;
    if (data is Uint8List) return data.toList();
    throw StateError('Provider TTS returned unexpected body type: '
        '${data.runtimeType}');
  }

  /// Speaks [transcript] via the platform-native TTS engine. Returns
  /// true if the engine started speaking. The audio plays inline —
  /// there are no bytes to cache.
  Future<bool> speakNative(String transcript) async {
    await _nativeTts.setLanguage('en-US');
    await _nativeTts.setSpeechRate(0.5);
    final result = await _nativeTts.speak(transcript);
    return result == 1;
  }

  /// Stops native playback if in progress.
  Future<void> stopNative() async => _nativeTts.stop();

  /// True if the platform has a TTS engine available. Call before
  /// offering the native fallback in the UI.
  Future<bool> isNativeAvailable() async {
    final languages = await _nativeTts.getLanguages;
    return languages != null && (languages as List).isNotEmpty;
  }
}

/// Which TTS strategy to use for a given voiceover.
enum TtsStrategy {
  /// Provider TTS (OpenAI /audio/speech) — high quality, billed to user.
  provider,
  /// Platform-native (flutter_tts) — free, offline, lower quality.
  native,
}