/// Voiceover module data models.
library;

import '../location/location_models.dart';

/// Nearby amenities surfaced in the prompt. The prompt builder
/// enumerates these so the AI can mention concrete places.
class NearbyAmenity {
  const NearbyAmenity({
    required this.name,
    required this.type,
    this.distanceMeters,
  });

  /// 'restaurant' | 'toilet' | 'mart' | 'cafe' | 'atm' | 'pharmacy'
  final String name;
  final String type;
  final double? distanceMeters;

  Map<String, dynamic> toJson() => {
        'name': name,
        'type': type,
        if (distanceMeters != null) 'distanceMeters': distanceMeters,
      };
}

/// Input to the prompt builder. Carries everything the AI needs to
/// produce a rich voiceover: spot identity, user position, amenities.
class VoiceoverRequest {
  const VoiceoverRequest({
    required this.spotId,
    required this.spotName,
    required this.userPosition,
    this.spotCategory,
    this.spotDescription,
    this.amenities = const [],
    this.language = 'en',
  });

  final String spotId;
  final String spotName;
  final LatLng userPosition;

  /// 'landmark' | 'museum' | 'park' | 'temple' | 'monument' | …
  final String? spotCategory;
  final String? spotDescription;
  final List<NearbyAmenity> amenities;
  final String language;

  @override
  String toString() => 'VoiceoverRequest($spotId, $spotName, '
      'amenities: ${amenities.length})';
}

/// Result of a voiceover generation: transcript + audio bytes (or a
/// file path once cached).
class VoiceoverResult {
  const VoiceoverResult({
    required this.request,
    required this.transcript,
    this.audioBytes,
    this.audioFilePath,
    this.cached = false,
    this.createdAt,
  });

  final VoiceoverRequest request;
  final String transcript;

  /// In-memory audio (provider TTS returns bytes). Mutually exclusive
  /// with [audioFilePath] — see [VoiceoverCache] which writes bytes to
  /// disk and replaces this with a path.
  final List<int>? audioBytes;

  /// Path to the cached audio file in the app documents dir. Present
  /// after [VoiceoverCache.persist] runs.
  final String? audioFilePath;

  final bool cached;
  final DateTime? createdAt;

  bool get hasAudio => audioBytes != null || audioFilePath != null;

  VoiceoverResult copyWith({
    String? transcript,
    List<int>? audioBytes,
    String? audioFilePath,
    bool? cached,
    DateTime? createdAt,
  }) =>
      VoiceoverResult(
        request: request,
        transcript: transcript ?? this.transcript,
        audioBytes: audioBytes ?? this.audioBytes,
        audioFilePath: audioFilePath ?? this.audioFilePath,
        cached: cached ?? this.cached,
        createdAt: createdAt ?? this.createdAt,
      );

  @override
  String toString() => 'VoiceoverResult($spotName, transcript: '
      '${transcript.length} chars, audio: $hasAudio)';

  String get spotName => request.spotName;
}

/// Playback state machine for the audio controller.
enum VoiceoverPlaybackState { idle, loading, playing, paused, stopped, error }

/// Snapshot of the audio controller state for the transcript widget.
class VoiceoverPlayback {
  const VoiceoverPlayback({
    this.state = VoiceoverPlaybackState.idle,
    this.result,
    this.positionMs = 0,
    this.durationMs = 0,
    this.error,
  });

  final VoiceoverPlaybackState state;
  final VoiceoverResult? result;
  final int positionMs;
  final int durationMs;
  final String? error;

  bool get isPlaying => state == VoiceoverPlaybackState.playing;
  bool get isPaused => state == VoiceoverPlaybackState.paused;
  bool get isLoading => state == VoiceoverPlaybackState.loading;

  VoiceoverPlayback copyWith({
    VoiceoverPlaybackState? state,
    VoiceoverResult? result,
    int? positionMs,
    int? durationMs,
    String? error,
  }) =>
      VoiceoverPlayback(
        state: state ?? this.state,
        result: result ?? this.result,
        positionMs: positionMs ?? this.positionMs,
        durationMs: durationMs ?? this.durationMs,
        error: error,
      );
}