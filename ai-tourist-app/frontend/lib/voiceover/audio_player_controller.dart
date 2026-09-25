import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import 'voiceover_models.dart';

/// State machine for voiceover playback (REQ-AI-3: play/pause/stop/replay).
///
/// Wraps `just_audio`'s [AudioPlayer] and exposes a [VoiceoverPlayback]
/// state to the transcript widget. The state machine is:
///
///   idle → loading → playing ⇄ paused → stopped
///                       ↓
///                     error
///
/// `replay` is `stop` + `play` from position 0.
class AudioPlayerController extends StateNotifier<VoiceoverPlayback> {
  AudioPlayerController({AudioPlayer? player})
      : _player = player ?? AudioPlayer(),
        super(const VoiceoverPlayback());

  final AudioPlayer _player;

  // Stream subscriptions created by [_listenToPlayer]. Kept as fields so
  // we can cancel the previous subscription before creating a new one —
  // otherwise every play() call stacks another listener and we'd get
  // duplicate state updates (and a slow leak).
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<Duration?>? _durationSub;
  StreamSubscription<ProcessingState>? _processingSub;

  /// Loads audio bytes (provider TTS) and transitions to `playing`.
  Future<void> playBytes(List<int> bytes) async {
    state = state.copyWith(state: VoiceoverPlaybackState.loading, error: null);
    try {
      await _player.setAudioSource(
        AudioSource.uri(
          // just_audio accepts a data: URI for in-memory bytes.
          Uri.dataFromBytes(bytes, mimeType: 'audio/mpeg'),
        ),
      );
      _listenToPlayer();
      await _player.play();
      state = state.copyWith(state: VoiceoverPlaybackState.playing);
    } catch (e) {
      state = state.copyWith(
        state: VoiceoverPlaybackState.error,
        error: 'Could not play audio: $e',
      );
    }
  }

  /// Loads audio from a file path (cached voiceover) and plays.
  Future<void> playFile(String path) async {
    state = state.copyWith(state: VoiceoverPlaybackState.loading, error: null);
    try {
      await _player.setAudioSource(AudioSource.uri(Uri.file(path)));
      _listenToPlayer();
      await _player.play();
      state = state.copyWith(state: VoiceoverPlaybackState.playing);
    } catch (e) {
      state = state.copyWith(
        state: VoiceoverPlaybackState.error,
        error: 'Could not play audio file: $e',
      );
    }
  }

  /// Pauses playback. No-op if not playing.
  Future<void> pause() async {
    if (state.state != VoiceoverPlaybackState.playing) return;
    await _player.pause();
    state = state.copyWith(state: VoiceoverPlaybackState.paused);
  }

  /// Resumes from pause.
  Future<void> resume() async {
    if (state.state != VoiceoverPlaybackState.paused) return;
    await _player.play();
    state = state.copyWith(state: VoiceoverPlaybackState.playing);
  }

  /// Stops playback and resets position to 0.
  Future<void> stop() async {
    await _player.stop();
    state = state.copyWith(
      state: VoiceoverPlaybackState.stopped,
      positionMs: 0,
    );
  }

  /// Replays from the start. Equivalent to `stop` + `play`.
  Future<void> replay() async {
    await _player.seek(Duration.zero);
    await _player.play();
    state = state.copyWith(state: VoiceoverPlaybackState.playing);
  }

  /// Releases the underlying player. Call when the widget is disposed.
  @override
  void dispose() {
    _positionSub?.cancel();
    _durationSub?.cancel();
    _processingSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  void _listenToPlayer() {
    // Cancel any subscriptions left over from a previous play() call so
    // we never have more than one listener per stream at a time.
    _positionSub?.cancel();
    _durationSub?.cancel();
    _processingSub?.cancel();
    _positionSub = _player.positionStream.listen((pos) {
      state = state.copyWith(positionMs: pos.inMilliseconds);
    });
    _durationSub = _player.durationStream.listen((dur) {
      if (dur != null) {
        state = state.copyWith(durationMs: dur.inMilliseconds);
      }
    });
    _processingSub = _player.processingStateStream.listen((ps) {
      if (ps == ProcessingState.completed) {
        state = state.copyWith(
          state: VoiceoverPlaybackState.stopped,
          positionMs: state.durationMs,
        );
      }
    });
  }
}

final audioPlayerControllerProvider =
    StateNotifierProvider<AudioPlayerController, VoiceoverPlayback>(
  (ref) => AudioPlayerController(),
  name: 'audioPlayerControllerProvider',
);