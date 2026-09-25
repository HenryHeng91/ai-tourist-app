import 'package:flutter_test/flutter_test.dart';

import 'package:ai_tourist_app/location/location_models.dart';
import 'package:ai_tourist_app/voiceover/voiceover_models.dart';

void main() {
  group('VoiceoverRequest', () {
    test('carries spot + position + amenities', () {
      const req = VoiceoverRequest(
        spotId: 's1',
        spotName: 'Tower',
        userPosition: LatLng(latitude: 1, longitude: 2),
        spotCategory: 'landmark',
        amenities: [
          NearbyAmenity(name: 'Cafe', type: 'restaurant'),
        ],
      );
      expect(req.spotId, 's1');
      expect(req.spotName, 'Tower');
      expect(req.spotCategory, 'landmark');
      expect(req.amenities.length, 1);
      expect(req.language, 'en'); // default
    });
  });

  group('VoiceoverResult', () {
    test('hasAudio is true when audioBytes present', () {
      final r = VoiceoverResult(
        request: _req(),
        transcript: 'hi',
        audioBytes: [1, 2, 3],
      );
      expect(r.hasAudio, isTrue);
    });

    test('hasAudio is true when audioFilePath present', () {
      final r = VoiceoverResult(
        request: _req(),
        transcript: 'hi',
        audioFilePath: '/tmp/a.mp3',
      );
      expect(r.hasAudio, isTrue);
    });

    test('hasAudio is false when neither present', () {
      final r = VoiceoverResult(
        request: _req(),
        transcript: 'hi',
      );
      expect(r.hasAudio, isFalse);
    });

    test('copyWith merges fields', () {
      final r = VoiceoverResult(
        request: _req(),
        transcript: 'hi',
        audioBytes: [1],
      );
      final updated = r.copyWith(audioBytes: null, audioFilePath: '/p.mp3');
      expect(updated.audioBytes, isNull);
      expect(updated.audioFilePath, '/p.mp3');
      expect(updated.transcript, 'hi'); // preserved
    });

    test('cached flag defaults to false', () {
      final r = VoiceoverResult(
        request: _req(),
        transcript: 'hi',
      );
      expect(r.cached, isFalse);
    });
  });

  group('VoiceoverPlayback', () {
    test('default is idle', () {
      const p = VoiceoverPlayback();
      expect(p.state, VoiceoverPlaybackState.idle);
      expect(p.isPlaying, isFalse);
      expect(p.isPaused, isFalse);
      expect(p.isLoading, isFalse);
      expect(p.positionMs, 0);
      expect(p.durationMs, 0);
    });

    test('isPlaying true only in playing state', () {
      const p = VoiceoverPlayback(state: VoiceoverPlaybackState.playing);
      expect(p.isPlaying, isTrue);
      expect(p.isPaused, isFalse);
    });

    test('isPaused true only in paused state', () {
      const p = VoiceoverPlayback(state: VoiceoverPlaybackState.paused);
      expect(p.isPaused, isTrue);
      expect(p.isPlaying, isFalse);
    });

    test('isLoading true only in loading state', () {
      const p = VoiceoverPlayback(state: VoiceoverPlaybackState.loading);
      expect(p.isLoading, isTrue);
    });

    test('copyWith merges fields', () {
      const p = VoiceoverPlayback(positionMs: 100, durationMs: 1000);
      final updated = p.copyWith(positionMs: 200);
      expect(updated.positionMs, 200);
      expect(updated.durationMs, 1000); // preserved
    });
  });

  group('VoiceoverPlaybackState', () {
    test('has all 6 states', () {
      expect(VoiceoverPlaybackState.values.length, 6);
    });
  });
}

VoiceoverRequest _req() => const VoiceoverRequest(
      spotId: 's1',
      spotName: 'S',
      userPosition: LatLng(latitude: 0, longitude: 0),
    );