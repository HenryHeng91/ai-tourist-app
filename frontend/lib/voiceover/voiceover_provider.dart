import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../settings/api_key_holder.dart';
import '../settings/settings_providers.dart';
import 'audio_player_controller.dart';
import 'prompt_builder.dart';
import 'tts_service.dart';
import 'voiceover_cache.dart';
import 'voiceover_models.dart';
import 'voiceover_service.dart';

final promptBuilderProvider = Provider<PromptBuilder>(
  (ref) => PromptBuilder(),
  name: 'promptBuilderProvider',
);

final voiceoverServiceProvider = Provider<VoiceoverService>(
  (ref) => VoiceoverService(
    dio: ref.watch(aiProviderDioProvider),
    promptBuilder: ref.watch(promptBuilderProvider),
  ),
  name: 'voiceoverServiceProvider',
);

final ttsServiceProvider = Provider<TtsService>(
  (ref) => TtsService(dio: ref.watch(aiProviderDioProvider)),
  name: 'ttsServiceProvider',
);

final voiceoverCacheProvider = Provider<VoiceoverCache>(
  (ref) => VoiceoverCache(),
  name: 'voiceoverCacheProvider',
);

/// Notifier that orchestrates the full voiceover flow:
///   1. Build prompt (PromptBuilder)
///   2. Check cache → if hit, skip to step 5
///   3. Call AI provider (VoiceoverService) with decrypted key
///   4. TTS (TtsService) → audio bytes
///   5. Persist to cache (VoiceoverCache)
///   6. Hand to AudioPlayerController for playback
///
/// The decrypted API key is read from [ApiKeyHolder] (in-memory, never
/// persisted) — if the holder is empty, the flow aborts with an error
/// pointing the user to settings.
class VoiceoverNotifier extends StateNotifier<VoiceoverPlayback> {
  VoiceoverNotifier(
    this._ai,
    this._tts,
    this._cache,
    this._keyHolder,
    this._player,
  ) : super(const VoiceoverPlayback());

  final VoiceoverService _ai;
  final TtsService _tts;
  final VoiceoverCache _cache;
  final ApiKeyHolder _keyHolder;
  final AudioPlayerController _player;

  /// Runs the full flow for [req] with the given [strategy]. Idempotent
  /// for the same request while a flow is in-flight.
  Future<VoiceoverResult?> generateAndPlay({
    required VoiceoverRequest req,
    TtsStrategy strategy = TtsStrategy.provider,
  }) async {
    if (state.isLoading) return null;

    state = state.copyWith(
      state: VoiceoverPlaybackState.loading,
      error: null,
      positionMs: 0,
    );

    // 1. Cache hit?
    try {
      final cachedTranscript = await _cache.readTranscript(req);
      final cachedAudio = await _cache.readAudioPath(req);
      if (cachedTranscript != null) {
        final result = VoiceoverResult(
          request: req,
          transcript: cachedTranscript,
          audioFilePath: cachedAudio,
          cached: true,
        );
        state = state.copyWith(result: result);
        await _play(result);
        return result;
      }
    } catch (_) {
      // Cache read failure is non-fatal — fall through to generation.
    }

    // 2. Need the decrypted key for AI + provider TTS.
    final apiKey = _keyHolder.key;
    if (apiKey == null || apiKey.isEmpty) {
      state = state.copyWith(
        state: VoiceoverPlaybackState.error,
        error: 'No API key. Add your AI provider key in Settings.',
      );
      return null;
    }

    // 3. Generate transcript.
    try {
      final transcript = await _ai.generateTranscript(
        req: req,
        apiKey: apiKey,
      );
      var result = VoiceoverResult(
        request: req,
        transcript: transcript,
        createdAt: DateTime.now(),
      );

      // 4. TTS (provider path only — native speaks inline).
      if (strategy == TtsStrategy.provider) {
        final bytes = await _tts.generateProviderAudio(
          transcript: transcript,
          apiKey: apiKey,
        );
        result = result.copyWith(audioBytes: bytes);
      }

      // 5. Persist to cache.
      result = await _cache.persist(result);

      // 6. Play.
      state = state.copyWith(result: result);
      await _play(result, strategy: strategy);
      return result;
    } catch (e) {
      state = state.copyWith(
        state: VoiceoverPlaybackState.error,
        error: 'Voiceover failed: $e',
      );
      return null;
    }
  }

  Future<void> _play(VoiceoverResult result,
      {TtsStrategy strategy = TtsStrategy.provider}) async {
    if (strategy == TtsStrategy.native) {
      await _tts.speakNative(result.transcript);
      state = state.copyWith(state: VoiceoverPlaybackState.playing);
      return;
    }
    if (result.audioFilePath != null) {
      await _player.playFile(result.audioFilePath!);
    } else if (result.audioBytes != null) {
      await _player.playBytes(result.audioBytes!);
    } else {
      // No audio (e.g. cache hit without audio) — just show transcript.
      state = state.copyWith(state: VoiceoverPlaybackState.idle);
    }
    // Mirror player state into our state.
    state = state.copyWith(state: _player.state.state);
  }

  // --- passthrough controls (REQ-AI-3) ---

  Future<void> pause() async {
    await _player.pause();
    state = state.copyWith(state: _player.state.state);
  }

  Future<void> resume() async {
    await _player.resume();
    state = state.copyWith(state: _player.state.state);
  }

  Future<void> stop() async {
    await _player.stop();
    await _tts.stopNative();
    state = state.copyWith(state: VoiceoverPlaybackState.stopped);
  }

  Future<void> replay() async {
    await _player.replay();
    state = state.copyWith(state: VoiceoverPlaybackState.playing);
  }
}

final voiceoverNotifierProvider =
    StateNotifierProvider<VoiceoverNotifier, VoiceoverPlayback>(
  (ref) => VoiceoverNotifier(
    ref.watch(voiceoverServiceProvider),
    ref.watch(ttsServiceProvider),
    ref.watch(voiceoverCacheProvider),
    ref.watch(apiKeyHolderProvider),
    ref.watch(audioPlayerControllerProvider.notifier),
  ),
  name: 'voiceoverNotifierProvider',
);